import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AdminUsers() {
  const [rows, setRows] = useState<any[]>([]);

  const load = () => {
    supabase.from("profiles").select("*, user_roles(role)").order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, []);

  const ban = async (id: string, banned: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_banned: !banned }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(banned ? "Unbanned" : "Banned"); load(); }
  };

  return (
    <div>
      <PageHeader title="Users" description="Manage all platform users." />
      {rows.length === 0 ? <EmptyState title="No users found" /> : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((u) => (
            <div key={u.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{u.full_name ?? "—"}</div>
                <div className="text-sm text-muted-foreground">{u.phone ?? "no phone"} · {u.city ?? "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                {u.user_roles?.map((r: any) => <Badge key={r.role} variant="secondary" className="capitalize">{r.role}</Badge>)}
                {u.is_banned && <Badge className="bg-destructive text-destructive-foreground">Banned</Badge>}
              </div>
              <Button size="sm" variant="outline" onClick={() => ban(u.id, u.is_banned)}>{u.is_banned ? "Unban" : "Ban"}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
