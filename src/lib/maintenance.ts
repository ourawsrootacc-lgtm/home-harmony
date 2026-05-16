/**
 * Maintenance lifecycle helpers — Phase 1.
 *
 * Mirrors the DB state machine in `20260517120000_maintenance_lifecycle.sql`.
 * Use these helpers from UI code so transitions and fairness rules stay
 * consistent across tenant / landlord / technician / admin surfaces.
 */
import { supabase } from "@/lib/supabase";

// ---- State machine ---------------------------------------------------------

export type TicketStatus =
  | "open"           // legacy alias for submitted
  | "submitted"
  | "triaged"
  | "dispatched"
  | "quoted"
  | "counter_quote"
  | "scheduled"
  | "reschedule_requested"
  | "in_progress"
  | "work_done"
  | "resolved"       // legacy alias for work_done
  | "tenant_verified"
  | "disputed"
  | "closed"
  | "cancelled";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Submitted",
  submitted: "Submitted",
  triaged: "Triaged",
  dispatched: "Dispatched",
  quoted: "Quote received",
  counter_quote: "Counter-quote",
  scheduled: "Scheduled",
  reschedule_requested: "Reschedule requested",
  in_progress: "In progress",
  work_done: "Work done",
  resolved: "Work done",
  tenant_verified: "Verified by tenant",
  disputed: "Disputed",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const TERMINAL_STATUSES: TicketStatus[] = ["closed", "cancelled"];

// SLA targets, in hours from ticket creation to first dispatch
export const SLA_HOURS: Record<"high" | "medium" | "low", number> = {
  high: 24,
  medium: 72,
  low: 168,
};

// Tenant has 72h to verify after work_done before auto-verify
export const AUTO_VERIFY_HOURS = 72;
// Free cancellation window before scheduled_start_at
export const FREE_CANCEL_HOURS = 24;
// Cancellation fee percentage when cancelling inside the free window
export const LATE_CANCEL_FEE_PCT = 10;
// Technicians below this rolling average drop out of the dispatch pool
export const MIN_TECH_RATING = 3.0;

// ---- Quotes ----------------------------------------------------------------

export type QuoteRole = "technician" | "tenant" | "landlord";
export type QuoteStatus =
  | "pending" | "accepted" | "countered" | "declined" | "withdrawn" | "superseded";

export interface MaintenanceQuote {
  id: string;
  ticket_id: string;
  technician_id: string;
  parent_quote_id: string | null;
  created_by: string;
  created_by_role: QuoteRole;
  price: number;
  currency: string;
  scope: string;
  proposed_start_at: string;
  proposed_end_at: string;
  notes: string | null;
  is_change_order: boolean;
  status: QuoteStatus;
  responded_at: string | null;
  created_at: string;
}

export interface NewQuoteInput {
  ticket_id: string;
  technician_id: string;
  price: number;
  scope: string;
  proposed_start_at: string;     // ISO timestamp
  proposed_end_at: string;
  notes?: string;
  created_by_role: QuoteRole;
  parent_quote_id?: string;
  is_change_order?: boolean;
}

export async function submitQuote(input: NewQuoteInput) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  return supabase.from("maintenance_quotes").insert({
    ...input,
    created_by: user.id,
    currency: "PKR",
  }).select().single();
}

export async function respondToQuote(
  quoteId: string,
  action: "accepted" | "declined" | "withdrawn"
) {
  return supabase.from("maintenance_quotes")
    .update({ status: action })
    .eq("id", quoteId)
    .select()
    .single();
}

/**
 * Counter a quote by creating a new quote that references the original.
 * The DB trigger marks the parent as superseded once this one is accepted.
 */
export async function counterQuote(
  parent: MaintenanceQuote,
  changes: Partial<Pick<NewQuoteInput, "price" | "proposed_start_at" | "proposed_end_at" | "scope" | "notes">>,
  role: QuoteRole
) {
  return submitQuote({
    ticket_id: parent.ticket_id,
    technician_id: parent.technician_id,
    parent_quote_id: parent.id,
    created_by_role: role,
    price: changes.price ?? parent.price,
    scope: changes.scope ?? parent.scope,
    proposed_start_at: changes.proposed_start_at ?? parent.proposed_start_at,
    proposed_end_at: changes.proposed_end_at ?? parent.proposed_end_at,
    notes: changes.notes,
  });
}

