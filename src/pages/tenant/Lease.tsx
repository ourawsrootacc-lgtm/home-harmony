import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { formatPKR, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default function TenantLease() {
  const { user } = useAuth();
  const [lease, setLease] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("leases")
      .select("*, properties(title,address,city)")
      .eq("tenant_id", user.id).eq("status", "active")
      .maybeSingle()
      .then(({ data }) => { setLease(data); setLoading(false); });
  }, [user]);

  return (
    <div>
      <PageHeader title="My lease" description="Details of your current rental agreement." />
      {loading ? <p className="text-muted-foreground">Loading…</p> : !lease ? (
        <EmptyState title="No active lease" description="When a landlord approves your application and creates a lease, it will appear here." />
      ) : (
        <div className="rounded-xl border bg-card p-6 grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-muted-foreground">Property</div>
            <div className="font-display text-xl font-semibold">{lease.properties?.title}</div>
            <div className="text-sm text-muted-foreground">{lease.properties?.address}, {lease.properties?.city}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Monthly rent</div>
            <div className="font-display text-xl font-semibold text-primary">{formatPKR(lease.monthly_rent)}</div>
            <div className="text-sm text-muted-foreground">Deposit: {formatPKR(lease.deposit)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Start date</div>
            <div className="font-medium">{formatDate(lease.start_date)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">End date</div>
            <div className="font-medium">{formatDate(lease.end_date)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <Badge className="capitalize bg-emerald-100 text-emerald-800">{lease.status}</Badge>
          </div>
        </div>
      )}
    </div>
  );
}
