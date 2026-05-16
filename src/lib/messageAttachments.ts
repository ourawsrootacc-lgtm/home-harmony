import { supabase } from "@/lib/supabase";

const BUCKET = "message-attachments";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const BLOCKED_EXT = ["exe", "bat", "sh", "cmd", "msi", "scr", "com", "ps1"];

export type MessageAttachmentKind = "image" | "file";

export interface UploadedAttachment {
  path: string;
  name: string;
  size: number;
  mime: string;
  kind: MessageAttachmentKind;
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
}

export function classifyFile(file: File): MessageAttachmentKind {
  return file.type.startsWith("image/") ? "image" : "file";
}

export function validateFile(file: File) {
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" exceeds the 20 MB limit.`);
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (BLOCKED_EXT.includes(ext)) throw new Error(`"${file.name}" is not an allowed file type.`);
}

export async function uploadMessageAttachment(file: File): Promise<UploadedAttachment> {
  validateFile(file);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  const path = `${user.id}/${crypto.randomUUID()}-${sanitize(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream",
  });
  if (up.error) throw up.error;
  return {
    path,
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    kind: classifyFile(file),
  };
}

export async function getMessageAttachmentUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
