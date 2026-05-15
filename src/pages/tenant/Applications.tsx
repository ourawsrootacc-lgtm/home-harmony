import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
};

export default function TenantApplications() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("applications")
      .select("*, properties(id,title,city,monthly_rent)")
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  };
  useEffect(load, [user]);

  const cancel = async (id: string) => {
    await supabase.from("applications").update({ status: "cancelled" }).eq("id", id);
    toast.success("Application cancelled"); load();
  };

  return (
    <div>
      <PageHeader title="My applications" description="Track the status of properties you've applied to." />
      {loading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <EmptyState title="No applications yet" description="Apply on any property page to see it here." action={<Button asChild><Link to="/browse">Browse properties</Link></Button>} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <Link to={`/properties/${r.properties?.id}`} className="font-semibold hover:underline">{r.properties?.title ?? "Property"}</Link>
                <div className="text-sm text-muted-foreground">{r.properties?.city} · applied {relativeTime(r.created_at)}</div>
              </div>
              <Badge className={`${STATUS_VARIANT[r.status]} capitalize`}>{r.status}</Badge>
              {r.status === "pending" && <Button variant="outline" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
