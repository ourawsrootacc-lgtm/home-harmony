/**
 * Manual payment helpers — Phase 2.
 * Mirrors the schema in 20260518100000_manual_payments.sql.
 */
import { supabase } from "@/lib/supabase";

export type PaymentMethod = "bank" | "easypaisa" | "jazzcash" | "cash";
export type PaymentContext =
  | "rent" | "deposit" | "maintenance" | "late_fee" | "cancellation_fee" | "other";
export type PaymentStatus =
  | "submitted" | "approved" | "rejected" | "disputed" | "refund_requested";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank: "Bank transfer",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  cash: "Cash",
};

export const CONTEXT_LABEL: Record<PaymentContext, string> = {
  rent: "Monthly rent",
  deposit: "Security deposit",
  maintenance: "Maintenance job",
  late_fee: "Late fee",
  cancellation_fee: "Cancellation fee",
  other: "Other",
};

export const STATUS_BADGE: Record<PaymentStatus, string> = {
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  disputed: "bg-orange-100 text-orange-800",
  refund_requested: "bg-purple-100 text-purple-800",
};

export interface PaymentRow {
  id: string;
  context: PaymentContext;
  lease_id: string | null;
  ticket_id: string | null;
  quote_id: string | null;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  proof_url: string | null;
  reference_no: string | null;
  paid_at: string | null;
  notes: string | null;
  status: PaymentStatus;
  rejection_reason: string | null;
  dispute_reason: string | null;
  auto_approve_at: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface PaymentMethodRow {
  id: string;
  user_id: string;
  kind: PaymentMethod;
  account_title: string;
  account_number: string | null;
  bank_name: string | null;
  is_default: boolean;
  created_at: string;
}

// ----- proof upload --------------------------------------------------------

export async function uploadPaymentProof(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  const ext = file.name.split(".").pop() || "bin";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("payment-proofs").upload(path, file, {
    cacheControl: "3600", upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getProofSignedUrl(path: string, expiresIn = 600) {
  const { data, error } = await supabase.storage.from("payment-proofs")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// ----- submit + review -----------------------------------------------------

export interface SubmitPaymentInput {
  context: PaymentContext;
  lease_id?: string | null;
  ticket_id?: string | null;
  quote_id?: string | null;
  payee_id: string;
  amount: number;
  method: PaymentMethod;
  proof_url?: string | null;
  reference_no?: string | null;
  paid_at?: string | null;
  notes?: string | null;
}

export async function submitPayment(input: SubmitPaymentInput) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  if (input.method !== "cash" && !input.reference_no) {
    throw new Error("Reference number required for non-cash payments");
  }
  return supabase.from("payments").insert({
    ...input,
    payer_id: user.id,
    currency: "PKR",
  }).select().single();
}

export async function approvePayment(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from("payments").update({
    status: "approved",
    reviewed_by: user?.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id).select().single();
}

export async function rejectPayment(id: string, reason: string) {
  if (!reason || reason.trim().length < 10) {
    throw new Error("Rejection reason must be at least 10 characters");
  }
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from("payments").update({
    status: "rejected",
    rejection_reason: reason.trim(),
    reviewed_by: user?.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id).select().single();
}

export async function disputePayment(id: string, reason: string) {
  if (!reason || reason.trim().length < 10) {
    throw new Error("Dispute reason must be at least 10 characters");
  }
  return supabase.from("payments").update({
    status: "disputed",
    dispute_reason: reason.trim(),
  }).eq("id", id).select().single();
}

// ----- queries -------------------------------------------------------------

export async function listMyPayments(role: "payer" | "payee") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] as PaymentRow[], error: null };
  const col = role === "payer" ? "payer_id" : "payee_id";
  return supabase.from("payments").select("*").eq(col, user.id)
    .order("created_at", { ascending: false });
}

export async function listLeasePayments(leaseId: string) {
  return supabase.from("payments").select("*").eq("lease_id", leaseId)
    .order("created_at", { ascending: false });
}

// ----- payment methods -----------------------------------------------------

export async function listMyMethods(): Promise<PaymentMethodRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("payment_methods").select("*").eq("user_id", user.id);
  return data ?? [];
}

export async function listMethodsFor(userId: string): Promise<PaymentMethodRow[]> {
  const { data } = await supabase.from("payment_methods").select("*").eq("user_id", userId);
  return data ?? [];
}

export async function addMethod(input: Omit<PaymentMethodRow, "id" | "user_id" | "created_at">) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  return supabase.from("payment_methods").insert({ ...input, user_id: user.id });
}

export async function removeMethod(id: string) {
  return supabase.from("payment_methods").delete().eq("id", id);
}

// ----- fairness helpers ----------------------------------------------------

export function hoursUntilAutoApprove(p: PaymentRow): number | null {
  if (p.status !== "submitted" || !p.auto_approve_at) return null;
  return Math.max(0, (new Date(p.auto_approve_at).getTime() - Date.now()) / 3600_000);
}

export function allowedPaymentActions(
  p: PaymentRow,
  role: "payer" | "payee" | "admin"
): { approve?: boolean; reject?: boolean; dispute?: boolean } {
  if (p.status === "submitted") {
    if (role === "payee") return { approve: true, reject: true };
    if (role === "admin") return { approve: true, reject: true };
  }
  if (p.status === "approved" && (role === "payer" || role === "payee")) {
    return { dispute: true };
  }
  if (p.status === "rejected" && role === "payer") {
    return { dispute: true };
  }
  return {};
}
