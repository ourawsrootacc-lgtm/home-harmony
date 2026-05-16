import { supabase } from "@/lib/supabase";

export type LeaseTerms = {
  monthly_rent: number;
  deposit: number;
  start_date: string;        // YYYY-MM-DD
  end_date: string;          // YYYY-MM-DD
  notice_period_days: number;
  late_fee_pct: number;
  escalation_pct: number;
  utilities_paid_by: "tenant" | "landlord" | "shared";
  pets_allowed: boolean;
  sublet_allowed: boolean;
  lock_in_months: number;
  province: string;
  notes?: string;
};

export type TerminationGround =
  | "mutual_agreement"
  | "tenant_notice"
  | "landlord_notice"
  | "non_payment"
  | "material_breach"
  | "personal_bona_fide_need"
  | "end_of_term"
  | "property_unfit";

export const TERMINATION_GROUND_LABELS: Record<TerminationGround, string> = {
  mutual_agreement: "Mutual agreement",
  tenant_notice: "Tenant's notice to vacate",
  landlord_notice: "Landlord's notice",
  non_payment: "Non-payment of rent (≥2 months)",
  material_breach: "Material breach of terms",
  personal_bona_fide_need: "Landlord's bona-fide personal need",
  end_of_term: "End of term, not renewed",
  property_unfit: "Property became unfit for use",
};

/** Canonical JSON: deterministic key order so hashes are reproducible. */
export function canonicalTerms(t: LeaseTerms): string {
  const keys = Object.keys(t).sort() as (keyof LeaseTerms)[];
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k as string] = (t as any)[k] ?? null;
  return JSON.stringify(obj);
}

