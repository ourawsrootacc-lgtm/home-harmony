import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { formatPKR } from "@/lib/format";
import { toast } from "sonner";

export default function AdminListings() {
  const [rows, setRows] = useState<any[]>([]);

  const load = () => {
    supabase.from("properties").select("id,title,city,monthly_rent,is_verified,status,profiles:landlord_id(full_name)").order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, []);

  const verify = async (id: string, current: boolean) => {
    const { error } = await supabase.from("properties").update({ is_verified: !current }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Updated"); load(); }
  };

  return (
    <div>
      <PageHeader title="Listing verification" description="Approve or unverify property listings." />
      {rows.length === 0 ? <EmptyState title="No listings" /> : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((p) => (
            <div key={p.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <Link to={`/properties/${p.id}`} className="font-semibold hover:underline">{p.title}</Link>
                <div className="text-sm text-muted-foreground">{p.city} · by {p.profiles?.full_name ?? "—"} · {formatPKR(p.monthly_rent)}/mo</div>
              </div>
              <Badge variant="secondary" className="capitalize">{p.status}</Badge>
              {p.is_verified && <Badge className="bg-primary">Verified</Badge>}
              <Button size="sm" variant="outline" onClick={() => verify(p.id, p.is_verified)}>{p.is_verified ? "Unverify" : "Verify"}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
