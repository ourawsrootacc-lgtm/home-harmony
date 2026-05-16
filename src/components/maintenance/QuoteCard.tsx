import { MaintenanceQuote, respondToQuote } from "@/lib/maintenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { relativeTime } from "@/lib/format";

interface Props {
  quote: MaintenanceQuote;
  canAccept?: boolean;
  canCounter?: boolean;
  onCounter?: (q: MaintenanceQuote) => void;
  onDone?: () => void;
}

export function QuoteCard({ quote, canAccept, canCounter, onCounter, onDone }: Props) {
  const respond = async (action: "accepted" | "declined") => {
    const { error } = await respondToQuote(quote.id, action);
    if (error) toast.error(error.message);
    else { toast.success(`Quote ${action}`); onDone?.(); }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">PKR {quote.price.toLocaleString()}</div>
        <Badge variant="outline" className="capitalize">{quote.status}</Badge>
      </div>
      <div className="text-sm">{quote.scope}</div>
      <div className="text-xs text-muted-foreground">
        {new Date(quote.proposed_start_at).toLocaleString()} → {new Date(quote.proposed_end_at).toLocaleString()}
      </div>
      {quote.notes && <div className="text-xs italic text-muted-foreground">{quote.notes}</div>}
      <div className="text-xs text-muted-foreground">Proposed {relativeTime(quote.created_at)}</div>
      {quote.status === "pending" && (
        <div className="flex gap-2 pt-1">
          {canAccept && <Button size="sm" onClick={() => respond("accepted")}>Accept</Button>}
          {canCounter && <Button size="sm" variant="outline" onClick={() => onCounter?.(quote)}>Counter</Button>}
          {canAccept && <Button size="sm" variant="ghost" onClick={() => respond("declined")}>Decline</Button>}
        </div>
      )}
    </div>
  );
}
