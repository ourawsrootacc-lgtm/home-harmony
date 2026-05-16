import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { respondToAssignment } from "@/lib/maintenance";
import { TicketStatusBadge } from "@/components/maintenance/TicketStatusBadge";
import { TicketDetailDrawer } from "@/components/maintenance/TicketDetailDrawer";
import { TicketStatus } from "@/lib/maintenance";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function MaintenanceDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    supabase.from("technicians").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data));
    // Pending offers
    supabase.from("maintenance_assignments")
      .select("*, maintenance_tickets(*, properties(title,address,city))")
      .eq("technician_id", user.id)
      .eq("response", "pending")
      .order("offered_at", { ascending: false })
      .then(({ data }) => setOffers(data ?? []));
    // Active jobs
    supabase.from("maintenance_tickets")
      .select("*, properties(title,address,city)")
      .eq("assigned_to", user.id)
      .in("status", ["scheduled","in_progress","work_done","quoted","counter_quote","dispatched"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setActive(data ?? []));
    // History
    supabase.from("maintenance_tickets")
      .select("*, properties(title)")
      .eq("assigned_to", user.id)
      .in("status", ["closed","cancelled","tenant_verified","disputed"])
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistory(data ?? []));
  };
  useEffect(load, [user]);

  const respondOffer = async (assignmentId: string, action: "accepted" | "declined") => {
    const { error } = await respondToAssignment(assignmentId, action);
    if (error) toast.error(error.message); else { toast.success(`Offer ${action}`); load(); }
  };

  if (user && profile === null) {
    return (
      <div>
        <PageHeader title="Technician dashboard" description="Set up your profile to start receiving jobs." />
        <div className="rounded-xl border bg-card p-6">
          <p className="mb-4">You need to complete your technician profile (skills, service cities, payout method) before receiving job offers.</p>
          <Link to="/app/maintenance/profile"><Button>Set up profile</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Maintenance jobs" description="Offers, active jobs and history."
        action={<Link to="/app/maintenance/profile"><Button variant="outline" size="sm">Profile</Button></Link>} />
      <Tabs defaultValue="offers">
        <TabsList>
          <TabsTrigger value="offers">Offers ({offers.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="offers" className="mt-4">
          {offers.length === 0 ? <EmptyState title="No pending offers" /> : (
            <div className="space-y-3">
              {offers.map((o) => (
                <div key={o.id} className="rounded-xl border bg-card p-4">
                  <div className="font-semibold capitalize">
                    {o.maintenance_tickets?.category} · {o.maintenance_tickets?.priority} priority
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {o.maintenance_tickets?.properties?.title} — {o.maintenance_tickets?.properties?.address}, {o.maintenance_tickets?.properties?.city}
                  </div>
                  <p className="text-sm mt-2 line-clamp-2">{o.maintenance_tickets?.description}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    Offered {relativeTime(o.offered_at)} · expires {relativeTime(o.expires_at)}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => respondOffer(o.id, "accepted")}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => respondOffer(o.id, "declined")}>Decline</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          {active.length === 0 ? <EmptyState title="No active jobs" /> : (
            <div className="space-y-3">
              {active.map((t) => (
                <button key={t.id} onClick={() => setOpenId(t.id)}
                  className="w-full text-left rounded-xl border bg-card p-4 hover:bg-muted/40">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold capitalize">{t.category} · {t.properties?.title}</div>
                      <p className="text-sm mt-1 line-clamp-2">{t.description}</p>
                    </div>
                    <TicketStatusBadge status={t.status as TicketStatus} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? <EmptyState title="No history" /> : (
            <div className="space-y-2">
              {history.map((t) => (
                <button key={t.id} onClick={() => setOpenId(t.id)}
                  className="w-full text-left rounded-lg border bg-card p-3 flex items-center justify-between text-sm hover:bg-muted/40">
                  <div className="capitalize">{t.category} · {t.properties?.title}</div>
                  <TicketStatusBadge status={t.status as TicketStatus} />
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <TicketDetailDrawer ticketId={openId} role="technician" onOpenChange={(v) => { if (!v) { setOpenId(null); load(); } }} />
    </div>
  );
}
