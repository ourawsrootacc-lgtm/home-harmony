import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  submitPayment, uploadPaymentProof, listMethodsFor, PaymentMethod, PaymentContext,
  METHOD_LABEL, PaymentMethodRow,
} from "@/lib/payments";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: PaymentContext;
  payeeId: string;
  leaseId?: string | null;
  ticketId?: string | null;
  quoteId?: string | null;
  defaultAmount?: number;
  onDone?: () => void;
}

export function SubmitPaymentDialog({
  open, onOpenChange, context, payeeId, leaseId, ticketId, quoteId, defaultAmount, onDone,
}: Props) {
  const [amount, setAmount] = useState(defaultAmount?.toString() ?? "");
  const [method, setMethod] = useState<PaymentMethod>("easypaisa");
  const [refNo, setRefNo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [payeeMethods, setPayeeMethods] = useState<PaymentMethodRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount?.toString() ?? "");
    listMethodsFor(payeeId).then(setPayeeMethods);
  }, [open, payeeId, defaultAmount]);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Amount must be > 0");
    if (method !== "cash" && !refNo.trim()) return toast.error("Reference number required");
    setBusy(true);
    try {
      let proof_url: string | null = null;
      if (file) proof_url = await uploadPaymentProof(file);
      const { error } = await submitPayment({
        context, payee_id: payeeId, lease_id: leaseId, ticket_id: ticketId, quote_id: quoteId,
        amount: Number(amount), method,
        reference_no: method === "cash" ? null : refNo.trim(),
        proof_url, notes: notes.trim() || null,
        paid_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Payment proof submitted");
      onDone?.();
      onOpenChange(false);
      setFile(null); setRefNo(""); setNotes("");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload payment proof</DialogTitle>
        </DialogHeader>

        {payeeMethods.length > 0 && (
          <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
            <div className="font-medium">Send payment to:</div>
            {payeeMethods.map((m) => (
              <div key={m.id} className="text-xs">
                <span className="capitalize font-medium">{METHOD_LABEL[m.kind]}</span>
                {m.bank_name && ` · ${m.bank_name}`} · {m.account_title}
                {m.account_number && ` · ${m.account_number}`}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Amount (PKR)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABEL) as PaymentMethod[])
                  .filter((m) => m !== "cash")
                  .map((m) => (
                    <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {method !== "cash" && (
            <div>
              <Label>Reference / transaction ID</Label>
              <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="e.g. EasyPaisa TID" />
            </div>
          )}
          <div>
            <Label>Proof of payment (screenshot / receipt)</Label>
            <Input type="file" accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Submit proof</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