// ---- Dispatch (broadcast first-accept-wins) --------------------------------

export interface DispatchOptions {
  ticketId: string;
  technicianIds: string[];
  expiresInHours?: number;
}

export async function dispatchTicket({ ticketId, technicianIds, expiresInHours = 24 }: DispatchOptions) {
  const expires_at = new Date(Date.now() + expiresInHours * 3600_000).toISOString();
  const rows = technicianIds.map((tid) => ({
    ticket_id: ticketId, technician_id: tid, expires_at,
  }));
  const ins = await supabase.from("maintenance_assignments").insert(rows);
  if (ins.error) return ins;
  return supabase.from("maintenance_tickets")
    .update({ status: "dispatched" })
    .eq("id", ticketId);
}

export async function respondToAssignment(
  assignmentId: string,
  response: "accepted" | "declined",
  decline_reason?: string
) {
  return supabase.from("maintenance_assignments")
    .update({ response, decline_reason: decline_reason ?? null })
    .eq("id", assignmentId)
    .select()
    .single();
}

// ---- Lifecycle transitions -------------------------------------------------

export async function checkInTechnician(ticketId: string) {
  return supabase.from("maintenance_tickets")
    .update({ status: "in_progress", checked_in_at: new Date().toISOString() })
    .eq("id", ticketId);
}

export async function markWorkDone(ticketId: string, afterPhotos: string[]) {
  if (!afterPhotos.length) throw new Error("At least one after-photo is required");
  const now = new Date();
  return supabase.from("maintenance_tickets")
    .update({
      status: "work_done",
      work_done_at: now.toISOString(),
      auto_verify_at: new Date(now.getTime() + AUTO_VERIFY_HOURS * 3600_000).toISOString(),
      after_photos: afterPhotos,
    })
    .eq("id", ticketId);
}

