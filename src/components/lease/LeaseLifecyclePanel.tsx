import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatPKR, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import {
  LeaseTerms, TerminationGround, TERMINATION_GROUND_LABELS,
  requestAmendment, requestExtension, requestRenewal, serveTerminationNotice,
  respondToRequest, withdrawRequest,
  minEffectiveDate, computeLockInPenalty,
  LeaseRequest,
} from "@/lib/lease";

type Role = "landlord" | "tenant";

export default function LeaseLifecyclePanel({
  lease, role, userId, onChange,
}: { lease: any; role: Role; userId: string; onChange: () => void }) {
  const [requests, setRequests] = useState<LeaseRequest[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [open, setOpen] = useState<null | "amendment" | "extension" | "renewal" | "termination">(null);

  const reload = async () => {
    const [{ data: rs }, { data: es }] = await Promise.all([
      supabase.from("lease_requests").select("*").eq("lease_id", lease.id)
        .order("created_at", { ascending: false }),
      supabase.from("lease_events").select("*").eq("lease_id", lease.id)
        .order("created_at", { ascending: false }).limit(20),
    ]);
    setRequests((rs ?? []) as LeaseRequest[]);
    setEvents(es ?? []);
  };

  useEffect(() => { reload(); }, [lease.id]);

  // Realtime: refresh whenever a request changes for this lease.
  useEffect(() => {
    const ch = supabase
      .channel(`lease-${lease.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lease_requests", filter: `lease_id=eq.${lease.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "lease_events", filter: `lease_id=eq.${lease.id}` }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lease.id]);

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="mt-5 border-t pt-4 space-y-4">
      {pending.map((req) => (
        <PendingRequestCard
          key={req.id}
          req={req}
          lease={lease}
          role={role}
          userId={userId}
          onDone={() => { reload(); onChange(); }}
        />
      ))}

      {lease.status === "active" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen("amendment")}>
            Propose change
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("extension")}>
            Request extension
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("renewal")}>
            {role === "landlord" ? "Offer renewal" : "Request renewal"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen("termination")}>
            Serve termination notice
          </Button>
        </div>
      )}

      {open === "amendment" && (
        <TermsRequestDialog title="Propose a change" kind="amendment" lease={lease} userId={userId}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); onChange(); }} />
      )}
      {open === "renewal" && (
        <TermsRequestDialog title="Propose a renewal" kind="renewal" lease={lease} userId={userId}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); onChange(); }} />
      )}
      {open === "extension" && (
        <ExtensionDialog lease={lease} userId={userId}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); onChange(); }} />
      )}
      {open === "termination" && (
        <TerminationDialog lease={lease} role={role} userId={userId}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); onChange(); }} />
      )}

      <LeaseHistory events={events} />
    </div>
  );
}

/* ============================================================== */
/* Pending request banner (with Accept / Decline / Withdraw)      */
/* ============================================================== */

