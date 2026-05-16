import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  PaymentRow, METHOD_LABEL, CONTEXT_LABEL, STATUS_BADGE,
  hoursUntilAutoApprove, approvePayment, rejectPayment, disputePayment,
  getProofSignedUrl, allowedPaymentActions,
} from "@/lib/payments";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { FileText, ExternalLink } from "lucide-react";

interface Props {
  payment: PaymentRow;
  role: "payer" | "payee" | "admin";
  onChanged?: () => void;
}

export function PaymentCard({ payment, role, onChanged }: Props) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const acts = allowedPaymentActions(payment, role);
  const hours = hoursUntilAutoApprove(payment);

  const viewProof = async () => {
    if (!payment.proof_url) return toast.error("No proof attached");
    try {
      const url = await getProofSignedUrl(payment.proof_url);
      setProofUrl(url);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  const doApprove = async () => {
    const { error } = await approvePayment(payment.id);
    if (error) toast.error(error.message); else { toast.success("Approved"); onChanged?.(); }
  };
  const doReject = async () => {
    try { await rejectPayment(payment.id, reason); toast.success("Rejected"); setRejectOpen(false); setReason(""); onChanged?.(); }
    catch (e: any) { toast.error(e.message); }
  };
  const doDispute = async () => {
    try { await disputePayment(payment.id, reason); toast.success("Disputed"); setDisputeOpen(false); setReason(""); onChanged?.(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">PKR {payment.amount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">
            {CONTEXT_LABEL[payment.context]} · {METHOD_LABEL[payment.method]}
            {payment.reference_no && ` · Ref ${payment.reference_no}`}
          </div>
          <div className="text-xs text-muted-foreground">Submitted {relativeTime(payment.created_at)}</div>
        </div>
        <Badge className={`${STATUS_BADGE[payment.status]} capitalize`}>{payment.status.replace("_", " ")}</Badge>
      </div>

      {payment.notes && <p className="text-sm">{payment.notes}</p>}
      {payment.rejection_reason && (
        <p className="text-sm text-rose-700">Rejection: {payment.rejection_reason}</p>
      )}
      {payment.dispute_reason && (
        <p className="text-sm text-orange-700">Dispute: {payment.dispute_reason}</p>
      )}

      {payment.status === "submitted" && hours !== null && (
        <p className="text-xs text-amber-700">
          Auto-approves in ~{Math.ceil(hours)}h if no action taken.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {payment.proof_url && (
          <Button size="sm" variant="outline" onClick={viewProof}>
            <FileText className="h-3.5 w-3.5 mr-1" />View proof
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        )}
        {acts.approve && <Button size="sm" onClick={doApprove}>Approve</Button>}
        {acts.reject && <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button>}
        {acts.dispute && <Button size="sm" variant="ghost" onClick={() => setDisputeOpen(true)}>Dispute</Button>}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject payment</DialogTitle></DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (≥10 chars)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={doReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispute payment</DialogTitle></DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (≥10 chars)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={doDispute}>Open dispute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
