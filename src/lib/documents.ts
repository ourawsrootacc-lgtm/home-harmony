/**
 * Secure document exchange helpers.
 * Backed by the private `documents` bucket + RLS on
 *   public.application_documents
 *   public.property_documents
 *   public.document_access_log
 */
import { supabase } from "@/lib/supabase";

export type AppDocKind =
  | "cnic" | "payslip" | "bank_statement" | "employment_letter" | "police_clearance";

export type PropertyDocKind = "ownership" | "society_noc";

export const APP_DOC_LABEL: Record<AppDocKind, string> = {
  cnic: "CNIC",
  payslip: "Payslip",
  bank_statement: "Bank statement",
  employment_letter: "Employment letter",
  police_clearance: "Police clearance",
};

export const PROPERTY_DOC_LABEL: Record<PropertyDocKind, string> = {
  ownership: "Ownership proof",
  society_noc: "Society NOC",
};

export const REQUIRED_APP_KINDS: AppDocKind[] = ["cnic"];
// Either payslip OR bank_statement satisfies the income-proof requirement.
export const INCOME_PROOF_KINDS: AppDocKind[] = ["payslip", "bank_statement"];

export interface AppDoc {
  id: string;
  application_id: string;
  tenant_id: string;
  kind: AppDocKind;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface PropertyDoc {
  id: string;
  property_id: string;
  landlord_id: string;
  kind: PropertyDocKind;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
}

const BUCKET = "documents";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function validate(file: File) {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} exceeds 10 MB`);
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new Error("Only PDF, JPG, PNG or WebP allowed");
  }
}

function ext(name: string) {
  const e = name.split(".").pop();
  return e && e.length <= 5 ? e.toLowerCase() : "bin";
}

// ----- application documents ---------------------------------------------

export async function uploadAppDoc(
  applicationId: string, file: File, kind: AppDocKind,
): Promise<AppDoc> {
  validate(file);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  const path = `applications/${applicationId}/${user.id}/${kind}-${Date.now()}.${ext(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (up.error) throw up.error;
  const ins = await supabase.from("application_documents").insert({
    application_id: applicationId, tenant_id: user.id, kind,
    storage_path: path, mime: file.type, size_bytes: file.size,
  }).select().single();
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw ins.error;
  }
  return ins.data as AppDoc;
}

export async function listAppDocs(applicationId: string): Promise<AppDoc[]> {
  const { data } = await supabase
    .from("application_documents")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  return (data as AppDoc[]) ?? [];
}

export async function deleteAppDoc(id: string) {
  // BEFORE DELETE trigger removes the storage object.
  return supabase.from("application_documents").delete().eq("id", id);
}

// ----- property documents -------------------------------------------------

export async function uploadPropertyDoc(
  propertyId: string, file: File, kind: PropertyDocKind,
): Promise<PropertyDoc> {
  validate(file);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  const path = `properties/${propertyId}/${user.id}/${kind}-${Date.now()}.${ext(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (up.error) throw up.error;
  const ins = await supabase.from("property_documents").insert({
    property_id: propertyId, landlord_id: user.id, kind,
    storage_path: path, mime: file.type, size_bytes: file.size,
  }).select().single();
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw ins.error;
  }
  return ins.data as PropertyDoc;
}

export async function listPropertyDocs(propertyId: string): Promise<PropertyDoc[]> {
  const { data } = await supabase
    .from("property_documents")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  return (data as PropertyDoc[]) ?? [];
}

export async function deletePropertyDoc(id: string) {
  return supabase.from("property_documents").delete().eq("id", id);
}

// ----- signed URLs + access log ------------------------------------------

export async function getDocSignedUrl(path: string, expiresIn = 600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function logView(
  documentTable: "application_documents" | "property_documents",
  documentId: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("document_access_log").insert({
    document_table: documentTable, document_id: documentId, viewer_id: user.id,
  });
}

export async function listAccessLog(
  documentTable: "application_documents" | "property_documents",
  documentIds: string[],
) {
  if (!documentIds.length) return [];
  const { data } = await supabase
    .from("document_access_log")
    .select("*")
    .eq("document_table", documentTable)
    .in("document_id", documentIds)
    .order("viewed_at", { ascending: false });
  return data ?? [];
}
