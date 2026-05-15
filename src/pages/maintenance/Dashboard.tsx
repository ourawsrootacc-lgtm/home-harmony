import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const STATUS_VARIANT: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-emerald-100 text-emerald-800",
  closed: "bg-muted text-muted-foreground",
};

export default function MaintenanceDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  const load = () => {
    let q = supabase.from("maintenance_tickets")
      .select("*, properties(title,address,city), profiles:tenant_id(full_name,phone)")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    q.then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, [filter]);

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "in_progress") updates.assigned_to = user?.id;
    const { error } = await supabase.from("maintenance_tickets").update(updates).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Updated"); load(); }
  };

  return (
    <div>
      <PageHeader title="Maintenance tickets" description="Tickets across all properties."
        action={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      {rows.length === 0 ? <EmptyState title="No tickets" /> : (
        <div className="space-y-3">
          {rows.map((t) => (
            <div key={t.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold capitalize">{t.category} · {t.priority} priority</div>
                  <div className="text-sm text-muted-foreground">{t.properties?.title} — {t.properties?.address}, {t.properties?.city}</div>
                  <p className="text-sm mt-2">{t.description}</p>
                  <div className="text-xs text-muted-foreground mt-1">Reported by {t.profiles?.full_name} · {relativeTime(t.created_at)}</div>
                </div>
                <Badge className={`${STATUS_VARIANT[t.status]} capitalize`}>{t.status.replace("_"," ")}</Badge>
              </div>
              <div className="flex gap-2 mt-3">
                {t.status === "open" && <Button size="sm" onClick={() => updateStatus(t.id, "in_progress")}>Start work</Button>}
                {t.status === "in_progress" && <Button size="sm" onClick={() => updateStatus(t.id, "resolved")}>Mark resolved</Button>}
                {t.status === "resolved" && <Button size="sm" variant="outline" onClick={() => updateStatus(t.id, "closed")}>Close</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
