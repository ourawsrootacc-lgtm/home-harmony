import { useEffect, useState } from "react";
import { getTicketTimeline, MaintenanceEvent } from "@/lib/maintenance";
import { relativeTime } from "@/lib/format";
import { Clock } from "lucide-react";

export function TicketTimeline({ ticketId }: { ticketId: string }) {
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  useEffect(() => {
    getTicketTimeline(ticketId).then(({ data }) => setEvents((data as any) ?? []));
  }, [ticketId]);

  if (!events.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-3 border-l ml-2 pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[22px] top-1 inline-flex h-3 w-3 rounded-full bg-primary" />
          <div className="text-sm font-medium capitalize">
            {e.event_type.replace(/_/g, " ")}
            {e.to_state && <span className="text-muted-foreground"> → {e.to_state}</span>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />{relativeTime(e.created_at)}
          </div>
        </li>
      ))}
    </ol>
  );
}
