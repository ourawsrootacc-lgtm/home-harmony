import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState, LoadingGrid } from "@/components/feedback/Feedback";
import { PropertyCard } from "@/components/property/PropertyCard";
import { Heart } from "lucide-react";
import { toast } from "sonner";

export default function TenantFavorites() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("favorites")
      .select("property_id, properties(id,title,city,address,monthly_rent,bedrooms,bathrooms,area_sqft,type,is_verified,property_images(url))")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRows((data ?? []).map((r: any) => ({ ...r.properties, cover_url: r.properties?.property_images?.[0]?.url })).filter((p: any) => p?.id));
        setLoading(false);
      });
  };
  useEffect(load, [user]);

  const remove = async (id: string) => {
    if (!user) return;
    await supabase.from("favorites").delete().eq("user_id", user.id).eq("property_id", id);
    toast.success("Removed from favorites");
    load();
  };

  return (
    <div>
      <PageHeader title="Favorites" description="Properties you've saved." />
      {loading ? <LoadingGrid /> : rows.length === 0 ? (
        <EmptyState title="No favorites yet" description="Tap the heart on any listing to save it here." icon={<Heart className="h-5 w-5" />} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => <PropertyCard key={r.id} p={r} onFavorite={remove} isFavorite />)}
        </div>
      )}
    </div>
  );
}
