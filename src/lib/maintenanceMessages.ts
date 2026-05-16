import { supabase } from "@/lib/supabase";

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export async function listMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data } = await supabase.from("maintenance_messages")
    .select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return (data as TicketMessage[]) ?? [];
}

export async function sendMessage(ticketId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty");
  if (trimmed.length > 2000) throw new Error("Message too long");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");
  return supabase.from("maintenance_messages")
    .insert({ ticket_id: ticketId, sender_id: user.id, body: trimmed })
    .select().single();
}

export function subscribeToTicketMessages(
  ticketId: string,
  onInsert: (m: TicketMessage) => void,
) {
  const channel = supabase
    .channel(`tmsg-${ticketId}`)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "maintenance_messages",
        filter: `ticket_id=eq.${ticketId}` },
      (payload) => onInsert(payload.new as TicketMessage))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
