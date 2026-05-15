import { Link } from "react-router-dom";
import { Search, ShieldCheck, Building2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PK_CITIES } from "@/lib/constants";

export default function Landing() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background -z-10" />
        <div className="container mx-auto px-4 py-16 md:py-28 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full mb-5">
            Pakistan's modern rental platform
          </span>
          <h1 className="font-display text-4xl md:text-6xl font-bold max-w-3xl mx-auto leading-tight">
            Find your next home, <span className="text-primary">simply</span>.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-xl mx-auto md:text-lg">
            Browse verified rentals across Karachi, Lahore, Islamabad and beyond — all in one place.
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
            {PK_CITIES.slice(0, 7).map((c) => (
              <Link key={c} to={`/browse?city=${encodeURIComponent(c)}`} className="px-3 py-1.5 rounded-full border bg-card text-sm hover:border-primary hover:text-primary transition">
                {c}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 grid md:grid-cols-3 gap-6">
        {[
          { icon: ShieldCheck, title: "Verified listings", body: "Every property is reviewed before it goes live." },
          { icon: Building2, title: "End-to-end management", body: "Tenants, leases, payments and maintenance in one dashboard." },
          { icon: Wrench, title: "Built-in maintenance", body: "Submit and track repair tickets with photo updates." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-6">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center mb-3">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