export async function verifyWork(ticketId: string) {
  return supabase.from("maintenance_tickets")
    .update({
      status: "tenant_verified",
      tenant_verified_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
}

export async function closeTicket(ticketId: string) {
  return supabase.from("maintenance_tickets")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", ticketId);
}

export async function openDispute(ticketId: string, reason: string) {
  await supabase.from("maintenance_events").insert({
    ticket_id: ticketId, event_type: "dispute_opened",
    payload: { reason },
  });
  return supabase.from("maintenance_tickets")
    .update({ status: "disputed", dispute_opened_at: new Date().toISOString() })
    .eq("id", ticketId);
}

// ---- Cancellation ----------------------------------------------------------

export interface CancelInput {
  ticket_id: string;
  cancelled_by_role: "tenant" | "landlord" | "technician" | "admin";
  reason_code: string;
  notes?: string;
  accepted_quote_price?: number;
  scheduled_start_at?: string | null;
}

/** Compute the fee a canceller owes per fairness rules. */
export function computeCancellationFee(args: {
  scheduled_start_at?: string | null;
  accepted_quote_price?: number;
}): { fee: number; within_24h: boolean } {
  if (!args.scheduled_start_at || !args.accepted_quote_price) {
    return { fee: 0, within_24h: false };
  }
  const hoursToStart = (new Date(args.scheduled_start_at).getTime() - Date.now()) / 3600_000;
  const within_24h = hoursToStart < FREE_CANCEL_HOURS;
  const fee = within_24h ? Math.round((args.accepted_quote_price * LATE_CANCEL_FEE_PCT) / 100) : 0;
  return { fee, within_24h };
}

export async function cancelTicket(input: CancelInput) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  const { fee, within_24h } = computeCancellationFee({
    scheduled_start_at: input.scheduled_start_at,
    accepted_quote_price: input.accepted_quote_price,
  });
  // Canceller pays the fee to the counterparty
  const fee_payer = fee > 0 ? input.cancelled_by_role : "none";
  return supabase.from("maintenance_cancellations").insert({
    ticket_id: input.ticket_id,
    cancelled_by: user.id,
    cancelled_by_role: input.cancelled_by_role,
    reason_code: input.reason_code,
    notes: input.notes ?? null,
    fee_amount: fee,
    fee_payer,
    within_24h,
  });
}

// ---- Reviews ---------------------------------------------------------------

export async function submitReview(args: {
  ticket_id: string;
  ratee_id: string;
  direction: "tenant_to_tech" | "tech_to_tenant" | "landlord_to_tech";
  stars: number;
  comment?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  return supabase.from("maintenance_reviews").insert({
    ticket_id: args.ticket_id,
    rater_id: user.id,
    ratee_id: args.ratee_id,
    direction: args.direction,
    stars: args.stars,
    comment: args.comment ?? null,
  });
}

// ---- Timeline --------------------------------------------------------------

export interface MaintenanceEvent {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_role: string | null;
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function getTicketTimeline(ticketId: string) {
  return supabase.from("maintenance_events")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
}

// ---- Technician dispatch pool ---------------------------------------------

export async function findDispatchableTechnicians(opts: { city?: string; skill?: string }) {
  let q = supabase.from("technicians")
    .select("user_id, skills, service_cities, hourly_rate, rating_avg, jobs_completed, bio, profiles:user_id(full_name, phone)")
    .eq("is_active", true)
    .gte("rating_avg", 0); // include 0-rated (new techs)
  const { data, error } = await q;
  if (error || !data) return { data: [], error };
  const filtered = data.filter((t: any) => {
    const cityOk = !opts.city || (t.service_cities ?? []).includes(opts.city);
    const skillOk = !opts.skill || (t.skills ?? []).includes(opts.skill);
    const ratingOk = t.jobs_completed < 10 || Number(t.rating_avg) >= MIN_TECH_RATING;
    return cityOk && skillOk && ratingOk;
  });
  return { data: filtered, error: null };
}

// ---- Action permissions per role -----------------------------------------

export interface TicketActions {
  triage?: boolean;
  dispatch?: boolean;
  submitQuote?: boolean;
  acceptQuote?: boolean;
  counterQuote?: boolean;
  checkIn?: boolean;
  markWorkDone?: boolean;
  verify?: boolean;
  close?: boolean;
  cancel?: boolean;
  dispute?: boolean;
  review?: boolean;
  pay?: boolean;
}

export function allowedActions(
  ticket: { status: TicketStatus; funded_by?: "landlord" | "tenant" },
  role: "tenant" | "landlord" | "technician" | "admin"
): TicketActions {
  const s = ticket.status;
  const terminal = s === "closed" || s === "cancelled";
  if (terminal) {
    return { review: s === "closed" && (role === "tenant" || role === "technician" || role === "landlord") };
  }
  const a: TicketActions = {};
  if (role === "landlord") {
    if (s === "submitted" || s === "open") { a.triage = true; a.dispatch = true; }
    if (s === "triaged") a.dispatch = true;
    if (s === "quoted" && ticket.funded_by === "landlord") a.acceptQuote = true;
    if (s === "quoted") a.counterQuote = true;
    if (s === "tenant_verified" && ticket.funded_by === "landlord") a.pay = true;
    if (["dispatched","quoted","scheduled","in_progress","work_done","tenant_verified"].includes(s)) {
      a.cancel = true; a.dispute = true;
    }
    if (s === "tenant_verified") a.close = true;
  }
  if (role === "tenant") {
    if (s === "quoted" && ticket.funded_by === "tenant") a.acceptQuote = true;
    if (s === "quoted") a.counterQuote = true;
    if (s === "work_done") a.verify = true;
    if (s === "tenant_verified" && ticket.funded_by === "tenant") a.pay = true;
    if (["submitted","dispatched","quoted","scheduled"].includes(s)) a.cancel = true;
    if (["scheduled","in_progress","work_done"].includes(s)) a.dispute = true;
  }
  if (role === "technician") {
    if (s === "dispatched") a.submitQuote = true;
    if (s === "quoted" || s === "counter_quote") a.counterQuote = true;
    if (s === "scheduled") a.checkIn = true;
    if (s === "in_progress") a.markWorkDone = true;
    if (["scheduled","in_progress"].includes(s)) { a.cancel = true; a.dispute = true; }
  }
  if (role === "admin") {
    a.cancel = true; a.close = true; a.dispute = true;
  }
  return a;
}
