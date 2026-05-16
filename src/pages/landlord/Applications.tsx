import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageSquare, FileText } from "lucide-react";
import { relativeTime, formatPKR } from "@/lib/format";
import { toast } from "sonner";
import { sendInitialOffer, LeaseTerms } from "@/lib/lease";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-sky-100 text-sky-800",
  offer_sent: "bg-indigo-100 text-indigo-800",
  approved: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  superseded: "bg-muted text-muted-foreground",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

const todayPlus = (months: number) => {
  const d = new Date(); d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

export default function LandlordApplications() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerFor, setOfferFor] = useState<any | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: apps, error } = await supabase
      .from("applications")
      .select("*, properties!inner(id,title,landlord_id,monthly_rent,deposit,city)")
      .eq("properties.landlord_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { console.error(error); setRows([]); setLoading(false); return; }

    const tenantIds = Array.from(new Set((apps ?? []).map((a) => a.tenant_id)));
    let byId: Record<string, any> = {};
    if (tenantIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, phone").in("id", tenantIds);
      byId = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    }
    setRows((apps ?? []).map((a) => ({ ...a, profiles: byId[a.tenant_id] ?? null })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  // Group by property so the landlord can compare competing tenants.
  const grouped = useMemo(() => {
    const m = new Map<string, { property: any; apps: any[] }>();
    for (const r of rows) {
      const k = r.properties?.id;
      if (!k) continue;
      if (!m.has(k)) m.set(k, { property: r.properties, apps: [] });
      m.get(k)!.apps.push(r);
    }
    return Array.from(m.values());
  }, [rows]);

  const reject = async (a: any) => {
    const { error } = await supabase.from("applications")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success("Application rejected"); load(); }
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Review competing tenants, negotiate terms, then send a formal lease offer. Nothing becomes binding until both parties sign the same version."
      />
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Applications from interested tenants will appear here, grouped by property."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ property, apps }) => (
            <div key={property.id} className="rounded-xl border bg-card">
              <div className="p-4 border-b flex items-center justify-between gap-2">
                <div>
                  <Link to={`/properties/${property.id}`} className="font-semibold hover:underline">{property.title}</Link>
                  <div className="text-xs text-muted-foreground">
                    {property.city} · listed at {formatPKR(property.monthly_rent)}/mo
                  </div>
                </div>
                <Badge variant="secondary">{apps.length} applicant{apps.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="divide-y">
                {apps.map((r) => (
                  <ApplicationRow
                    key={r.id}
                    row={r}
                    onReject={() => reject(r)}
                    onOpenOffer={() => setOfferFor(r)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {offerFor && (
        <OfferDialog
          app={offerFor}
          onClose={() => setOfferFor(null)}
          onSent={() => { setOfferFor(null); load(); }}
        />
      )}
    </div>
  );
}

function ApplicationRow({ row, onReject, onOpenOffer }: { row: any; onReject: () => void; onOpenOffer: () => void }) {
  const canOffer = ["pending", "under_review"].includes(row.status);
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">{row.profiles?.full_name ?? "Tenant"}</div>
          <div className="text-xs text-muted-foreground">
            {row.profiles?.phone ?? "no phone"} · applied {relativeTime(row.created_at)}
          </div>
          {row.message && <p className="text-sm mt-2 bg-muted/40 rounded p-2 whitespace-pre-line">{row.message}</p>}
        </div>
        <Badge className={`${STATUS_VARIANT[row.status] ?? "bg-muted"} capitalize`}>
          {row.status.replace("_", " ")}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button asChild size="sm" variant="outline">
          <Link to={`/app/messages?to=${row.tenant_id}`}>
            <MessageSquare className="h-4 w-4 mr-1" />Discuss terms
          </Link>
        </Button>
        {canOffer && (
          <>
            <Button size="sm" onClick={onOpenOffer}>
              <FileText className="h-4 w-4 mr-1" />Send lease offer
            </Button>
            <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>
          </>
        )}
        {row.status === "offer_sent" && (
          <Button asChild size="sm" variant="outline">
            <Link to="/app/landlord/leases">
              <FileText className="h-4 w-4 mr-1" />Manage in Leases
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function OfferDialog({ app, onClose, onSent }: { app: any; onClose: () => void; onSent: () => void }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [terms, setTerms] = useState<LeaseTerms>({
    monthly_rent: app.properties.monthly_rent ?? 0,
    deposit: app.properties.deposit ?? 0,
    start_date: today(),
    end_date: todayPlus(12),
    notice_period_days: 30,
    late_fee_pct: 5,
    escalation_pct: 10,
    utilities_paid_by: "tenant",
    pets_allowed: false,
    sublet_allowed: false,
    lock_in_months: 6,
    province: "Punjab",
    notes: "",
  });

  const update = <K extends keyof LeaseTerms>(k: K, v: LeaseTerms[K]) =>
    setTerms((t) => ({ ...t, [k]: v }));

  const send = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await sendInitialOffer({
        applicationId: app.id,
        propertyId: app.properties.id,
        landlordId: user.id,
        tenantId: app.tenant_id,
        terms,
      });
      toast.success("Offer sent — tenant can now accept, counter or decline.");
      onSent();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send offer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send lease offer to {app.profiles?.full_name ?? "tenant"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          These terms become a versioned, hashed snapshot. Either party can counter,
          but the lease only activates when both sign the same version.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <Field label="Monthly rent (PKR)">
            <Input type="number" value={terms.monthly_rent}
              onChange={(e) => update("monthly_rent", Number(e.target.value))} />
          </Field>
          <Field label="Security deposit (PKR)">
            <Input type="number" value={terms.deposit}
              onChange={(e) => update("deposit", Number(e.target.value))} />
          </Field>
          <Field label="Start date">
            <Input type="date" value={terms.start_date}
              onChange={(e) => update("start_date", e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={terms.end_date}
              onChange={(e) => update("end_date", e.target.value)} />
          </Field>
          <Field label="Notice period (days)">
            <Input type="number" value={terms.notice_period_days}
              onChange={(e) => update("notice_period_days", Number(e.target.value))} />
          </Field>
          <Field label="Lock-in (months)">
            <Input type="number" value={terms.lock_in_months}
              onChange={(e) => update("lock_in_months", Number(e.target.value))} />
          </Field>
          <Field label="Late fee %">
            <Input type="number" value={terms.late_fee_pct}
              onChange={(e) => update("late_fee_pct", Number(e.target.value))} />
          </Field>
          <Field label="Yearly escalation %">
            <Input type="number" value={terms.escalation_pct}
              onChange={(e) => update("escalation_pct", Number(e.target.value))} />
          </Field>
          <Field label="Utilities paid by">
            <Select value={terms.utilities_paid_by} onValueChange={(v) => update("utilities_paid_by", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Tenant</SelectItem>
                <SelectItem value="landlord">Landlord</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Province (for stamp duty)">
            <Select value={terms.province} onValueChange={(v) => update("province", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Punjab">Punjab</SelectItem>
                <SelectItem value="Sindh">Sindh</SelectItem>
                <SelectItem value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</SelectItem>
                <SelectItem value="Balochistan">Balochistan</SelectItem>
                <SelectItem value="Islamabad Capital Territory">Islamabad Capital Territory</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pets allowed">
            <Select value={String(terms.pets_allowed)} onValueChange={(v) => update("pets_allowed", v === "true")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">No</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subletting allowed">
            <Select value={String(terms.sublet_allowed)} onValueChange={(v) => update("sublet_allowed", v === "true")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">No</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Special clauses / inventory / notes">
          <Textarea rows={4} value={terms.notes ?? ""}
            onChange={(e) => update("notes", e.target.value)} />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={send} disabled={submitting}>
            {submitting ? "Sending…" : "Send offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
