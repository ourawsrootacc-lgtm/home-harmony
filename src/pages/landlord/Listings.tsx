import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState, LoadingGrid } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DoorOpen } from "lucide-react";
import { formatPKR } from "@/lib/format";
import { toast } from "sonner";
import { terminateLease } from "@/lib/lease";

export default function LandlordListings() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user) return;
    setLoading(true);
    supabase.from("properties")
      .select("*, property_images(url)")
      .eq("landlord_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  };
  useEffect(load, [user]);

  const remove = async (id: string) => {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const endLease = async (propertyId: string) => {
    const reason = prompt(
      "Reason for ending the lease (statutory ground, mutual agreement, etc.):",
      "mutual_agreement",
    );
    if (!reason) return;
    const { data: l } = await supabase
      .from("leases").select("id")
      .eq("property_id", propertyId).eq("status", "active").maybeSingle();
    if (!l) { toast.error("No active lease found"); return; }
    try { await terminateLease(l.id, reason); toast.success("Lease ended, property released."); load(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <div>
      <PageHeader title="My listings" description="All your published, draft and inactive properties."
        action={<Button asChild><Link to="/app/landlord/listings/new"><Plus className="h-4 w-4 mr-1" />New listing</Link></Button>} />
      {loading ? <LoadingGrid /> : rows.length === 0 ? (
        <EmptyState title="No listings yet" description="Add your first property to start receiving applications." action={<Button asChild><Link to="/app/landlord/listings/new">Create listing</Link></Button>} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-3 flex items-center gap-4">
              <div className="h-20 w-28 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {r.property_images?.[0]?.url ? <img src={r.property_images[0].url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold line-clamp-1">{r.title}</div>
                <div className="text-sm text-muted-foreground line-clamp-1">{r.address}, {r.city}</div>
                <div className="text-sm mt-1 flex items-center gap-2">
                  <span className="font-semibold text-primary">{formatPKR(r.monthly_rent)}/mo</span>
                  <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                  {r.is_verified && <Badge className="bg-primary">Verified</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button asChild variant="ghost" size="sm"><Link to={`/app/landlord/listings/${r.id}/edit`}><Pencil className="h-4 w-4" /></Link></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