function PendingRequestCard({
  req, lease, role, userId, onDone,
}: { req: LeaseRequest; lease: any; role: Role; userId: string; onDone: () => void }) {
  const mine = req.requested_by === userId;
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (!confirm("Accept this request? It will be applied immediately and recorded in the lease history.")) return;
    setBusy(true);
    try { await respondToRequest({ requestId: req.id, decision: "accepted" }); toast.success("Accepted"); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  };
  const decline = async () => {
    if (!confirm("Decline this request? The other party will be notified.")) return;
    setBusy(true);
    try { await respondToRequest({ requestId: req.id, decision: "declined" }); toast.success("Declined"); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!confirm("Withdraw your request?")) return;
    setBusy(true);
    try { await withdrawRequest(req.id); toast.success("Withdrawn"); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge className="capitalize bg-amber-600">{req.kind} request</Badge>
          <div className="text-sm font-medium mt-2">
            {mine ? "You proposed" : `${role === "landlord" ? "Tenant" : "Landlord"} proposed`} this {relativeTime(req.created_at)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            <RequestSummary req={req} lease={lease} />
          </div>
          {req.ground_details && (
            <div className="text-sm mt-2 bg-white/60 rounded p-2 whitespace-pre-line">{req.ground_details}</div>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {mine ? (
            <Button size="sm" variant="outline" onClick={withdraw} disabled={busy}>Withdraw</Button>
          ) : (
            <>
              <Button size="sm" onClick={accept} disabled={busy}>Accept</Button>
              <Button size="sm" variant="outline" onClick={decline} disabled={busy}>Decline</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestSummary({ req, lease }: { req: LeaseRequest; lease: any }) {
  if (req.kind === "extension") {
    return <>Extend lease end date to <b>{formatDate(req.new_end_date!)}</b> (was {formatDate(lease.end_date)}).</>;
  }
  if (req.kind === "termination") {
    return (
      <>
        Terminate lease on <b>{formatDate(req.effective_date!)}</b>{" "}
        — ground: <b>{TERMINATION_GROUND_LABELS[req.ground as TerminationGround] ?? req.ground}</b>
      </>
    );
  }
  if (req.kind === "amendment" || req.kind === "renewal") {
    const t = req.proposed_terms as LeaseTerms | null;
    if (!t) return null;
    return (
      <ul className="list-disc ml-4 space-y-0.5">
        {t.monthly_rent !== lease.monthly_rent && <li>Rent: {formatPKR(lease.monthly_rent)} → <b>{formatPKR(t.monthly_rent)}</b></li>}
        {t.deposit !== lease.deposit && <li>Deposit: {formatPKR(lease.deposit)} → <b>{formatPKR(t.deposit)}</b></li>}
        {t.end_date !== lease.end_date && <li>End date: {formatDate(lease.end_date)} → <b>{formatDate(t.end_date)}</b></li>}
        {t.notice_period_days !== lease.notice_period_days && <li>Notice: {lease.notice_period_days} → <b>{t.notice_period_days}</b> days</li>}
        {t.late_fee_pct !== Number(lease.late_fee_pct ?? 0) && <li>Late fee: {lease.late_fee_pct}% → <b>{t.late_fee_pct}%</b></li>}
        {t.escalation_pct !== Number(lease.escalation_pct ?? 0) && <li>Escalation: {lease.escalation_pct}% → <b>{t.escalation_pct}%</b></li>}
        {t.pets_allowed !== !!lease.pets_allowed && <li>Pets allowed: {String(t.pets_allowed)}</li>}
        {t.sublet_allowed !== !!lease.sublet_allowed && <li>Sublet allowed: {String(t.sublet_allowed)}</li>}
      </ul>
    );
  }
  return null;
}

/* ============================================================== */
/* Termination dialog                                              */
/* ============================================================== */

function TerminationDialog({ lease, role, userId, onClose, onDone }: {
  lease: any; role: Role; userId: string; onClose: () => void; onDone: () => void;
}) {
  const notice = lease.notice_period_days ?? 30;
  const [effectiveDate, setEffectiveDate] = useState(minEffectiveDate(notice));
  const [ground, setGround] = useState<TerminationGround>(
    role === "tenant" ? "tenant_notice" : "mutual_agreement"
  );
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const penalty = computeLockInPenalty({
    monthlyRent: lease.monthly_rent,
    lockInMonths: lease.lock_in_months ?? 0,
    activatedAt: lease.activated_at,
    effectiveDate,
  });

  const allowedGrounds: TerminationGround[] = role === "tenant"
    ? ["tenant_notice", "mutual_agreement", "property_unfit", "end_of_term"]
    : ["mutual_agreement", "landlord_notice", "non_payment", "material_breach", "personal_bona_fide_need", "end_of_term"];

  const submit = async () => {
    setBusy(true);
    try {
      await serveTerminationNotice({
        leaseId: lease.id, by: userId, ground, effectiveDate, groundDetails: details || undefined,
      });
      toast.success("Notice served. Awaiting the other party's response.");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Serve termination notice</DialogTitle>
          <DialogDescription>
            This is a formal written notice. The lease only ends once the other party accepts.
            Per your signed terms, a minimum of {notice} days notice applies.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Ground for termination</Label>
            <Select value={ground} onValueChange={(v) => setGround(v as TerminationGround)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedGrounds.map((g) => (
                  <SelectItem key={g} value={g}>{TERMINATION_GROUND_LABELS[g]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Effective date (earliest: {formatDate(minEffectiveDate(notice))})</Label>
            <Input type="date" className="mt-1" min={minEffectiveDate(notice)}
              value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Details / supporting context (visible to the other party)</Label>
            <Textarea className="mt-1" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>

          {penalty > 0 && role === "tenant" && (
            <div className="text-sm rounded border border-orange-300 bg-orange-50 p-3">
              You are still inside the agreed lock-in period. Per your signed terms, the landlord
              may deduct up to <b>{formatPKR(penalty)}</b> from your deposit if they accept this notice.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Serving…" : "Serve notice"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================== */
/* Extension dialog                                                */
/* ============================================================== */

function ExtensionDialog({ lease, userId, onClose, onDone }: {
  lease: any; userId: string; onClose: () => void; onDone: () => void;
}) {
  const oneYearOut = (() => {
    const d = new Date(lease.end_date);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [newEnd, setNewEnd] = useState(oneYearOut);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (new Date(newEnd) <= new Date(lease.end_date)) {
      toast.error("New end date must be after the current end date.");
      return;
    }
    setBusy(true);
    try {
      await requestExtension({ leaseId: lease.id, by: userId, newEndDate: newEnd, notes: notes || undefined });
      toast.success("Extension request sent.");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request extension</DialogTitle>
          <DialogDescription>
            Push the end date out while keeping all other terms the same. Current end: {formatDate(lease.end_date)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">New end date</Label>
            <Input type="date" className="mt-1" min={lease.end_date} value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================== */
/* Amendment / renewal dialog (full terms form)                    */
/* ============================================================== */

function TermsRequestDialog({
  title, kind, lease, userId, onClose, onDone,
}: { title: string; kind: "amendment" | "renewal"; lease: any; userId: string; onClose: () => void; onDone: () => void }) {
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
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [overrideCap, setOverrideCap] = useState(false);

  const update = <K extends keyof LeaseTerms>(k: K, v: LeaseTerms[K]) =>
    setTerms((t) => ({ ...t, [k]: v }));

  const escalationCap = lease.monthly_rent * (1 + Number(lease.escalation_pct ?? 10) / 100);
  const exceedsCap = kind === "renewal" && terms.monthly_rent > escalationCap && !overrideCap;

  const submit = async () => {
    if (exceedsCap) {
      toast.error("Rent above the agreed escalation cap. Tick the override box first.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "amendment") {
        await requestAmendment({ leaseId: lease.id, by: userId, proposedTerms: terms, notes: notes || undefined });
      } else {
        await requestRenewal({ leaseId: lease.id, by: userId, proposedTerms: terms, notes: notes || undefined });
      }
      toast.success("Request sent. The other party will be asked to accept or decline.");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "renewal"
              ? "Sets up a new signed version of the lease. Both parties must sign the new version before it activates."
              : "Modifies a clause in the current lease. The change applies immediately once the other party accepts."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <F label="Monthly rent (PKR)"><Input type="number" value={terms.monthly_rent} onChange={(e) => update("monthly_rent", Number(e.target.value))} /></F>
          <F label="Deposit (PKR)"><Input type="number" value={terms.deposit} onChange={(e) => update("deposit", Number(e.target.value))} /></F>
          <F label="Start date"><Input type="date" value={terms.start_date} onChange={(e) => update("start_date", e.target.value)} /></F>
          <F label="End date"><Input type="date" value={terms.end_date} onChange={(e) => update("end_date", e.target.value)} /></F>
          <F label="Notice period (days)"><Input type="number" min={30} value={terms.notice_period_days} onChange={(e) => update("notice_period_days", Number(e.target.value))} /></F>
          <F label="Lock-in (months)"><Input type="number" min={0} value={terms.lock_in_months} onChange={(e) => update("lock_in_months", Number(e.target.value))} /></F>
          <F label="Late fee (%)"><Input type="number" step="0.1" value={terms.late_fee_pct} onChange={(e) => update("late_fee_pct", Number(e.target.value))} /></F>
          <F label="Yearly escalation (%)"><Input type="number" step="0.1" value={terms.escalation_pct} onChange={(e) => update("escalation_pct", Number(e.target.value))} /></F>
        </div>

        <F label="Notes / reason for change">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </F>

        {exceedsCap && (
          <label className="flex items-start gap-2 text-sm rounded border border-orange-300 bg-orange-50 p-3">
            <input type="checkbox" className="mt-1" checked={overrideCap} onChange={(e) => setOverrideCap(e.target.checked)} />
            <span>
              The proposed rent ({formatPKR(terms.monthly_rent)}) exceeds the agreed yearly escalation cap
              ({formatPKR(Math.round(escalationCap))}). The other party must explicitly agree to this increase.
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || exceedsCap}>{busy ? "Sending…" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================== */
/* History timeline                                                */
/* ============================================================== */

function LeaseHistory({ events }: { events: any[] }) {
  if (events.length === 0) return null;
  return (
    <details className="rounded border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Lease history ({events.length})</summary>
      <ul className="mt-2 space-y-1">
        {events.map((e) => (
          <li key={e.id} className="text-muted-foreground">
            <span className="font-mono text-xs">{formatDate(e.created_at)}</span>
            {" — "}
            <span className="capitalize">{String(e.kind).replace(/_/g, " ")}</span>
          </li>
        ))}
      </ul>
    </details>
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
