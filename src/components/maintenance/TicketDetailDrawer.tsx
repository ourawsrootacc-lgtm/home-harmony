import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import {
  allowedActions, checkInTechnician, markWorkDone, verifyWork, closeTicket,
  openDispute, MaintenanceQuote, TicketStatus, STATUS_LABEL,
} from "@/lib/maintenance";
import { toast } from "sonner";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketTimeline } from "./TicketTimeline";
import { QuoteCard } from "./QuoteCard";
import { QuoteFormDialog } from "./QuoteFormDialog";
import { TechnicianPicker } from "./TechnicianPicker";
import { CancelDialog } from "./CancelDialog";
import { SubmitPaymentDialog } from "@/components/payments/SubmitPaymentDialog";

interface Props {
  ticketId: string | null;
  role: "tenant" | "landlord" | "technician" | "admin";
  onOpenChange: (v: boolean) => void;
}

export function TicketDetailDrawer({ ticketId, role, onOpenChange }: Props) {
  const [ticket, setTicket] = useState<any | null>(null);
  const [quotes, setQuotes] = useState<MaintenanceQuote[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [counterParent, setCounterParent] = useState<MaintenanceQuote | undefined>();
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [photoUrls, setPhotoUrls] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  const load = () => {
    if (!ticketId) return;
    supabase.from("maintenance_tickets")
      .select("*, properties(title, address, city, landlord_id), profiles:tenant_id(full_name)")
      .eq("id", ticketId).maybeSingle()
      .then(({ data }) => setTicket(data));
    supabase.from("maintenance_quotes").select("*").eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setQuotes((data as any) ?? []));
  };
  useEffect(load, [ticketId]);

  if (!ticketId) return null;

  const acts = ticket ? allowedActions({ status: ticket.status, funded_by: ticket.funded_by }, role) : {};
  const acceptedQuote = quotes.find((q) => q.status === "accepted");
  const techId = ticket?.assigned_to ?? quotes[0]?.technician_id;

  const doVerify = async () => {
    const { error } = await verifyWork(ticketId);
    if (error) toast.error(error.message); else { toast.success("Verified"); load(); }
  };
  const doClose = async () => {
    const { error } = await closeTicket(ticketId);
    if (error) toast.error(error.message); else { toast.success("Closed"); load(); }
  };
  const doCheckIn = async () => {
    const { error } = await checkInTechnician(ticketId);
    if (error) toast.error(error.message); else { toast.success("Checked in"); load(); }
  };
  const doWorkDone = async () => {
    const urls = photoUrls.split(/\s+/).filter(Boolean);
    if (!urls.length) return toast.error("Add at least one after-photo URL");
    const { error } = await markWorkDone(ticketId, urls);
    if (error) toast.error(error.message); else { toast.success("Work marked done"); setPhotoUrls(""); load(); }
  };
  const doDispute = async () => {
    if (disputeReason.trim().length < 10) return toast.error("Reason ≥10 chars");
    const { error } = await openDispute(ticketId, disputeReason.trim());
    if (error) toast.error(error.message); else { toast.success("Dispute opened"); setDisputeReason(""); load(); }
  };

  return (
    <Sheet open={!!ticketId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="capitalize">{ticket?.category}</span>
            {ticket && <TicketStatusBadge status={ticket.status as TicketStatus} />}
          </SheetTitle>
        </SheetHeader>
        {!ticket ? <p className="text-sm text-muted-foreground mt-6">Loading…</p> : (
          <div className="space-y-5 mt-4">
            <section>
              <div className="text-sm text-muted-foreground">{ticket.properties?.title} — {ticket.properties?.address}</div>
              <p className="text-sm mt-1">{ticket.description}</p>
              <div className="text-xs text-muted-foreground mt-1">
                Priority: {ticket.priority} · Funded by: {ticket.funded_by}
              </div>
            </section>

            {/* Quotes */}
            {quotes.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Quotes</h3>
                {quotes.map((q) => (
                  <QuoteCard key={q.id} quote={q}
                    canAccept={!!acts.acceptQuote && q.status === "pending"}
                    canCounter={!!acts.counterQuote && q.status === "pending"}
                    onCounter={(qq) => { setCounterParent(qq); setQuoteOpen(true); }}
                    onDone={load} />
                ))}
              </section>
            )}

            {/* Action buttons */}
            <section className="flex flex-wrap gap-2">
              {acts.dispatch && (
                <Button size="sm" onClick={() => setDispatchOpen(true)}>Dispatch to technicians</Button>
              )}
              {acts.submitQuote && techId && (
                <Button size="sm" onClick={() => { setCounterParent(undefined); setQuoteOpen(true); }}>
                  Submit quote
                </Button>
              )}
              {acts.checkIn && <Button size="sm" onClick={doCheckIn}>Check in & start work</Button>}
              {acts.verify && <Button size="sm" onClick={doVerify}>Verify work done</Button>}
              {acts.close && <Button size="sm" onClick={doClose}>Close ticket</Button>}
              {acts.pay && acceptedQuote && (
                <Button size="sm" variant="default" onClick={() => setPayOpen(true)}>
                  Pay technician
                </Button>
              )}
              {acts.cancel && (
                <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>Cancel ticket</Button>
              )}
            </section>

            {/* Mark work done */}
            {acts.markWorkDone && (
              <section className="rounded border p-3 space-y-2">
                <Label className="text-sm">After-photo URLs (space-separated)</Label>
                <Textarea rows={2} value={photoUrls} onChange={(e) => setPhotoUrls(e.target.value)}
                  placeholder="https://…/photo1.jpg https://…/photo2.jpg" />
                <Button size="sm" onClick={doWorkDone}>Mark work done</Button>
              </section>
            )}

            {/* Dispute */}
            {acts.dispute && (
              <section className="rounded border p-3 space-y-2">
                <Label className="text-sm">Open dispute</Label>
                <Input value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Reason (≥10 chars)" />
                <Button size="sm" variant="destructive" onClick={doDispute}>Open dispute</Button>
              </section>
            )}

            {/* Timeline */}
            <section>
              <h3 className="font-semibold text-sm mb-2">Timeline</h3>
              <TicketTimeline ticketId={ticketId} />
            </section>
          </div>
        )}

        {/* Sub-dialogs */}
        {techId && (
          <QuoteFormDialog open={quoteOpen} onOpenChange={setQuoteOpen}
            ticketId={ticketId} technicianId={techId} role={role === "technician" ? "technician" : role as any}
            parent={counterParent} onDone={load} />
        )}
        <TechnicianPicker open={dispatchOpen} onOpenChange={setDispatchOpen}
          ticketId={ticketId} city={ticket?.properties?.city} skill={ticket?.category}
          onDone={load} />
        <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen}
          ticketId={ticketId} cancelledByRole={role === "admin" ? "admin" : role as any}
          scheduledStartAt={ticket?.scheduled_start_at}
          acceptedQuotePrice={acceptedQuote?.price}
          onDone={load} />
        {acceptedQuote && techId && (
          <SubmitPaymentDialog open={payOpen} onOpenChange={setPayOpen}
            context="maintenance"
            ticketId={ticketId}
            quoteId={acceptedQuote.id}
            payeeId={techId}
            defaultAmount={acceptedQuote.price}
            onDone={load} />
        )}
      </SheetContent>
    </Sheet>
  );
}
