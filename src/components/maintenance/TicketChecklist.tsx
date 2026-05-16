import { Check, Circle } from "lucide-react";
import { Attachment } from "@/lib/maintenanceAttachments";
import { MaintenanceQuote, TicketStatus } from "@/lib/maintenance";
import { PaymentRow } from "@/lib/payments";

interface Props {
  ticket: { status: TicketStatus; scheduled_start_at?: string | null };
  attachments: Attachment[];
  quotes: MaintenanceQuote[];
  payment: PaymentRow | null;
}

export function TicketChecklist({ ticket, attachments, quotes, payment }: Props) {
  const s = ticket.status;
  const hasIssuePhoto = attachments.some((a) => a.kind === "issue");
  const hasAfterPhoto = attachments.some((a) => a.kind === "after");
  const quoteAccepted = quotes.some((q) => q.status === "accepted");
  const scheduled = !!ticket.scheduled_start_at || ["scheduled","in_progress","work_done","tenant_verified","closed"].includes(s);
  const verified = ["tenant_verified","closed"].includes(s);
  const proofSubmitted = payment ? ["submitted","approved","rejected","disputed"].includes(payment.status) : false;
  const paid = payment?.status === "approved";
  const ready = verified && paid;

  const rows: { label: string; done: boolean }[] = [
    { label: "Issue photo uploaded", done: hasIssuePhoto },
    { label: "Quote accepted", done: quoteAccepted },
    { label: "Scheduled", done: scheduled },
    { label: "After photo uploaded", done: hasAfterPhoto },
    { label: "Verified by tenant", done: verified },
    { label: "Payment proof submitted", done: proofSubmitted },
    { label: "Payment approved", done: paid },
    { label: "Ready to close", done: ready },
  ];

  return (
    <ul className="rounded border bg-card divide-y text-sm">
      {rows.map((r) => (
        <li key={r.label} className="px-3 py-1.5 flex items-center gap-2">
          {r.done
            ? <Check className="h-4 w-4 text-emerald-600" />
            : <Circle className="h-4 w-4 text-muted-foreground" />}
          <span className={r.done ? "" : "text-muted-foreground"}>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
