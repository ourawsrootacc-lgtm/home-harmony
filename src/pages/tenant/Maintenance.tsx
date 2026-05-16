import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maintenanceSchema } from "@/lib/validators";
import { z } from "zod";
import { toast } from "sonner";
import { relativeTime } from "@/lib/format";
import { TicketStatusBadge } from "@/components/maintenance/TicketStatusBadge";
import { TicketDetailDrawer } from "@/components/maintenance/TicketDetailDrawer";
import { TicketStatus } from "@/lib/maintenance";
import { uploadAttachment } from "@/lib/maintenanceAttachments";

type FV = z.infer<typeof maintenanceSchema>;

export default function TenantMaintenance() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [lease, setLease] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [funded, setFunded] = useState<"landlord" | "tenant">("landlord");
  const [photos, setPhotos] = useState<File[]>([]);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FV>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: { category: "plumbing", priority: "medium", description: "" },
  });
  const cat = watch("category"); const pri = watch("priority");

  const load = () => {
    if (!user) return;
    supabase.from("maintenance_tickets")
      .select("*, properties(title)").eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTickets(data ?? []));
    supabase.from("leases").select("property_id").eq("tenant_id", user.id).eq("status", "active").maybeSingle()
      .then(({ data }) => setLease(data));
  };
  useEffect(load, [user]);

  const onSubmit = async (v: FV) => {
    if (!user || !lease?.property_id) { toast.error("You need an active lease to submit a ticket"); return; }
    const { error } = await supabase.from("maintenance_tickets").insert({
      tenant_id: user.id, property_id: lease.property_id, ...v,
      status: "submitted", funded_by: funded,
    });
    if (error) toast.error(error.message);
    else { toast.success("Ticket submitted"); reset(); load(); }
  };

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Maintenance" description="Report issues, negotiate quotes, and verify completed work." />
        {!lease ? (
          <EmptyState title="You need an active lease" description="Once a landlord activates your lease, you can submit maintenance tickets." />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5 grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={cat} onValueChange={(v) => setValue("category", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["plumbing","electrical","appliance","structural","other"].map(c =>
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={pri} onValueChange={(v) => setValue("priority", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low","medium","high"].map(p =>
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Funded by</Label>
              <Select value={funded} onValueChange={(v) => setFunded(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landlord">Landlord (normal repair)</SelectItem>
                  <SelectItem value="tenant">Tenant (my request / my damage)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={3} {...register("description")} placeholder="Briefly describe the issue…" />
              {errors.description && <p className="text-xs text-destructive mt-1">{errors.description.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <Button disabled={isSubmitting}>Submit ticket</Button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Recent tickets</h2>
        {tickets.length === 0 ? (
          <EmptyState title="No tickets yet" />
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setOpenId(t.id)}
                className="w-full text-left rounded-xl border bg-card p-4 flex items-center gap-4 hover:bg-muted/40 transition">
                <div className="flex-1 min-w-0">
                  <div className="font-medium capitalize">{t.category} · <span className="text-muted-foreground font-normal">{t.properties?.title}</span></div>
                  <div className="text-sm text-muted-foreground line-clamp-1">{t.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Submitted {relativeTime(t.created_at)} · priority {t.priority} · funded by {t.funded_by}</div>
                </div>
                <TicketStatusBadge status={t.status as TicketStatus} />
              </button>
            ))}
          </div>
        )}
      </div>

      <TicketDetailDrawer ticketId={openId} role="tenant" onOpenChange={(v) => { if (!v) { setOpenId(null); load(); } }} />
    </div>
  );
}
