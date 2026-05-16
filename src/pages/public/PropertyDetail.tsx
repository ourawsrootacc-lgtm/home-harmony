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
import { BedDouble, Bath, Maximize, MapPin, ShieldCheck, Upload, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  uploadAppDoc, APP_DOC_LABEL, INCOME_PROOF_KINDS, type AppDocKind,
} from "@/lib/documents";

type DraftFile = { kind: AppDocKind; file: File };

const TENANT_KINDS: AppDocKind[] = [
  "cnic", "payslip", "bank_statement", "employment_letter", "police_clearance",
];
const OPTIONAL_KINDS: AppDocKind[] = ["employment_letter", "police_clearance"];

export default function PropertyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, role } = useAuth();
  const [p, setP] = useState<any>(null);
  const [images, setImages] = useState<{ url: string }[]>([]);
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
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

  const setDraft = (kind: AppDocKind, file: File | null) => {
    setDrafts((prev) => {
      const filtered = prev.filter((d) => d.kind !== kind);
      return file ? [...filtered, { kind, file }] : filtered;
    });
  };

  const has = (k: AppDocKind) => drafts.some((d) => d.kind === k);
  const hasCnic = has("cnic");
  const hasIncome = INCOME_PROOF_KINDS.some(has);
  const canSubmit = hasCnic && hasIncome && !submitting;

  const apply = async () => {
    if (!user) { nav("/login"); return; }
    if (role !== "tenant") { toast.error("Only tenants can apply"); return; }
    if (!hasCnic || !hasIncome) {
      toast.error("Attach your CNIC and one income proof (payslip or bank statement) to apply.");
      return;
    }
    setSubmitting(true);
    const { data: app, error } = await supabase.from("applications").insert({
      property_id: id, tenant_id: user.id, message, status: "pending",
    }).select().single();
    if (error || !app) {
      setSubmitting(false);
      toast.error(error?.message ?? "Could not submit application");
      return;
    }
    // Upload each attached document. If any fails, the application still exists
    // but the tenant can re-upload from their Applications page.
    const failures: string[] = [];
    for (const d of drafts) {
      try { await uploadAppDoc(app.id, d.file, d.kind); }
      catch (e: any) { failures.push(`${APP_DOC_LABEL[d.kind]}: ${e?.message ?? "failed"}`); }
    }
    setSubmitting(false);
    if (failures.length) {
      toast.error(`Application submitted, but some uploads failed: ${failures.join("; ")}. Open it in My Applications to retry.`);
    } else {
      toast.success("Application submitted with your documents.");
    }
    setMessage("");
    setDrafts([]);
    nav("/app/tenant/applications");
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
          ) : !user ? (
            <Button className="w-full mt-3" onClick={() => nav("/login")}>Log in to apply</Button>
          ) : role !== "tenant" ? (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Only tenant accounts can apply to listings.
            </div>
          ) : (
            <>
              <Textarea placeholder="Message to landlord (optional)…" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />

              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Required documents</div>
                <p className="text-xs text-muted-foreground">
                  Landlord can only review your application after you share CNIC and one income proof.
                  Files stay private and are auto-deleted if your application is rejected.
                </p>
                {TENANT_KINDS.map((k) => (
                  <DocSlot key={k} kind={k}
                    required={k === "cnic" || (INCOME_PROOF_KINDS.includes(k) && !hasIncome && !has(k))}
                    optional={OPTIONAL_KINDS.includes(k)}
                    file={drafts.find((d) => d.kind === k)?.file ?? null}
                    onPick={(f) => setDraft(k, f)} />
                ))}
              </div>

              {!canSubmit && (
                <p className="text-xs text-amber-700 mt-3">
                  {!hasCnic && "Attach your CNIC. "}{!hasIncome && "Attach a payslip or bank statement."}
                </p>
              )}
              <Button className="w-full mt-3" onClick={apply} disabled={!canSubmit}>
                {submitting ? "Submitting…" : "Submit application"}
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function DocSlot({ kind, required, optional, file, onPick }: {
  kind: AppDocKind; required: boolean; optional: boolean;
  file: File | null; onPick: (f: File | null) => void;
}) {
  const id = `doc-${kind}`;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium flex items-center gap-1.5">
          {file && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          {APP_DOC_LABEL[kind]}
          {required && !file && <span className="text-destructive text-xs">*</span>}
          {optional && <span className="text-xs text-muted-foreground">(optional)</span>}
        </div>
        {file && <div className="text-xs text-muted-foreground truncate">{file.name}</div>}
      </div>
      {file ? (
        <Button type="button" size="icon" variant="ghost" onClick={() => onPick(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <>
          <input id={id} type="file" className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          <Button asChild type="button" size="sm" variant="outline">
            <label htmlFor={id} className="cursor-pointer">
              <Upload className="h-3.5 w-3.5 mr-1" />Attach
            </label>
          </Button>
        </>
      )}
    </div>
  );
}

