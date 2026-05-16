import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitQuote, counterQuote, MaintenanceQuote, QuoteRole } from "@/lib/maintenance";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: string;
  technicianId: string;
  role: QuoteRole;
  parent?: MaintenanceQuote;
  onDone?: () => void;
}

export function QuoteFormDialog({ open, onOpenChange, ticketId, technicianId, role, parent, onDone }: Props) {
  const [price, setPrice] = useState(parent?.price?.toString() ?? "");
  const [scope, setScope] = useState(parent?.scope ?? "");
  const [start, setStart] = useState(parent?.proposed_start_at?.slice(0, 16) ?? "");
  const [end, setEnd] = useState(parent?.proposed_end_at?.slice(0, 16) ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!price || Number(price) <= 0) return toast.error("Price must be > 0");
    if (!scope.trim()) return toast.error("Scope is required");
    if (!start || !end) return toast.error("Start and end times required");
    setBusy(true);
    try {
      const payload = {
        price: Number(price),
        scope: scope.trim(),
        proposed_start_at: new Date(start).toISOString(),
        proposed_end_at: new Date(end).toISOString(),
        notes: notes.trim() || undefined,
      };
      const { error } = parent
        ? await counterQuote(parent, payload, role)
        : await submitQuote({ ticket_id: ticketId, technician_id: technicianId, created_by_role: role, ...payload });
      if (error) throw error;
      toast.success(parent ? "Counter-quote sent" : "Quote submitted");
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parent ? "Counter quote" : "Submit quote"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Price (PKR)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label>Scope of work</Label>
            <Textarea rows={3} value={scope} onChange={(e) => setScope(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{parent ? "Send counter" : "Submit quote"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
