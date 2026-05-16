import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { relativeTime } from "@/lib/format";
import { TicketStatusBadge } from "@/components/maintenance/TicketStatusBadge";
import { TicketDetailDrawer } from "@/components/maintenance/TicketDetailDrawer";
import { TicketStatus } from "@/lib/maintenance";

const STATUSES = ["all","submitted","triaged","dispatched","quoted","scheduled","in_progress","work_done","tenant_verified","closed","disputed","cancelled"];

export default function LandlordMaintenance() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    // Properties owned by this landlord
    supabase.from("properties").select("id").eq("landlord_id", user.id).then(({ data: props }) => {
      const ids = (props ?? []).map((p) => p.id);
      if (!ids.length) { setRows([]); return; }
      let q = supabase.from("maintenance_tickets")
        .select("*, properties(title,address,city), profiles:tenant_id(full_name)")
        .in("property_id", ids)
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      q.then(({ data }) => setRows(data ?? []));
    });
  };
  useEffect(load, [user, filter]);

  return (
    <div>
      <PageHeader title="Maintenance" description="Triage, dispatch, and oversee tickets across your properties."
        action={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        } />
      {rows.length === 0 ? <EmptyState title="No tickets" /> : (
        <div className="space-y-3">
          {rows.map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)}
              className="w-full text-left rounded-xl border bg-card p-4 hover:bg-muted/40 transition">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold capitalize">{t.category} · {t.priority} priority · funded by {t.funded_by}</div>
                  <div className="text-sm text-muted-foreground">{t.properties?.title} — {t.properties?.address}, {t.properties?.city}</div>
                  <p className="text-sm mt-2 line-clamp-2">{t.description}</p>
                  <div className="text-xs text-muted-foreground mt-1">Reported by {t.profiles?.full_name} · {relativeTime(t.created_at)}</div>
                </div>
                <TicketStatusBadge status={t.status as TicketStatus} />
              </div>
            </button>
          ))}
        </div>
      )}
      <TicketDetailDrawer ticketId={openId} role="landlord" onOpenChange={(v) => { if (!v) { setOpenId(null); load(); } }} />
    </div>
  );
}
