import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { PaymentCard } from "@/components/payments/PaymentCard";
import { SubmitPaymentDialog } from "@/components/payments/SubmitPaymentDialog";
import { listMyPayments, PaymentRow } from "@/lib/payments";

export default function TenantPayments() {
  const { user } = useAuth();
  const [lease, setLease] = useState<any>(null);
  const [outgoing, setOutgoing] = useState<PaymentRow[]>([]);
  const [open, setOpen] = useState(false);

  const load = () => {
    if (!user) return;
    supabase.from("leases").select("*").eq("tenant_id", user.id).eq("status", "active").maybeSingle()
      .then(({ data }) => setLease(data));
    listMyPayments("payer").then(({ data }) => setOutgoing(data ?? []));
  };
  useEffect(load, [user]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Upload rent payment proofs." />
      {lease && (
        <div className="rounded-xl border bg-card p-5 flex items-center justify-between">
          <div>
            <div className="font-semibold">Monthly rent: PKR {lease.monthly_rent?.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Pay your landlord and upload the receipt.</div>
          </div>
          <Button onClick={() => setOpen(true)}>Upload rent payment</Button>
        </div>
      )}

      <div className="space-y-3">
        {outgoing.length === 0 ? <EmptyState title="No payments yet" /> :
          outgoing.map((p) => <PaymentCard key={p.id} payment={p} role="payer" onChanged={load} />)}
      </div>

      {lease && (
        <SubmitPaymentDialog open={open} onOpenChange={setOpen}
          context="rent" leaseId={lease.id} payeeId={lease.landlord_id}
          defaultAmount={lease.monthly_rent} onDone={load} />
      )}
    </div>
  );
}
