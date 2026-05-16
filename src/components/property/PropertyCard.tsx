import { Link } from "react-router-dom";
import { MapPin, BedDouble, Bath, Maximize, ShieldCheck, Heart } from "lucide-react";
import { formatPKR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export type PropertyCardData = {
  id: string;
  title: string;
  city: string;
  address: string;
  monthly_rent: number;
  bedrooms: number;
  bathrooms: number;
  area_marlas?: number | null;
  area_sqft?: number | null;
  society?: string | null;
  type: string;
  is_verified?: boolean | null;
  cover_url?: string | null;
};

export function PropertyCard({
  p,
  onFavorite,
  isFavorite,
}: {
  p: PropertyCardData;
  onFavorite?: (id: string) => void;
  isFavorite?: boolean;
}) {
  return (
    <Link
      to={`/properties/${p.id}`}
      className="group block rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {p.cover_url ? (
          <img
            src={p.cover_url}
            alt={p.title}
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
            No image
          </div>
        )}
        {p.is_verified && (
          <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground gap-1">
            <ShieldCheck className="h-3 w-3" />Verified
          </Badge>
        )}
        {onFavorite && (
          <button
            onClick={(e) => { e.preventDefault(); onFavorite(p.id); }}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/90 grid place-items-center hover:bg-background"
            aria-label="Toggle favorite"
          >
            <Heart className={`h-4 w-4 ${isFavorite ? "fill-destructive text-destructive" : ""}`} />
          </button>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold line-clamp-1">{p.title}</h3>
          <span className="text-primary font-bold whitespace-nowrap">{formatPKR(p.monthly_rent)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          <span className="line-clamp-1">
            {p.society ? `${p.society}, ` : ""}{p.city}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1 border-t">
          <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4" />{p.bedrooms}</span>
          <span className="inline-flex items-center gap-1"><Bath className="h-4 w-4" />{p.bathrooms}</span>
          <span className="inline-flex items-center gap-1"><Maximize className="h-4 w-4" />{p.area_marlas ?? 0} Marla</span>
          <Badge variant="secondary" className="ml-auto capitalize">{p.type}</Badge>
        </div>
      </div>
    </Link>
  );
}
