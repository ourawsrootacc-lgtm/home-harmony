import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { findDispatchableTechnicians, dispatchTicket } from "@/lib/maintenance";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: string;
  city?: string;
  skill?: string;
  onDone?: () => void;
}

export function TechnicianPicker({ open, onOpenChange, ticketId, city, skill, onDone }: Props) {
  const [techs, setTechs] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    findDispatchableTechnicians({ city, skill }).then(({ data }) => setTechs(data ?? []));
    setSelected([]);
  }, [open, city, skill]);

  const toggle = (id: string) =>
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const dispatch = async () => {
    if (!selected.length) return toast.error("Select at least one technician");
    setBusy(true);
    try {
      const res = await dispatchTicket({ ticketId, technicianIds: selected, expiresInHours: 24 });
      if (res.error) throw res.error;
      toast.success(`Offered to ${selected.length} technician(s)`);
      onDone?.();
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispatch to technicians</DialogTitle>
          <p className="text-sm text-muted-foreground">First to accept wins. Offer expires in 24h.</p>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {techs.length === 0 && <p className="text-sm text-muted-foreground">No dispatchable technicians found.</p>}
          {techs.map((t: any) => (
            <label key={t.user_id} className="flex items-start gap-3 rounded border p-3 cursor-pointer hover:bg-muted/50">
              <Checkbox checked={selected.includes(t.user_id)} onCheckedChange={() => toggle(t.user_id)} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t.profiles?.full_name ?? "Technician"}</div>
                <div className="text-xs text-muted-foreground">
                  Skills: {(t.skills ?? []).join(", ") || "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  ★ {Number(t.rating_avg ?? 0).toFixed(1)} · {t.jobs_completed ?? 0} jobs · PKR {t.hourly_rate ?? 0}/hr
                </div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={dispatch} disabled={busy}>Broadcast to {selected.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
