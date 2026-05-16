import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelTicket, computeCancellationFee } from "@/lib/maintenance";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: string;
  cancelledByRole: "tenant" | "landlord" | "technician" | "admin";
  scheduledStartAt?: string | null;
  acceptedQuotePrice?: number;
  onDone?: () => void;
}

export function CancelDialog({ open, onOpenChange, ticketId, cancelledByRole, scheduledStartAt, acceptedQuotePrice, onDone }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { fee, within_24h } = computeCancellationFee({
    scheduled_start_at: scheduledStartAt,
    accepted_quote_price: acceptedQuotePrice,
  });

  const submit = async () => {
    if (reason.trim().length < 10) return toast.error("Please provide a reason (≥10 chars)");
    setBusy(true);
    try {
      const r1 = await cancelTicket({
        ticket_id: ticketId,
        cancelled_by_role: cancelledByRole,
        reason_code: "user_initiated",
        notes: reason.trim(),
        accepted_quote_price: acceptedQuotePrice,
        scheduled_start_at: scheduledStartAt ?? null,
      });
      if (r1.error) throw r1.error;
      const r2 = await supabase.from("maintenance_tickets")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (r2.error) throw r2.error;
      toast.success("Ticket cancelled");
      onDone?.();
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel ticket</DialogTitle>
        </DialogHeader>
        {within_24h && fee > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Cancelling within 24h of the scheduled start incurs a fee of <strong>PKR {fee.toLocaleString()}</strong> (10% of accepted quote).
          </div>
        )}
        <div>
          <Textarea rows={3} placeholder="Reason for cancellation (≥10 chars)"
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep ticket</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>Confirm cancellation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
