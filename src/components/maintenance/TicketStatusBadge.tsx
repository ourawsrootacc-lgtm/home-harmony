import { STATUS_LABEL, TicketStatus } from "@/lib/maintenance";
import { Badge } from "@/components/ui/badge";

const STATUS_COLOR: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  submitted: "bg-amber-100 text-amber-800",
  triaged: "bg-slate-100 text-slate-800",
  dispatched: "bg-indigo-100 text-indigo-800",
  quoted: "bg-blue-100 text-blue-800",
  counter_quote: "bg-blue-100 text-blue-800",
  scheduled: "bg-violet-100 text-violet-800",
  reschedule_requested: "bg-violet-100 text-violet-800",
  in_progress: "bg-cyan-100 text-cyan-800",
  work_done: "bg-teal-100 text-teal-800",
  resolved: "bg-teal-100 text-teal-800",
  tenant_verified: "bg-emerald-100 text-emerald-800",
  disputed: "bg-orange-100 text-orange-800",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-800",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge className={STATUS_COLOR[status] ?? "bg-muted"}>{STATUS_LABEL[status] ?? status}</Badge>;
}
