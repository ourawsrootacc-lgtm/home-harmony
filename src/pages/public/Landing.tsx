import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Building2, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PK_CITIES } from "@/lib/constants";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { PropertyCard, PropertyCardData } from "@/components/property/PropertyCard";

type CityCount = { city: string; count: number };

export default function Landing() {
  const [stats, setStats] = useState({ properties: 0, landlords: 0 });
  const [cityCounts, setCityCounts] = useState<CityCount[]>([]);
  const [recent, setRecent] = useState<PropertyCardData[]>([]);
  const [audience, setAudience] = useState<"tenant" | "landlord">("tenant");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { count: propCount } = await supabase
        .from("properties").select("id", { count: "exact", head: true }).eq("status", "active");

      const { count: landlordCount } = await supabase
        .from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "landlord");

      setStats({ properties: propCount ?? 0, landlords: landlordCount ?? 0 });

      const cityResults = await Promise.all(
        PK_CITIES.map(async (c) => {
          const { count } = await supabase
            .from("properties").select("id", { count: "exact", head: true })
            .eq("status", "active").eq("city", c);
          return { city: c, count: count ?? 0 };
        })
      );
      setCityCounts(cityResults);

      const { data } = await supabase
        .from("properties")
        .select("id,title,city,society,address,monthly_rent,bedrooms,bathrooms,area_marlas,type,is_verified,property_images(url)")
        .eq("status", "active").order("created_at", { ascending: false }).limit(4);
      setRecent((data ?? []).map((r: any) => ({ ...r, cover_url: r.property_images?.[0]?.url ?? null })));
    })();
  }, []);

  const steps = audience === "tenant"
    ? [
        { t: "Search", d: "Filter by city, society, beds and budget. Zero noise." },
        { t: "Apply", d: "Share CNIC + income proof once. Landlord reviews in a tap." },
        { t: "Move in", d: "Sign the lease in-app, pay deposit, get the keys." },
      ]
    : [
        { t: "List", d: "Add photos, marlas, society — live in under 2 minutes." },
        { t: "Approve", d: "Vet tenants with verified documents and chat." },
        { t: "Get paid", d: "Track rent, deposits and maintenance — all in one place." },
      ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background -z-10" />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl -z-10" />
        <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl -z-10" />

        <div className="container mx-auto px-4 py-16 md:py-28 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full mb-5">
            <Sparkles className="h-3 w-3" /> Pakistan's modern rental platform
          </span>
          <h1 className="font-display text-4xl md:text-6xl font-bold max-w-3xl mx-auto leading-tight">
            Find your next home, <span className="text-primary">simply</span>.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-xl mx-auto md:text-lg">
            Browse rentals across five major cities of Pakistan — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/browse"><Search className="h-4 w-4 mr-2" />Browse properties</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/signup">List your property</Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {PK_CITIES.map((c) => (
              <Link key={c} to={`/browse?city=${encodeURIComponent(c)}`}
                className="px-3 py-1.5 rounded-full border bg-card text-sm hover:border-primary hover:text-primary transition">
                {c}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="container mx-auto px-4 -mt-4">
        <div className="rounded-2xl border bg-card grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0">
          {[
            { label: "Active listings", value: stats.properties.toLocaleString() },
            { label: "Cities covered", value: "5" },
            { label: "Verified landlords", value: stats.landlords.toLocaleString() },
            { label: "Avg. reply time", value: "< 2 hr" },
          ].map((s) => (
            <div key={s.label} className="p-6 text-center">
              <div className="font-display text-2xl md:text-3xl font-bold text-primary">{s.value}</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured cities */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold">Explore by city</h2>
            <p className="text-muted-foreground text-sm mt-1">Hand-picked rentals from the five cities we serve.</p>
          </div>
          <Link to="/browse" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {(cityCounts.length ? cityCounts : PK_CITIES.map((c) => ({ city: c, count: 0 }))).map((c, i) => (
            <Link key={c.city} to={`/browse?city=${encodeURIComponent(c.city)}`}
              className="group relative rounded-xl border bg-card p-5 overflow-hidden hover:shadow-md transition">
              <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-60 ${
                ["bg-primary/30","bg-primary/20","bg-primary/40","bg-primary/15","bg-primary/25"][i % 5]
              }`} />
              <MapPin className="h-5 w-5 text-primary mb-3" />
              <div className="font-display font-semibold text-lg">{c.city}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {c.count > 0 ? `${c.count} active listing${c.count === 1 ? "" : "s"}` : "Coming up"}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mt-3 group-hover:translate-x-1 group-hover:text-primary transition" />
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/30 border-y">
        <div className="container mx-auto px-4 py-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl md:text-3xl font-bold">How it works</h2>
              <p className="text-muted-foreground text-sm mt-1">From search to keys in three steps.</p>
            </div>
            <div className="inline-flex rounded-full border bg-card p-1 self-start md:self-auto">
              {(["tenant","landlord"] as const).map((a) => (
                <button key={a} onClick={() => setAudience(a)}
                  className={`px-4 py-1.5 text-sm rounded-full capitalize transition ${
                    audience === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {a === "tenant" ? "I'm renting" : "I'm a landlord"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {steps.map((s, i) => (
              <div key={s.t} className="rounded-xl border bg-card p-6 relative">
                <div className="absolute -top-3 -left-3 h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold">
                  {i + 1}
                </div>
                <h3 className="font-display font-semibold text-lg mt-2">{s.t}</h3>
                <p className="text-sm text-muted-foreground mt-1">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently added */}
      {recent.length > 0 && (
        <section className="container mx-auto px-4 py-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-2xl md:text-3xl font-bold">Just added</h2>
              <p className="text-muted-foreground text-sm mt-1">Fresh listings from this week.</p>
            </div>
            <Link to="/browse" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
              See more <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recent.map((p) => <PropertyCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container mx-auto px-4 pb-20">
        <div className="rounded-2xl border bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-8 md:p-12 text-center">
          <Building2 className="h-8 w-8 mx-auto mb-3 opacity-80" />
          <h2 className="font-display text-2xl md:text-3xl font-bold">Own a property in one of the big five?</h2>
          <p className="opacity-90 mt-2 max-w-xl mx-auto">
            List it free, vet tenants with verified documents, and manage everything from one dashboard.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-5">
            <Link to="/signup">Start listing <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {PK_CITIES.map((c) => (
              <Badge key={c} variant="secondary" className="bg-primary-foreground/15 text-primary-foreground border-0">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
