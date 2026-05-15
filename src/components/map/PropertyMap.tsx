import { useEffect, useRef, useState } from "react";
import { MapPin, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export type MapMarker = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  price?: number;
};

export function MapFallback({ markers, height = 480 }: { markers: MapMarker[]; height?: number }) {
  const cities = Array.from(new Set(markers.map((m) => (m as any).city).filter(Boolean)));
  return (
    <div
      className="rounded-xl border bg-muted/40 flex flex-col items-center justify-center p-6 text-center"
      style={{ minHeight: height }}
      role="status"
    >
      <div className="rounded-full bg-amber-100 text-amber-700 p-3 mb-3">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="font-display font-semibold">Map unavailable right now</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1">
        We can't load the interactive map. Property listings still work perfectly below.
      </p>
      {cities.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {cities.slice(0, 8).map((c) => (
            <Badge key={c} variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />{c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function PropertyMap({
  markers,
  height = 480,
  onMarkerClick,
}: {
  markers: MapMarker[];
  height?: number;
  onMarkerClick?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!TOKEN) { setFailed(true); return; }
    if (!ref.current) return;
    let map: any;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("mapbox-gl");
        const mapboxgl = mod.default;
        if (cancelled) return;
        mapboxgl.accessToken = TOKEN;
        map = new mapboxgl.Map({
          container: ref.current!,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [69.3451, 30.3753], // Pakistan
          zoom: 4.5,
        });
        map.on("error", () => setFailed(true));
        map.on("load", () => {
          if (cancelled) return;
          setReady(true);
          markers.forEach((m) => {
            if (isNaN(m.lat) || isNaN(m.lng)) return;
            if (m.lat < -90 || m.lat > 90 || m.lng < -180 || m.lng > 180) return;
            const el = document.createElement("button");
            el.className = "rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 shadow border border-white";
            el.textContent = m.price ? "Rs " + Math.round(m.price / 1000) + "k" : "•";
            el.addEventListener("click", () => onMarkerClick?.(m.id));
            new mapboxgl.Marker(el).setLngLat([m.lng, m.lat]).addTo(map);
          });
          if (markers.length > 0) {
            const valid = markers.filter((m) => !isNaN(m.lat) && !isNaN(m.lng));
            if (valid.length === 1) {
              map.setCenter([valid[0].lng, valid[0].lat]);
              map.setZoom(12);
            } else if (valid.length > 1) {
              const bounds = new mapboxgl.LngLatBounds();
              valid.forEach((m) => bounds.extend([m.lng, m.lat]));
              map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
            }
          }
        });
      } catch {
        setFailed(true);
      }
    })();

    return () => { cancelled = true; if (map) try { map.remove(); } catch { /* */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers.map((m) => m.id))]);

  if (failed) return <MapFallback markers={markers} height={height} />;
  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ height }}>
      <div ref={ref} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-muted/40 text-sm text-muted-foreground">
          Loading map…
        </div>
      )}
    </div>
  );
}
