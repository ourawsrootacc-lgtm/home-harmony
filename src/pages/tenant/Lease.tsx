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
import { DocumentList } from "@/components/documents/DocumentList";
import { listPropertyDocs, type PropertyDoc } from "@/lib/documents";
import { SubmitPaymentDialog } from "@/components/payments/SubmitPaymentDialog";
import { listLeasePayments, type PaymentRow } from "@/lib/payments";
import { Wallet } from "lucide-react";

const OFFER_STATUSES = ["proposed", "countered"];
const ACTIVE_STATUSES = ["active", "pending_activation", "holdover", "disputed"];
const PAST_STATUSES = ["ended", "terminated", "rejected"];

export default function TenantLease() {
  const { user } = useAuth();
  const [leases, setLeases] = useState<any[]>([]);
  const [versions, setVersions] = useState<Record<string, any>>({}); // by version id
  const [sigsByVersion, setSigsByVersion] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from("leases")
      .select("*, properties(title,address,city)")
      .eq("tenant_id", user.id)
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
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const offers = useMemo(() => leases.filter((l) => OFFER_STATUSES.includes(l.status)), [leases]);
  const active = useMemo(() => leases.filter((l) => ACTIVE_STATUSES.includes(l.status)), [leases]);
  const past = useMemo(() => leases.filter((l) => PAST_STATUSES.includes(l.status)), [leases]);

  return (
    <div>
      <PageHeader
        title="My lease"
        description="Already discussed terms with your landlord in Messages? Review the formal offer below and accept to make it binding."
      />
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <Tabs defaultValue={offers.length ? "offers" : active.length ? "current" : "past"}>
          <TabsList>
            <TabsTrigger value="offers">Offers ({offers.length})</TabsTrigger>
            <TabsTrigger value="current">Current ({active.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="offers" className="space-y-4">
            {offers.length === 0 ? (
              <EmptyState title="No open offers" description="When a landlord sends you a lease offer, it will appear here." />
            ) : offers.map((l) => (
              <OfferCard key={l.id} lease={l} version={versions[l.current_version_id]} sigs={sigsByVersion[l.current_version_id] ?? []} onChange={load} />
            ))}
          </TabsContent>

          <TabsContent value="current" className="space-y-4">
            {active.length === 0 ? (
              <EmptyState title="No active lease" description="Sign a landlord's offer to start a lease." />
            ) : active.map((l) => (
              <ActiveCard key={l.id} lease={l} onChange={load} />
            ))}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {past.length === 0 ? (
              <EmptyState title="No past leases" />
            ) : past.map((l) => (
              <div key={l.id} className="rounded-xl border bg-card p-4">
                <div className="font-semibold">{l.properties?.title}</div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(l.start_date)} – {formatDate(l.end_date)} ·
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

function OfferCard({ lease, version, sigs, onChange }: { lease: any; version: any; sigs: any[]; onChange: () => void }) {
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
        role: "tenant",
      });
      toast.success("Signed. Lease becomes active once both parties have signed this version.");
      onChange();
    } catch (e: any) { toast.error(e?.message ?? "Failed to sign"); }
  };

  const decline = async () => {
    if (!confirm("Decline this offer? The landlord will be notified.")) return;
    await declineOffer(lease.id, "tenant_declined");
    toast.success("Offer declined");
    onChange();
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold">{lease.properties?.title}</div>
          <div className="text-sm text-muted-foreground">{lease.properties?.address}, {lease.properties?.city}</div>
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
        Landlord signed: {landlordSigned ? "✓" : "—"} · You signed: {tenantSigned ? "✓" : "—"}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {!proposedByMe && !tenantSigned && <Button size="sm" onClick={sign}>Accept &amp; sign</Button>}
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/messages?to=${lease.landlord_id}`}>
            <MessageSquare className="h-4 w-4 mr-1" />Message landlord
          </Link>
        </Button>
        {!tenantSigned && <Button size="sm" variant="ghost" onClick={decline}>Decline</Button>}
        {!proposedByMe && (
          <Button size="sm" variant="ghost" onClick={() => setCounterOpen(true)}>Counter</Button>
        )}
        {proposedByMe && !landlordSigned && (
          <span className="text-xs text-muted-foreground self-center">Waiting for landlord's response.</span>
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

function ActiveCard({ lease, onChange }: { lease: any; onChange: () => void }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<PropertyDoc[]>([]);
  const [depositPayments, setDepositPayments] = useState<PaymentRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);

  const reloadPayments = () => {
    listLeasePayments(lease.id).then(({ data }) => {
      setDepositPayments((data ?? []).filter((p: PaymentRow) => p.context === "deposit"));
    });
  };
  useEffect(() => {
    if (lease.property_id) listPropertyDocs(lease.property_id).then(setDocs);
    reloadPayments();
  }, [lease.property_id, lease.id]);

  const isPending = lease.status === "pending_activation";
  const submittedDeposit = depositPayments.find(
    (p) => p.status === "submitted" || p.status === "approved",
  );

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold">{lease.properties?.title}</div>
          <div className="text-sm text-muted-foreground">{lease.properties?.address}, {lease.properties?.city}</div>
        </div>
        <Badge className={`capitalize ${isPending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {lease.status.replace("_", " ")}
        </Badge>
      </div>

      {isPending && (
        <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Wallet className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Pay your security deposit to activate this lease</div>
              <div className="text-sm text-muted-foreground mt-1">
                Amount due: <b>{formatPKR(lease.deposit)}</b>. Your lease becomes active the moment your landlord confirms the payment.
              </div>
              {submittedDeposit && (
                <div className="text-xs mt-2">
                  Deposit submitted {relativeTime(submittedDeposit.created_at)} — waiting for landlord approval.
                </div>
              )}
            </div>
            {!submittedDeposit && (
              <Button size="sm" onClick={() => setPayOpen(true)}>Pay deposit</Button>
            )}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
        <Info label="Rent">{formatPKR(lease.monthly_rent)}/mo</Info>
        <Info label="Deposit">{formatPKR(lease.deposit)}</Info>
        <Info label="Start">{formatDate(lease.start_date)}</Info>
        <Info label="End">{formatDate(lease.end_date)}</Info>
        <Info label="Notice period">{lease.notice_period_days} days</Info>
        <Info label="Activated">{lease.activated_at ? relativeTime(lease.activated_at) : "—"}</Info>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/messages?to=${lease.landlord_id}`}>
            <MessageSquare className="h-4 w-4 mr-1" />Message landlord
          </Link>
        </Button>
      </div>

      <div className="mt-6 border-t pt-4">
        <h3 className="text-sm font-semibold mb-2">Property documents</h3>
        <DocumentList rows={docs} table="property_documents" />
      </div>

      {user && lease.status === "active" && (
        <div className="mt-6 border-t pt-4">
          <LeaseLifecyclePanel lease={lease} role="tenant" userId={user.id} onChange={onChange} />
        </div>
      )}

      <SubmitPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        context="deposit"
        payeeId={lease.landlord_id}
        leaseId={lease.id}
        defaultAmount={Number(lease.deposit)}
        onDone={() => { reloadPayments(); onChange(); }}
      />
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
      toast.success("Counter sent");
      onSent();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Counter the landlord's offer</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Adjust any field. A new versioned snapshot will be created and the landlord
          will be asked to accept or counter again.
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
          <Button onClick={send} disabled={submitting}>{submitting ? "Sending…" : "Send counter"}</Button>
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
