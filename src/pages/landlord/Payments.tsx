import { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PaymentCard } from "@/components/payments/PaymentCard";
import { listMyPayments, PaymentRow } from "@/lib/payments";

export default function LandlordPayments() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<PaymentRow[]>([]);
  const [outgoing, setOutgoing] = useState<PaymentRow[]>([]);

  const load = () => {
    if (!user) return;
    listMyPayments("payee").then(({ data }) => setIncoming(data ?? []));
    listMyPayments("payer").then(({ data }) => setOutgoing(data ?? []));
  };
  useEffect(load, [user]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Review tenant payments and pay technicians." />
      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in">From tenants ({incoming.length})</TabsTrigger>
          <TabsTrigger value="out">To technicians ({outgoing.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="in" className="mt-4 space-y-3">
          {incoming.length === 0 ? <EmptyState title="No tenant payments yet" /> :
            incoming.map((p) => <PaymentCard key={p.id} payment={p} role="payee" onChanged={load} />)}
        </TabsContent>
        <TabsContent value="out" className="mt-4 space-y-3">
          {outgoing.length === 0 ? <EmptyState title="No outgoing payments" /> :
            outgoing.map((p) => <PaymentCard key={p.id} payment={p} role="payer" onChanged={load} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
