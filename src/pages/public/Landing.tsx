import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, ArrowRight, FileCheck, Receipt, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PK_CITIES } from "@/lib/constants";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { PropertyCard, PropertyCardData } from "@/components/property/PropertyCard";

type CityCount = { city: string; count: number };

export default function Landing() {
  const [cityCounts, setCityCounts] = useState<CityCount[]>([]);
  const [recent, setRecent] = useState<PropertyCardData[]>([]);
  const [audience, setAudience] = useState<"tenant" | "landlord">("tenant");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
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
        { t: "Search", d: "Filter by city, society, beds and budget." },
        { t: "Apply", d: "Share CNIC and income proof once. The landlord reviews in-app." },
        { t: "Move in", d: "Sign the lease in-app, pay the deposit, get the keys." },
      ]
    : [
        { t: "List", d: "Add photos, marlas and society details in a couple of minutes." },
        { t: "Approve", d: "Review verified documents and chat with applicants directly." },
        { t: "Manage", d: "Track rent, deposits and maintenance from one dashboard." },
      ];

  const trust = [
    {
      icon: FileCheck,
      t: "Documents, not guesswork",
      d: "Tenants share CNIC and income proof in-app. Landlords approve only what they've actually seen.",
    },
    {
      icon: Receipt,
      t: "Lease & payments in one place",
      d: "Sign the lease, track rent and log maintenance from the same dashboard you applied in.",
    },
    {
      icon: MessageSquare,
      t: "Real listings, real people",
      d: "Every property is posted by the actual landlord and you message them directly — no middlemen.",
    },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background -z-10" />
        <div className="container mx-auto px-4 py-16 md:py-24 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full mb-5">
            Built for renters and landlords in Pakistan
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

      {/* Trust band */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-4">
          {trust.map((t) => (
            <div key={t.t} className="rounded-xl border bg-card p-6">
              <div className="h-9 w-9 rounded-md bg-muted text-foreground grid place-items-center mb-4">
                <t.icon className="h-4 w-4" />
              </div>
              <h3 className="font-display font-semibold">{t.t}</h3>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{t.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured cities */}
      <section className="container mx-auto px-4 pb-16">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold">Explore by city</h2>
            <p className="text-muted-foreground text-sm mt-1">Listings from the five cities we serve.</p>
          </div>
          <Link to="/browse" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {(cityCounts.length ? cityCounts : PK_CITIES.map((c) => ({ city: c, count: 0 }))).map((c) => (
            <Link key={c.city} to={`/browse?city=${encodeURIComponent(c.city)}`}
              className="group rounded-xl border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition">
              <MapPin className="h-5 w-5 text-primary mb-3" />
              <div className="font-display font-semibold text-lg">{c.city}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {c.count > 0
                  ? `${c.count} active listing${c.count === 1 ? "" : "s"}`
                  : "No listings yet"}
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
              <p className="text-muted-foreground text-sm mt-1">Three steps, whether you're renting or listing.</p>
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
                <div className="absolute -top-3 -left-3 h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-sm">
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
              <p className="text-muted-foreground text-sm mt-1">Fresh listings.</p>
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
        <div className="rounded-2xl border bg-card p-8 md:p-12 text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold">List your property in minutes</h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            Free to list. You stay in control of every application and lease.
          </p>
          <Button asChild size="lg" className="mt-5">
            <Link to="/signup">Start listing <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