/** SHA-256 hex of canonical terms (Web Crypto, available in modern browsers). */
export async function hashTerms(t: LeaseTerms): Promise<string> {
  const buf = new TextEncoder().encode(canonicalTerms(t));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function logEvent(leaseId: string, kind: string, payload: Record<string, unknown> = {}) {
  await supabase.from("lease_events").insert({ lease_id: leaseId, kind, payload });
}

/* ------------------------------------------------------------------ */
/* Initial lifecycle (creation / counter / sign)                       */
/* ------------------------------------------------------------------ */

/** Landlord sends the first formal offer for an application. */
export async function sendInitialOffer(args: {
  applicationId: string;
  propertyId: string;
  landlordId: string;
  tenantId: string;
  terms: LeaseTerms;
}) {
  const hash = await hashTerms(args.terms);

  const { data: lease, error: leaseErr } = await supabase
    .from("leases")
    .insert({
      property_id: args.propertyId,
      landlord_id: args.landlordId,
      tenant_id: args.tenantId,
      application_id: args.applicationId,
      start_date: args.terms.start_date,
      end_date: args.terms.end_date,
      monthly_rent: args.terms.monthly_rent,
      deposit: args.terms.deposit,
      notice_period_days: args.terms.notice_period_days,
      late_fee_pct: args.terms.late_fee_pct,
      escalation_pct: args.terms.escalation_pct,
      utilities_paid_by: args.terms.utilities_paid_by,
      pets_allowed: args.terms.pets_allowed,
      sublet_allowed: args.terms.sublet_allowed,
      lock_in_months: args.terms.lock_in_months,
      province: args.terms.province,
      notes: args.terms.notes ?? null,
      status: "proposed",
    })
    .select()
    .single();
  if (leaseErr || !lease) throw leaseErr ?? new Error("Lease insert failed");

  const { data: version, error: vErr } = await supabase
    .from("lease_versions")
    .insert({
      lease_id: lease.id,
      terms: args.terms as any,
      terms_hash: hash,
      proposed_by: args.landlordId,
    })
    .select()
    .single();
  if (vErr || !version) throw vErr ?? new Error("Version insert failed");

  await supabase.from("leases").update({ current_version_id: version.id }).eq("id", lease.id);
  await supabase.from("applications")
    .update({ status: "offer_sent" }).eq("id", args.applicationId);
  await logEvent(lease.id, "offer_sent", { version_id: version.id, hash });

  return { lease, version };
}

/** Either party counters with a new set of terms (pre-activation only). */
export async function counterOffer(args: {
  leaseId: string;
  proposedBy: string;
  prevVersionId: string;
  terms: LeaseTerms;
}) {
  const hash = await hashTerms(args.terms);
  const { data: version, error } = await supabase
    .from("lease_versions")
    .insert({
      lease_id: args.leaseId,
      prev_version_id: args.prevVersionId,
      terms: args.terms as any,
      terms_hash: hash,
      proposed_by: args.proposedBy,
    })
    .select()
    .single();
  if (error || !version) throw error ?? new Error("Counter insert failed");

  await supabase.from("leases")
    .update({
      current_version_id: version.id,
      status: "countered",
      monthly_rent: args.terms.monthly_rent,
      deposit: args.terms.deposit,
      start_date: args.terms.start_date,
      end_date: args.terms.end_date,
      notice_period_days: args.terms.notice_period_days,
      late_fee_pct: args.terms.late_fee_pct,
      escalation_pct: args.terms.escalation_pct,
      utilities_paid_by: args.terms.utilities_paid_by,
      pets_allowed: args.terms.pets_allowed,
      sublet_allowed: args.terms.sublet_allowed,
      lock_in_months: args.terms.lock_in_months,
      province: args.terms.province,
      notes: args.terms.notes ?? null,
    })
    .eq("id", args.leaseId);

  await logEvent(args.leaseId, "countered", { version_id: version.id, hash });
  return version;
}

/** A party signs the CURRENT version. When both have signed → activate. */
export async function signCurrentVersion(args: {
  leaseId: string;
  versionId: string;
  termsHash: string;
  userId: string;
  role: "landlord" | "tenant";
}) {
  const { error } = await supabase.from("lease_signatures").insert({
    lease_version_id: args.versionId,
    user_id: args.userId,
    role: args.role,
    terms_hash: args.termsHash,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    otp_verified_at: new Date().toISOString(), // placeholder until real OTP is wired
  });
  if (error) throw error;

  await logEvent(args.leaseId, "signed", { version_id: args.versionId, role: args.role });

  const stamp =
    args.role === "landlord"
      ? { landlord_signed_at: new Date().toISOString() }
      : { tenant_signed_at: new Date().toISOString() };
  await supabase.from("leases").update(stamp).eq("id", args.leaseId);

  const { data: sigs } = await supabase
    .from("lease_signatures")
    .select("role")
    .eq("lease_version_id", args.versionId);
  const roles = new Set((sigs ?? []).map((s) => s.role));
  if (roles.has("landlord") && roles.has("tenant")) {
    const { error: actErr } = await supabase
      .from("leases")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", args.leaseId);
    if (actErr) throw actErr;
  }
}

/** Decline / withdraw a pre-activation offer. */
export async function declineOffer(leaseId: string, reason?: string) {
  await supabase.from("leases").update({ status: "rejected", end_reason: reason ?? null }).eq("id", leaseId);
  await logEvent(leaseId, "declined", { reason });
}

/* ------------------------------------------------------------------ */
/* Mutual change requests (active-lease lifecycle)                     */
/* ------------------------------------------------------------------ */

export type LeaseRequest = {
  id: string;
  lease_id: string;
  kind: "amendment" | "extension" | "renewal" | "termination";
  status: "pending" | "accepted" | "declined" | "countered" | "withdrawn" | "superseded";
  requested_by: string;
  proposed_terms: LeaseTerms | null;
  new_end_date: string | null;
  effective_date: string | null;
  ground: TerminationGround | null;
  ground_details: string | null;
  notice_served_at: string;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
};

export async function requestAmendment(args: {
  leaseId: string;
  by: string;
  proposedTerms: LeaseTerms;
  notes?: string;
}) {
  const { error } = await supabase.from("lease_requests").insert({
    lease_id: args.leaseId,
    kind: "amendment",
    requested_by: args.by,
    proposed_terms: args.proposedTerms as any,
    ground_details: args.notes ?? null,
  });
  if (error) throw error;
}

export async function requestExtension(args: {
  leaseId: string;
  by: string;
  newEndDate: string;
  notes?: string;
}) {
  const { error } = await supabase.from("lease_requests").insert({
    lease_id: args.leaseId,
    kind: "extension",
    requested_by: args.by,
    new_end_date: args.newEndDate,
    ground_details: args.notes ?? null,
  });
  if (error) throw error;
}

export async function requestRenewal(args: {
  leaseId: string;
  by: string;
  proposedTerms: LeaseTerms;
  notes?: string;
}) {
  const { error } = await supabase.from("lease_requests").insert({
    lease_id: args.leaseId,
    kind: "renewal",
    requested_by: args.by,
    proposed_terms: args.proposedTerms as any,
    new_end_date: args.proposedTerms.end_date,
    ground_details: args.notes ?? null,
  });
  if (error) throw error;
}

export async function serveTerminationNotice(args: {
  leaseId: string;
  by: string;
  ground: TerminationGround;
  effectiveDate: string;     // YYYY-MM-DD
  groundDetails?: string;
}) {
  const { error } = await supabase.from("lease_requests").insert({
    lease_id: args.leaseId,
    kind: "termination",
    requested_by: args.by,
    ground: args.ground,
    effective_date: args.effectiveDate,
    ground_details: args.groundDetails ?? null,
  });
  if (error) throw error;
}

export async function respondToRequest(args: {
  requestId: string;
  decision: "accepted" | "declined";
}) {
  const { error } = await supabase
    .from("lease_requests")
    .update({ status: args.decision })
    .eq("id", args.requestId);
  if (error) throw error;
}

export async function withdrawRequest(requestId: string) {
  const { error } = await supabase
    .from("lease_requests")
    .update({ status: "withdrawn" })
    .eq("id", requestId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Statutory minimum effective date (today + notice_period_days). */
export function minEffectiveDate(noticePeriodDays: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + (noticePeriodDays || 30));
  return d.toISOString().slice(0, 10);
}

/** Lock-in penalty per common Pakistani residential practice. */
export function computeLockInPenalty(args: {
  monthlyRent: number;
  lockInMonths: number;
  activatedAt: string | null;
  effectiveDate: string;
}): number {
  if (!args.lockInMonths || !args.activatedAt) return 0;
  const start = new Date(args.activatedAt);
  const end = new Date(args.effectiveDate);
  const monthsServed =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const remaining = Math.max(0, args.lockInMonths - monthsServed);
  return remaining * args.monthlyRent;
}

/**
 * Deprecated: do not call directly. Kept only for admin / migration use.
 * The UI MUST go through `serveTerminationNotice` + counter-party accept.
 */
export async function terminateLease(leaseId: string, reason: string) {
  const { error } = await supabase
    .from("leases")
    .update({ status: "terminated", end_reason: reason })
    .eq("id", leaseId);
  if (error) throw error;
  await logEvent(leaseId, "terminated_unilateral_legacy", { reason });
}
