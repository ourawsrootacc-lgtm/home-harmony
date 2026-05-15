import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
};

export default function LandlordApplications() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: apps, error } = await supabase
      .from("applications")
      .select("*, properties!inner(id,title,landlord_id)")
      .eq("properties.landlord_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("applications fetch error:", error);
      setRows([]);
      setLoading(false);
      return;
    }

    const tenantIds = Array.from(new Set((apps ?? []).map((a) => a.tenant_id)));
    let profilesById: Record<string, { full_name: string | null; phone: string | null }> = {};
    if (tenantIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", tenantIds);
      profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    }

    setRows((apps ?? []).map((a) => ({ ...a, profiles: profilesById[a.tenant_id] ?? null })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const decide = async (a: any, status: "approved" | "rejected") => {
    const { error } = await supabase.from("applications")
      .update({ status, decided_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return toast.error(error.message);
    if (status === "approved") {
      // create a basic active lease (12 months from today)
      const start = new Date(); const end = new Date(); end.setFullYear(end.getFullYear() + 1);
      const { data: prop } = await supabase.from("properties").select("monthly_rent,deposit").eq("id", a.properties.id).maybeSingle();
      await supabase.from("leases").insert({
        property_id: a.properties.id, tenant_id: a.tenant_id, landlord_id: user!.id,
        start_date: start.toISOString().slice(0,10), end_date: end.toISOString().slice(0,10),
        monthly_rent: prop?.monthly_rent ?? 0, deposit: prop?.deposit ?? 0, status: "active",
      });
    }
    toast.success(`Application ${status}`); load();
  };

  return (
    <div>
      <PageHeader title="Applications" description="Review and decide on tenant applications." />
      {loading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <EmptyState title="No applications yet" description="Applications from interested tenants will appear here." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{r.profiles?.full_name ?? "Tenant"} <span className="text-muted-foreground font-normal">applied for</span> {r.properties?.title}</div>
                  <div className="text-xs text-muted-foreground">{r.profiles?.phone ?? ""} · {relativeTime(r.created_at)}</div>
                  {r.message && <p className="text-sm mt-2 bg-muted/40 rounded p-2">{r.message}</p>}
                </div>
                <Badge className={`${STATUS_VARIANT[r.status]} capitalize`}>{r.status}</Badge>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => decide(r, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, "rejected")}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
