import { supabase } from "@/lib/supabase";

export type AttachmentKind = "issue" | "after" | "invoice" | "other";

export interface Attachment {
  id: string;
  ticket_id: string;
  uploaded_by: string;
  kind: AttachmentKind;
  storage_path: string;
  mime: string | null;
  created_at: string;
}

const BUCKET = "maintenance-attachments";

export async function uploadAttachment(
  ticketId: string,
  file: File,
  kind: AttachmentKind,
): Promise<Attachment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  const ext = file.name.split(".").pop() || "bin";
  const path = `${ticketId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (up.error) throw up.error;
  const ins = await supabase.from("maintenance_attachments").insert({
    ticket_id: ticketId, uploaded_by: user.id, kind,
    storage_path: path, mime: file.type || null,
  }).select().single();
  if (ins.error) throw ins.error;
  return ins.data as Attachment;
}

export async function listAttachments(ticketId: string): Promise<Attachment[]> {
  const { data } = await supabase.from("maintenance_attachments")
    .select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false });
  return (data as Attachment[]) ?? [];
}

export async function getAttachmentSignedUrl(path: string, expiresIn = 600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(a: Attachment) {
  await supabase.storage.from(BUCKET).remove([a.storage_path]);
  return supabase.from("maintenance_attachments").delete().eq("id", a.id);
}
