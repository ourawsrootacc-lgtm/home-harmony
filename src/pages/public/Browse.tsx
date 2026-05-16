import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { PropertyCard, PropertyCardData } from "@/components/property/PropertyCard";
import { PropertyMap, MapFallback } from "@/components/map/PropertyMap";
import { LoadingGrid, EmptyState, ConfigBanner } from "@/components/feedback/Feedback";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PK_CITIES, PK_SOCIETIES, PROPERTY_TYPES, type PkCity } from "@/lib/constants";
import { Search, Map as MapIcon, List } from "lucide-react";

type Row = PropertyCardData & { lat: number; lng: number };

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);

  const city = params.get("city") ?? "";
  const society = params.get("society") ?? "";
  const type = params.get("type") ?? "";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";
  const q = params.get("q") ?? "";

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from("properties")
      .select("id,title,city,society,address,monthly_rent,bedrooms,bathrooms,area_marlas,type,is_verified,lat,lng,property_images(url)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(60);

    if (city) query = query.eq("city", city);
    if (society) query = query.eq("society", society);
    if (type) query = query.eq("type", type);
    if (min) query = query.gte("monthly_rent", Number(min));
    if (max) query = query.lte("monthly_rent", Number(max));
    if (q) query = query.ilike("title", `%${q}%`);

    query.then(({ data }) => {
      const mapped: Row[] = (data ?? []).map((r: any) => ({
        ...r,
        cover_url: r.property_images?.[0]?.url ?? null,
      }));
      setRows(mapped);
      setLoading(false);
    });
  }, [city, society, type, min, max, q]);

  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value); else p.delete(key);
    setParams(p, { replace: true });
  };

  const markers = useMemo(
    () => rows.map((r) => ({ id: r.id, title: r.title, lat: r.lat, lng: r.lng, price: r.monthly_rent })),
    [rows]
  );

  return (
    <div className="container mx-auto px-4 py-6">
      {!isSupabaseConfigured && <ConfigBanner />}

      <div className="rounded-xl border bg-card p-3 mb-6 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by title…" defaultValue={q}
            onKeyDown={(e) => { if (e.key === "Enter") update("q", (e.target as HTMLInputElement).value); }} />
        </div>
        <Select value={city || "all"} onValueChange={(v) => { update("city", v === "all" ? "" : v); update("society", ""); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {PK_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {city && (
          <Select value={society || "all"} onValueChange={(v) => update("society", v === "all" ? "" : v)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Society" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All societies</SelectItem>
              {(PK_SOCIETIES[city as PkCity] ?? []).filter((s) => s !== "Other").map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={type || "all"} onValueChange={(v) => update("type", v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="w-[120px]" placeholder="Min rent" defaultValue={min}
          onBlur={(e) => update("min", e.target.value)} />
        <Input className="w-[120px]" placeholder="Max rent" defaultValue={max}
          onBlur={(e) => update("max", e.target.value)} />
        <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Reset</Button>
        <Button variant="outline" className="md:hidden" onClick={() => setShowMap((s) => !s)}>
          {showMap ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-6">
        <div>
          {loading ? <LoadingGrid /> : rows.length === 0 ? (
            <EmptyState title="No properties match your filters" description="Try clearing or widening the filters." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rows.map((r) => <PropertyCard key={r.id} p={r} />)}
            </div>
          )}
        </div>
        <div className={`${showMap ? "" : "hidden"} lg:block sticky top-20 h-fit`}>
          {rows.length === 0 ? (
            <MapFallback markers={[]} height={520} />
          ) : (
            <PropertyMap markers={markers} height={520} onMarkerClick={(id) => nav(`/properties/${id}`)} />
          )}
        </div>
      </div>
    </div>
  );
}
