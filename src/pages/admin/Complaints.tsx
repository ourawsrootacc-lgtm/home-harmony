import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";

export default function AdminComplaints() {
  const [rows, setRows] = useState<any[]>([]);

  const load = () => {
    supabase.from("complaints").select("*, profiles:reporter_id(full_name)").order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, []);

  const resolve = async (id: string) => {
    const { error } = await supabase.from("complaints").update({ status: "resolved" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Resolved"); load(); }
  };

  return (
    <div>
      <PageHeader title="Complaints" description="User-submitted reports for moderation." />
      {rows.length === 0 ? <EmptyState title="No complaints" /> : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="font-semibold capitalize">{c.target_type} complaint</div>
                  <div className="text-xs text-muted-foreground">By {c.profiles?.full_name ?? "user"} · {relativeTime(c.created_at)}</div>
                  <p className="text-sm mt-2">{c.description}</p>
                </div>
                <Badge className={c.status === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{c.status}</Badge>
              </div>
              {c.status !== "resolved" && <Button size="sm" className="mt-2" onClick={() => resolve(c.id)}>Mark resolved</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
