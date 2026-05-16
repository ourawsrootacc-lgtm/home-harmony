import { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { PaymentCard } from "@/components/payments/PaymentCard";
import { listMyPayments, PaymentRow } from "@/lib/payments";

export default function LandlordPayments() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<PaymentRow[]>([]);

  const load = () => {
    if (!user) return;
    listMyPayments("payee").then(({ data }) => setIncoming(data ?? []));
  };
  useEffect(load, [user]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Review payments received from tenants." />
      <div className="space-y-3">
        {incoming.length === 0 ? <EmptyState title="No tenant payments yet" /> :
          incoming.map((p) => <PaymentCard key={p.id} payment={p} role="payee" onChanged={load} />)}
      </div>
    </div>
  );
}
