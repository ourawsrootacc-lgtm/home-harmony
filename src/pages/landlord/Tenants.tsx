import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { formatPKR, formatDate } from "@/lib/format";

export default function LandlordTenants() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("leases")
      .select("*, properties(title), profiles:tenant_id(full_name,phone)")
      .eq("landlord_id", user.id)
      .in("status", ["active", "pending_activation", "holdover", "disputed"])
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  return (
    <div>
      <PageHeader title="Tenants" description="People currently leasing your properties." />
      {rows.length === 0 ? <EmptyState title="No active tenants" /> : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((r) => (
            <div key={r.id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-semibold">{r.profiles?.full_name}</div>
                <div className="text-sm text-muted-foreground">{r.properties?.title} · {r.profiles?.phone}</div>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold text-primary">{formatPKR(r.monthly_rent)}/mo</div>
                <div className="text-xs text-muted-foreground">until {formatDate(r.end_date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
