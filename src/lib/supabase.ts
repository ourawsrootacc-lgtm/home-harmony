import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anon);

// Fallbacks keep the app from crashing in preview when env is unset.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anon || "public-anon-key-placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  }
);

export type AppRole = "tenant" | "landlord" | "maintenance" | "admin";
