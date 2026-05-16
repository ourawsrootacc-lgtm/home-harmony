import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Badge } from "@/components/ui/badge";
import { formatPKR, formatDate } from "@/lib/format";

const ACTIVE_STATUSES = ["active", "pending_activation", "holdover", "disputed"];

export default function LandlordTenants() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [tenants, setTenants] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: leases } = await supabase
        .from("leases")
        .select("*, properties(title,address,city)")
        .eq("landlord_id", user.id)
        .in("status", ACTIVE_STATUSES);
      const list = leases ?? [];
      if (cancelled) return;
      setRows(list);

      const tenantIds = Array.from(new Set(list.map((l: any) => l.tenant_id).filter(Boolean)));
      if (tenantIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", tenantIds);
        if (cancelled) return;
        setTenants(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
      } else {
        setTenants({});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div>
      <PageHeader title="Tenants" description="People currently leasing your properties." />
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No active tenants" />
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((r) => {
            const t = tenants[r.tenant_id];
            return (
              <div key={r.id} className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold">{t?.full_name ?? "Tenant"}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.properties?.title}{t?.phone ? ` · ${t.phone}` : ""}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold text-primary">{formatPKR(r.monthly_rent)}/mo</div>
                  <div className="text-xs text-muted-foreground">until {formatDate(r.end_date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
