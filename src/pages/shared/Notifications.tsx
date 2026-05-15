import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { relativeTime } from "@/lib/format";
import { Bell } from "lucide-react";

export default function Notifications() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
    load();
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null).then(load);
  }, [user]);

  return (
    <div>
      <PageHeader title="Notifications" description="Recent activity on your account." />
      {rows.length === 0 ? <EmptyState title="You're all caught up" icon={<Bell className="h-5 w-5" />} /> : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((n) => (
            <div key={n.id} className="p-4">
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
              <div className="text-xs text-muted-foreground mt-1">{relativeTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
