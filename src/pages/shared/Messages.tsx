import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";

export default function Messages() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");

  const load = () => {
    if (!user) return;
    supabase.from("messages")
      .select("*, sender:sender_id(full_name), recipient:recipient_id(full_name)")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const send = async () => {
    if (!user || !recipient || !body) return;
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, recipient_id: recipient, body });
    if (error) toast.error(error.message); else { setBody(""); setRecipient(""); toast.success("Sent"); load(); }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div>
        <PageHeader title="Messages" description="Conversations with landlords, tenants and staff." />
        {rows.length === 0 ? <EmptyState title="No messages yet" /> : (
          <div className="space-y-2">
            {rows.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`rounded-xl border p-3 max-w-xl ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-card"}`}>
                  <div className="text-xs opacity-70 mb-0.5">{mine ? "You" : m.sender?.full_name} · {relativeTime(m.created_at)}</div>
                  <div className="text-sm whitespace-pre-line">{m.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4 h-fit">
        <h3 className="font-display font-semibold mb-3">New message</h3>
        <Label>Recipient user ID</Label>
        <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Paste user id" />
        <Label className="mt-3">Message</Label>
        <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button className="w-full mt-3" onClick={send} disabled={!recipient || !body}>Send</Button>
        <p className="text-xs text-muted-foreground mt-2">Tip: messages refresh every 15 seconds.</p>
      </div>
    </div>
  );
}
