import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/feedback/Feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, FileText, Wrench } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, properties: 0, applications: 0, tickets: 0 });
  const [byStatus, setByStatus] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("properties").select("*", { count: "exact", head: true }),
      supabase.from("applications").select("*", { count: "exact", head: true }),
      supabase.from("maintenance_tickets").select("status"),
    ]).then(([u, p, a, t]) => {
      setStats({ users: u.count ?? 0, properties: p.count ?? 0, applications: a.count ?? 0, tickets: t.data?.length ?? 0 });
      const grouped: Record<string, number> = {};
      (t.data ?? []).forEach((row: any) => { grouped[row.status] = (grouped[row.status] ?? 0) + 1; });
      setByStatus(Object.entries(grouped).map(([name, count]) => ({ name, count })));
    });
  }, []);

  const cards = [
    { label: "Users", value: stats.users, icon: Users },
    { label: "Properties", value: stats.properties, icon: Building2 },
    { label: "Applications", value: stats.applications, icon: FileText },
    { label: "Tickets", value: stats.tickets, icon: Wrench },
  ];

  return (
    <div>
      <PageHeader title="Admin overview" description="Platform-wide health and activity." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-3xl font-display font-bold">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Maintenance tickets by status</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
