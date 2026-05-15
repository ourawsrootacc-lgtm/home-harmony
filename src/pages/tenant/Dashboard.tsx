import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/feedback/Feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, FileText, Wrench } from "lucide-react";

export default function TenantDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ favorites: 0, applications: 0, tickets: 0 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("favorites").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("tenant_id", user.id),
      supabase.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("tenant_id", user.id),
    ]).then(([f, a, t]) => setStats({ favorites: f.count ?? 0, applications: a.count ?? 0, tickets: t.count ?? 0 }));
  }, [user]);

  const cards = [
    { label: "Favorites", value: stats.favorites, icon: Heart, to: "/app/tenant/favorites" },
    { label: "Applications", value: stats.applications, icon: FileText, to: "/app/tenant/applications" },
    { label: "Maintenance tickets", value: stats.tickets, icon: Wrench, to: "/app/tenant/maintenance" },
  ];

  return (
    <div>
      <PageHeader title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`} description="Your rental activity at a glance." />
      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <Card className="hover:border-primary/50 transition">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-3xl font-display font-bold">{c.value}</div></CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-8 rounded-xl border bg-card p-6 text-center">
        <h3 className="font-display font-semibold">Looking for a new place?</h3>
        <p className="text-muted-foreground text-sm mt-1">Browse hundreds of verified listings across Pakistan.</p>
        <Button asChild className="mt-4"><Link to="/browse">Browse properties</Link></Button>
      </div>
    </div>
  );
}
