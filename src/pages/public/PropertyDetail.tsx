import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatPKR } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { PropertyMap } from "@/components/map/PropertyMap";
import { ConfigBanner } from "@/components/feedback/Feedback";
import { BedDouble, Bath, Maximize, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function PropertyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, role } = useAuth();
  const [p, setP] = useState<any>(null);
  const [images, setImages] = useState<{ url: string }[]>([]);
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !id) { setLoading(false); return; }
    (async () => {
      const { data: prop, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) console.error("property fetch error:", error);

      if (prop) {
        const [{ data: imgs }, { data: profile }] = await Promise.all([
          supabase.from("property_images")
            .select("url,sort_order")
            .eq("property_id", id)
            .order("sort_order"),
          supabase.from("profiles")
            .select("full_name, phone")
            .eq("id", prop.landlord_id)
            .maybeSingle(),
        ]);
        setP({ ...prop, profiles: profile ?? null });
        setImages(imgs ?? []);
      }
      setLoading(false);
    })();
  }, [id]);

  const apply = async () => {
    if (!user) { nav("/login"); return; }
    if (role !== "tenant") { toast.error("Only tenants can apply"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("applications").insert({
      property_id: id, tenant_id: user.id, message, status: "pending",
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Application submitted — now upload your documents so the landlord can review.");
      setMessage("");
      nav("/app/tenant/applications");
    }
  };

  if (!isSupabaseConfigured) return <div className="container mx-auto px-4 py-8"><ConfigBanner /></div>;
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!p) return <div className="p-10 text-center">Property not found. <Link to="/browse" className="text-primary underline">Back to browse</Link></div>;

  return (
    <div className="container mx-auto px-4 py-6 grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <div className="aspect-[16/10] rounded-xl bg-muted overflow-hidden border">
            {images[active]?.url ? (
              <img src={images[active].url} alt={p.title} className="h-full w-full object-cover" />
            ) : <div className="grid place-items-center h-full text-muted-foreground">No image</div>}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2 mt-2">
              {images.slice(0, 5).map((img, i) => (
                <button key={i} onClick={() => setActive(i)}
                  className={`aspect-[4/3] rounded-md overflow-hidden border-2 ${i === active ? "border-primary" : "border-transparent"}`}>
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">{p.title}</h1>
              <p className="text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-4 w-4" />{p.address}, {p.city}</p>
            </div>
            {p.is_verified && <Badge className="gap-1 bg-primary"><ShieldCheck className="h-3 w-3" />Verified</Badge>}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted"><BedDouble className="h-4 w-4" />{p.bedrooms} beds</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted"><Bath className="h-4 w-4" />{p.bathrooms} baths</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted"><Maximize className="h-4 w-4" />{p.area_sqft} ft²</span>
            <Badge variant="secondary" className="capitalize self-center">{p.type}</Badge>
          </div>
          <div className="prose prose-sm max-w-none mt-6 whitespace-pre-line text-foreground/90">
            {p.description}
          </div>
        </div>

        <div>
          <h2 className="font-display font-semibold mb-3">Location</h2>
          <PropertyMap markers={[{ id: p.id, title: p.title, lat: Number(p.lat), lng: Number(p.lng) }]} height={320} />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-5 sticky top-20">
          <div className="text-3xl font-display font-bold text-primary">{formatPKR(p.monthly_rent)}<span className="text-base text-muted-foreground font-normal">/month</span></div>
          <div className="text-sm text-muted-foreground mt-1">Security deposit: {formatPKR(p.deposit)}</div>
          <div className="border-t my-4" />
          <div className="text-sm space-y-1">
            <div className="text-muted-foreground">Listed by</div>
            <div className="font-medium">{p.profiles?.full_name ?? "Landlord"}</div>
            {p.profiles?.phone && <div className="text-muted-foreground">{p.profiles.phone}</div>}
          </div>
          <div className="border-t my-4" />
          {p.status !== "active" ? (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              This property is currently <span className="font-medium capitalize">{p.status}</span> and
              not accepting applications.
            </div>
          ) : (
            <>
              <Textarea placeholder="Message to landlord (optional)…" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
              <Button className="w-full mt-3" onClick={apply} disabled={submitting}>
                {user ? "Apply now" : "Log in to apply"}
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
