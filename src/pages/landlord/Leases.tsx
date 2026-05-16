import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPKR, formatDate, relativeTime } from "@/lib/format";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  signCurrentVersion, counterOffer, declineOffer, LeaseTerms,
} from "@/lib/lease";
import LeaseLifecyclePanel from "@/components/lease/LeaseLifecyclePanel";

const OFFER_STATUSES = ["proposed", "countered"];
const ACTIVE_STATUSES = ["active", "pending_activation", "holdover", "disputed"];
const PAST_STATUSES = ["ended", "terminated", "rejected"];

export default function LandlordLeases() {
  const { user } = useAuth();
  const [leases, setLeases] = useState<any[]>([]);
  const [versions, setVersions] = useState<Record<string, any>>({});
  const [sigsByVersion, setSigsByVersion] = useState<Record<string, any[]>>({});
  const [tenants, setTenants] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from("leases")
      .select("*, properties(title,address,city)")
      .eq("landlord_id", user.id)
      .order("created_at", { ascending: false });
    const list = rows ?? [];
    setLeases(list);

    const versionIds = list.map((l: any) => l.current_version_id).filter(Boolean);
    if (versionIds.length) {
      const { data: vs } = await supabase
        .from("lease_versions").select("*").in("id", versionIds);
      setVersions(Object.fromEntries((vs ?? []).map((v: any) => [v.id, v])));
      const { data: ss } = await supabase
        .from("lease_signatures").select("*").in("lease_version_id", versionIds);
      const map: Record<string, any[]> = {};
      for (const s of ss ?? []) (map[s.lease_version_id] ||= []).push(s);
      setSigsByVersion(map);
    }

    const tenantIds = Array.from(new Set(list.map((l: any) => l.tenant_id)));
    if (tenantIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, phone").in("id", tenantIds);
      setTenants(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const offers = useMemo(() => leases.filter((l) => OFFER_STATUSES.includes(l.status)), [leases]);
  const active = useMemo(() => leases.filter((l) => ACTIVE_STATUSES.includes(l.status)), [leases]);
  const past = useMemo(() => leases.filter((l) => PAST_STATUSES.includes(l.status)), [leases]);

  return (
    <div>
      <PageHeader
        title="Leases"
        description="Track the lease agreements you've sent. Once both parties sign the current version, the lease activates automatically."
      />
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <Tabs defaultValue={offers.length ? "offers" : active.length ? "current" : "past"}>
          <TabsList>
            <TabsTrigger value="offers">Sent offers ({offers.length})</TabsTrigger>
            <TabsTrigger value="current">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="offers" className="space-y-4">
            {offers.length === 0 ? (
              <EmptyState
                title="No open offers"
                description="Send a lease offer from the Applications page after you've agreed terms in chat."
              />
            ) : offers.map((l) => (
              <OfferCard
                key={l.id}
                lease={l}
                tenant={tenants[l.tenant_id]}
                version={versions[l.current_version_id]}
                sigs={sigsByVersion[l.current_version_id] ?? []}
                onChange={load}
              />
            ))}
          </TabsContent>

          <TabsContent value="current" className="space-y-4">
            {active.length === 0 ? (
              <EmptyState title="No active leases yet" />
            ) : active.map((l) => (
              <ActiveCard key={l.id} lease={l} tenant={tenants[l.tenant_id]} onChange={load} />
            ))}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {past.length === 0 ? (
              <EmptyState title="No past leases" />
            ) : past.map((l) => (
              <div key={l.id} className="rounded-xl border bg-card p-4">
                <div className="font-semibold">{l.properties?.title}</div>
                <div className="text-sm text-muted-foreground">
                  {tenants[l.tenant_id]?.full_name ?? "Tenant"} · {formatDate(l.start_date)} – {formatDate(l.end_date)}
                  <Badge variant="secondary" className="ml-2 capitalize">{l.status.replace("_", " ")}</Badge>
                  {l.end_reason && <span className="ml-2">· {l.end_reason}</span>}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function OfferCard({
  lease, tenant, version, sigs, onChange,
}: { lease: any; tenant: any; version: any; sigs: any[]; onChange: () => void }) {
  const { user } = useAuth();
  const [counterOpen, setCounterOpen] = useState(false);
  const landlordSigned = sigs.some((s) => s.role === "landlord");
  const tenantSigned = sigs.some((s) => s.role === "tenant");
  const proposedByMe = version?.proposed_by === user?.id;

  const sign = async () => {
    if (!user || !version) return;
    try {
      await signCurrentVersion({
        leaseId: lease.id,
        versionId: version.id,
        termsHash: version.terms_hash,
        userId: user.id,
        role: "landlord",
      });
      toast.success("Signed. Lease activates once both parties have signed this version.");
      onChange();
    } catch (e: any) { toast.error(e?.message ?? "Failed to sign"); }
  };

  const withdraw = async () => {
    if (!confirm("Withdraw this offer? The tenant will be notified.")) return;
    await declineOffer(lease.id, "landlord_withdrew");
    toast.success("Offer withdrawn");
    onChange();
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold">{lease.properties?.title}</div>
          <div className="text-sm text-muted-foreground">
            {lease.properties?.address}, {lease.properties?.city} · Tenant: {tenant?.full_name ?? "—"}
          </div>
        </div>
        <Badge className="capitalize bg-indigo-100 text-indigo-800">{lease.status}</Badge>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
        <Info label="Rent">{formatPKR(lease.monthly_rent)}/mo</Info>
        <Info label="Deposit">{formatPKR(lease.deposit)}</Info>
        <Info label="Start">{formatDate(lease.start_date)}</Info>
        <Info label="End">{formatDate(lease.end_date)}</Info>
        <Info label="Notice period">{lease.notice_period_days} days</Info>
        <Info label="Lock-in">{lease.lock_in_months} months</Info>
        <Info label="Late fee">{lease.late_fee_pct}%</Info>
        <Info label="Yearly escalation">{lease.escalation_pct}%</Info>
        <Info label="Utilities">{lease.utilities_paid_by}</Info>
        <Info label="Province">{lease.province}</Info>
      </div>
      {lease.notes && (
        <div className="mt-3 text-sm bg-muted/40 p-3 rounded whitespace-pre-line">{lease.notes}</div>
      )}

      <div className="mt-4 text-xs text-muted-foreground">
        Version hash: <span className="font-mono">{version?.terms_hash?.slice(0, 16)}…</span> ·
        You signed: {landlordSigned ? "✓" : "—"} · Tenant signed: {tenantSigned ? "✓" : "—"}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/messages?to=${lease.tenant_id}`}>
            <MessageSquare className="h-4 w-4 mr-1" />Message tenant
          </Link>
        </Button>
        {!landlordSigned && <Button size="sm" onClick={sign}>Accept &amp; sign</Button>}
        <Button size="sm" variant="outline" onClick={() => setCounterOpen(true)}>Edit &amp; resend</Button>
        {!landlordSigned && <Button size="sm" variant="outline" onClick={withdraw}>Withdraw</Button>}
        {landlordSigned && !tenantSigned && (
          <span className="text-xs text-muted-foreground self-center">Waiting for tenant to accept.</span>
        )}
        {!landlordSigned && tenantSigned && (
          <span className="text-xs text-muted-foreground self-center">Tenant signed — sign to activate.</span>
        )}
      </div>

      {counterOpen && (
        <CounterDialog
          lease={lease}
          version={version}
          onClose={() => setCounterOpen(false)}
          onSent={() => { setCounterOpen(false); onChange(); }}
        />
      )}
    </div>
  );
}

function ActiveCard({ lease, tenant, onChange }: { lease: any; tenant: any; onChange: () => void }) {
  const { user } = useAuth();
  const isPending = lease.status === "pending_activation";
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold">{lease.properties?.title}</div>
          <div className="text-sm text-muted-foreground">
            {lease.properties?.address}, {lease.properties?.city} · Tenant: {tenant?.full_name ?? "—"} · {tenant?.phone ?? ""}
          </div>
        </div>
        <Badge className={`capitalize ${isPending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {lease.status.replace("_", " ")}
        </Badge>
      </div>

      {isPending && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Waiting on the tenant to submit the security deposit ({formatPKR(lease.deposit)}).
          When they upload proof, approve it in <Link to="/app/landlord/payments" className="underline font-medium">Payments</Link> to activate the lease.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
        <Info label="Rent">{formatPKR(lease.monthly_rent)}/mo</Info>
        <Info label="Deposit">{formatPKR(lease.deposit)}</Info>
        <Info label="Start">{formatDate(lease.start_date)}</Info>
        <Info label="End">{formatDate(lease.end_date)}</Info>
        <Info label="Notice period">{lease.notice_period_days ?? 30} days</Info>
        <Info label="Activated">{lease.activated_at ? relativeTime(lease.activated_at) : "—"}</Info>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/messages?to=${lease.tenant_id}`}>
            <MessageSquare className="h-4 w-4 mr-1" />Message tenant
          </Link>
        </Button>
      </div>

      {user && lease.status === "active" && (
        <LeaseLifecyclePanel lease={lease} role="landlord" userId={user.id} onChange={onChange} />
      )}
    </div>
  );
}

function CounterDialog({ lease, version, onClose, onSent }: { lease: any; version: any; onClose: () => void; onSent: () => void }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [terms, setTerms] = useState<LeaseTerms>(() => ({
    monthly_rent: lease.monthly_rent,
    deposit: lease.deposit,
    start_date: lease.start_date,
    end_date: lease.end_date,
    notice_period_days: lease.notice_period_days ?? 30,
    late_fee_pct: Number(lease.late_fee_pct ?? 0),
    escalation_pct: Number(lease.escalation_pct ?? 0),
    utilities_paid_by: lease.utilities_paid_by ?? "tenant",
    pets_allowed: !!lease.pets_allowed,
    sublet_allowed: !!lease.sublet_allowed,
    lock_in_months: lease.lock_in_months ?? 0,
    province: lease.province ?? "Punjab",
    notes: lease.notes ?? "",
  }));

  const update = <K extends keyof LeaseTerms>(k: K, v: LeaseTerms[K]) =>
    setTerms((t) => ({ ...t, [k]: v }));

  const send = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await counterOffer({
        leaseId: lease.id,
        proposedBy: user.id,
        prevVersionId: version.id,
        terms,
      });
      toast.success("Updated offer sent to tenant.");
      onSent();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit &amp; resend the lease offer</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          A new versioned snapshot is created; the tenant is asked to accept or decline.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <F label="Monthly rent"><Input type="number" value={terms.monthly_rent} onChange={(e) => update("monthly_rent", Number(e.target.value))} /></F>
          <F label="Deposit"><Input type="number" value={terms.deposit} onChange={(e) => update("deposit", Number(e.target.value))} /></F>
          <F label="Start date"><Input type="date" value={terms.start_date} onChange={(e) => update("start_date", e.target.value)} /></F>
          <F label="End date"><Input type="date" value={terms.end_date} onChange={(e) => update("end_date", e.target.value)} /></F>
          <F label="Notice period (days)"><Input type="number" value={terms.notice_period_days} onChange={(e) => update("notice_period_days", Number(e.target.value))} /></F>
          <F label="Lock-in (months)"><Input type="number" value={terms.lock_in_months} onChange={(e) => update("lock_in_months", Number(e.target.value))} /></F>
        </div>
        <F label="Notes"><Textarea rows={3} value={terms.notes ?? ""} onChange={(e) => update("notes", e.target.value)} /></F>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={send} disabled={submitting}>{submitting ? "Sending…" : "Send updated offer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
