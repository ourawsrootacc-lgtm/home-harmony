import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/feedback/Feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPKR } from "@/lib/format";
import { Building2, FileText, CheckCircle, Plus } from "lucide-react";

export default function LandlordDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ active: 0, pending: 0, negotiating: 0, leases: 0, revenue: 0 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("properties").select("*", { count: "exact", head: true }).eq("landlord_id", user.id).eq("status", "active"),
      supabase.from("applications").select("id, properties!inner(landlord_id)", { count: "exact", head: true }).eq("status", "pending").eq("properties.landlord_id", user.id),
      supabase.from("leases").select("id", { count: "exact", head: true }).eq("landlord_id", user.id).in("status", ["proposed", "countered", "pending_activation"]),
      supabase.from("leases").select("monthly_rent").eq("landlord_id", user.id).eq("status", "active"),
    ]).then(([a, b, n, c]) => {
      const revenue = (c.data ?? []).reduce((s, r: any) => s + Number(r.monthly_rent || 0), 0);
      setStats({ active: a.count ?? 0, pending: b.count ?? 0, negotiating: n.count ?? 0, leases: c.data?.length ?? 0, revenue });
    });
  }, [user]);

  const cards = [
    { label: "Active listings", value: stats.active, icon: Building2 },
    { label: "Pending applications", value: stats.pending, icon: FileText },
    { label: "Lease negotiations", value: stats.negotiating, icon: FileText },
    { label: "Active leases", value: stats.leases, icon: CheckCircle },
    { label: "Monthly revenue", value: formatPKR(stats.revenue), icon: Building2 },
  ];

  return (
    <div>
      <PageHeader
        title={`Hi${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Manage your portfolio."
        action={<Button asChild><Link to="/app/landlord/listings/new"><Plus className="h-4 w-4 mr-1" />New listing</Link></Button>}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-display font-bold">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
