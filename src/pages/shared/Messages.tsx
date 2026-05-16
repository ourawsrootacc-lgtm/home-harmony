import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { Send, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import {
  uploadMessageAttachment, classifyFile, validateFile, formatFileSize,
  type UploadedAttachment,
} from "@/lib/messageAttachments";
import { ImageBubble, FileBubble } from "@/components/messages/MessageAttachment";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  kind?: "text" | "image" | "file";
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_mime?: string | null;
};

type Counterparty = {
  id: string;
  name: string;
};

export default function Messages() {
  const { user, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Counterparty>>({});
  const [active, setActive] = useState<string | null>(params.get("to"));
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resolve a recipient passed by ?to=<uuid> even if there are no messages yet.
  useEffect(() => {
    const to = params.get("to");
    if (to) setActive(to);
  }, [params]);

  const loadProfiles = async (ids: string[]) => {
    const missing = ids.filter((id) => id && !profiles[id]);
    if (!missing.length) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", missing);
    setProfiles((prev) => {
      const next = { ...prev };
      for (const p of data ?? []) next[p.id] = { id: p.id, name: p.full_name ?? "User" };
      // Ensure unknown ids still resolve to *something*.
      for (const id of missing) if (!next[id]) next[id] = { id, name: "User" };
      return next;
    });
  };

  const loadMessages = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: true })
      .limit(500);
    const rows = (data ?? []) as Msg[];
    setMessages(rows);
    const ids = new Set<string>();
    for (const m of rows) ids.add(m.sender_id === user.id ? m.recipient_id : m.sender_id);
    if (active) ids.add(active);
    await loadProfiles(Array.from(ids));
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    loadMessages();
    // Realtime: any insert that involves me.
    const channel = supabase
      .channel(`messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          loadProfiles([m.sender_id]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    const safety = setInterval(loadMessages, 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Resolve a pre-selected ?to recipient (no messages yet) into the profile cache.
  useEffect(() => {
    if (active) loadProfiles([active]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Group messages by counterparty.
  const threads = useMemo(() => {
    if (!user) return [] as { id: string; last: Msg; unread: number }[];
    const map = new Map<string, { last: Msg; unread: number }>();
    for (const m of messages) {
      const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      const entry = map.get(other);
      const unreadInc = m.recipient_id === user.id && !m.read_at ? 1 : 0;
      if (!entry || new Date(m.created_at) > new Date(entry.last.created_at)) {
        map.set(other, { last: m, unread: (entry?.unread ?? 0) + unreadInc });
      } else {
        entry.unread += unreadInc;
      }
    }
    // Make sure the active thread shows up even with zero messages yet.
    if (active && !map.has(active)) {
      map.set(active, {
        last: {
          id: "placeholder",
          sender_id: user.id,
          recipient_id: active,
          body: "Start the conversation…",
          read_at: null,
          created_at: new Date(0).toISOString(),
        },
        unread: 0,
      });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at));
  }, [messages, user, active]);

  const activeMessages = useMemo(
    () =>
      active && user
        ? messages.filter(
            (m) =>
              (m.sender_id === user.id && m.recipient_id === active) ||
              (m.recipient_id === user.id && m.sender_id === active),
          )
        : [],
    [messages, active, user],
  );

  // Auto-scroll to bottom on new messages in the active thread.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeMessages.length, active]);

  // Mark incoming messages in the open thread as read.
  useEffect(() => {
    if (!user || !active) return;
    const unread = activeMessages
      .filter((m) => m.recipient_id === user.id && !m.read_at)
      .map((m) => m.id);
    if (!unread.length) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread)
      .then(({ error }) => {
        if (!error) {
          setMessages((prev) =>
            prev.map((m) => (unread.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m)),
          );
        }
      });
  }, [activeMessages, active, user]);

  const [pending, setPending] = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      try { validateFile(f); next.push(f); }
      catch (e: any) { toast.error(e?.message ?? "Invalid file"); }
    }
    if (next.length) setPending((prev) => [...prev, ...next]);
  };

  const removePending = (i: number) =>
    setPending((prev) => prev.filter((_, idx) => idx !== i));

  const insertMessage = async (row: Partial<Msg> & { sender_id: string; recipient_id: string }) => {
    const { data, error } = await supabase.from("messages").insert(row).select().single();
    if (error) throw error;
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Msg]));
  };

  const send = async () => {
    if (!user || !active) return;
    if (!body.trim() && pending.length === 0) return;
    setSending(true);
    try {
      // Upload + insert one row per attachment.
      for (const file of pending) {
        const up: UploadedAttachment = await uploadMessageAttachment(file);
        await insertMessage({
          sender_id: user.id,
          recipient_id: active,
          body: "",
          kind: classifyFile(file),
          attachment_path: up.path,
          attachment_name: up.name,
          attachment_size: up.size,
          attachment_mime: up.mime,
        } as any);
      }
      // Text message goes last so it appears below the attachments.
      if (body.trim()) {
        await insertMessage({
          sender_id: user.id,
          recipient_id: active,
          body: body.trim(),
          kind: "text",
        } as any);
      }
      setBody("");
      setPending([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const selectThread = (id: string) => {
    setActive(id);
    const next = new URLSearchParams(params);
    next.set("to", id);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Negotiate terms with the other party. Once you're aligned, the landlord can draft the formal lease agreement."
      />
      <div className="grid md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[480px]">
        {/* Threads */}
        <aside className="rounded-xl border bg-card overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No conversations"
                description="Open an application or a lease offer, then click 'Message' to start a thread."
              />
            </div>
          ) : (
            <ul className="divide-y">
              {threads.map((t) => {
                const p = profiles[t.id];
                const isActive = t.id === active;
                const placeholder = t.last.id === "placeholder";
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => selectThread(t.id)}
                      className={`w-full text-left p-3 hover:bg-muted/50 transition ${
                        isActive ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{p?.name ?? "User"}</span>
                        {!placeholder && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {relativeTime(t.last.created_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground truncate flex-1">
                          {placeholder
                            ? "No messages yet"
                            : t.last.kind === "image"
                              ? "📷 Photo"
                              : t.last.kind === "file"
                                ? `📎 ${t.last.attachment_name ?? "File"}`
                                : t.last.body}
                        </span>
                        {t.unread > 0 && (
                          <Badge className="bg-primary text-primary-foreground">{t.unread}</Badge>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Thread */}
        <section className="rounded-xl border bg-card flex flex-col overflow-hidden">
          {!active ? (
            <div className="m-auto p-8 text-center text-muted-foreground">
              Select a conversation on the left, or start one from an application or lease.
            </div>
          ) : (
            <>
              <header className="px-4 py-3 border-b flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{profiles[active]?.name ?? "User"}</div>
                  <div className="text-xs text-muted-foreground">
                    Negotiate freely — neither party is bound until a formal lease is signed.
                  </div>
                </div>
                {role === "landlord" && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/landlord/applications">
                      <FileText className="h-4 w-4 mr-1" />
                      Draft lease agreement
                    </Link>
                  </Button>
                )}
                {role === "tenant" && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/tenant/lease">
                      <FileText className="h-4 w-4 mr-1" />
                      My lease offers
                    </Link>
                  </Button>
                )}
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {activeMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Start the conversation below.
                  </p>
                ) : (
                  activeMessages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    const isImage = m.kind === "image" && m.attachment_path;
                    const isFile = m.kind === "file" && m.attachment_path;
                    return (
                      <div
                        key={m.id}
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "bg-card border"
                        }`}
                      >
                        {isImage && (
                          <ImageBubble path={m.attachment_path!} name={m.attachment_name ?? null} />
                        )}
                        {isFile && (
                          <FileBubble
                            path={m.attachment_path!}
                            name={m.attachment_name ?? null}
                            size={m.attachment_size ?? null}
                            mine={mine}
                          />
                        )}
                        {m.body && (
                          <div className={`whitespace-pre-line ${isImage || isFile ? "mt-1" : ""}`}>
                            {m.body}
                          </div>
                        )}
                        <div className="text-[10px] opacity-70 mt-1 text-right">
                          {relativeTime(m.created_at)}
                          {mine && m.read_at ? " · read" : ""}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t p-3 flex gap-2 items-end bg-card">
                <Textarea
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a message…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  className="resize-none"
                />
                <Button onClick={send} disabled={sending || !body.trim()}>
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
