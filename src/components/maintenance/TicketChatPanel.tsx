import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listMessages, sendMessage, subscribeToTicketMessages, TicketMessage } from "@/lib/maintenanceMessages";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";
import { Send } from "lucide-react";
import { toast } from "sonner";

export function TicketChatPanel({ ticketId }: { ticketId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadNames = async (ids: string[]) => {
    const missing = Array.from(new Set(ids.filter((id) => id && !names[id])));
    if (!missing.length) return;
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", missing);
    setNames((prev) => {
      const next = { ...prev };
      for (const p of data ?? []) next[p.id] = p.full_name ?? "User";
      for (const id of missing) if (!next[id]) next[id] = "User";
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    listMessages(ticketId).then((rows) => {
      if (cancelled) return;
      setMessages(rows);
      loadNames(rows.map((r) => r.sender_id));
    });
    const off = subscribeToTicketMessages(ticketId, (m) => {
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      loadNames([m.sender_id]);
    });
    return () => { cancelled = true; off(); };
  }, [ticketId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const { data } = await sendMessage(ticketId, body);
      if (data) setMessages((prev) => prev.some((x) => x.id === (data as any).id) ? prev : [...prev, data as TicketMessage]);
      setBody("");
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  return (
    <div className="rounded border bg-card flex flex-col h-[320px]">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center mt-8">
            No messages yet. Start the conversation with the other parties on this ticket.
          </p>
        ) : messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {!mine && <div className="text-[10px] font-medium opacity-70 mb-0.5">{names[m.sender_id] ?? "User"}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{relativeTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t p-2 flex gap-2">
        <Textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button size="sm" onClick={send} disabled={sending || !body.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
