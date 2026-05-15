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

/** Either party counters with a new set of terms. */
export async function counterOffer(args: {
  leaseId: string;
  proposedBy: string;     // user id of whoever is countering
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

  // Stamp lease-level timestamps + try activation.
  const stamp =
    args.role === "landlord"
      ? { landlord_signed_at: new Date().toISOString() }
      : { tenant_signed_at: new Date().toISOString() };
  await supabase.from("leases").update(stamp).eq("id", args.leaseId);

  // Count sigs on this version; if both present, flip to active.
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

/** Decline / withdraw an open offer. */
export async function declineOffer(leaseId: string, reason?: string) {
  await supabase.from("leases").update({ status: "rejected", end_reason: reason ?? null }).eq("id", leaseId);
  await logEvent(leaseId, "declined", { reason });
}

/** End an active lease (mutual, tenant notice, landlord ground, etc.). */
export async function terminateLease(leaseId: string, reason: string) {
  const { error } = await supabase
    .from("leases")
    .update({ status: "terminated", end_reason: reason })
    .eq("id", leaseId);
  if (error) throw error;
  await logEvent(leaseId, "terminated", { reason });
}
