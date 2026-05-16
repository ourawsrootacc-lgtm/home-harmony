import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader, EmptyState } from "@/components/feedback/Feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { DocumentUploader } from "@/components/documents/DocumentUploader";
import { DocumentList } from "@/components/documents/DocumentList";
import {
  uploadAppDoc, listAppDocs, deleteAppDoc,
  APP_DOC_LABEL, INCOME_PROOF_KINDS,
  type AppDoc, type AppDocKind,
} from "@/lib/documents";

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-sky-100 text-sky-800",
  offer_sent: "bg-indigo-100 text-indigo-800",
  approved: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  superseded: "bg-muted text-muted-foreground",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

const UPLOADABLE_STATUSES = ["pending", "under_review"];
const TENANT_KINDS: AppDocKind[] = [
  "cnic", "payslip", "bank_statement", "employment_letter", "police_clearance",
];

export default function TenantApplications() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("applications")
      .select("*, properties(id,title,city,monthly_rent)")
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  };
  useEffect(load, [user]);

  const cancel = async (id: string) => {
    if (!confirm("Cancel this application? Your uploaded documents will be deleted.")) return;
    await supabase.from("applications").update({ status: "cancelled" }).eq("id", id);
    toast.success("Application cancelled");
    load();
  };

  return (
    <div>
      <PageHeader
        title="My applications"
        description="Track status and share the documents your landlord needs to review you."
      />
      {loading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Apply on any property page to see it here."
          action={<Button asChild><Link to="/browse">Browse properties</Link></Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ApplicationRow key={r.id} row={r} onCancel={() => cancel(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({ row, onCancel }: { row: any; onCancel: () => void }) {
  const [open, setOpen] = useState(UPLOADABLE_STATUSES.includes(row.status));
  const [docs, setDocs] = useState<AppDoc[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);

  const refresh = async () => {
    const next = await listAppDocs(row.id);
    setDocs(next);
    setDocsLoaded(true);
  };
  useEffect(() => { if (open) refresh(); }, [open, row.id]);

  const has = (k: AppDocKind) => docs.some((d) => d.kind === k);
  const hasIncome = INCOME_PROOF_KINDS.some(has);
  const complete = has("cnic") && hasIncome;
  const canUpload = UPLOADABLE_STATUSES.includes(row.status);

  return (
    <div className="rounded-xl border bg-card">
      <div className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <Link to={`/properties/${row.properties?.id}`} className="font-semibold hover:underline">
            {row.properties?.title ?? "Property"}
          </Link>
          <div className="text-sm text-muted-foreground">
            {row.properties?.city} · applied {relativeTime(row.created_at)}
          </div>
        </div>
        {canUpload && docsLoaded && (
          complete ? (
            <Badge className="bg-emerald-100 text-emerald-800 gap-1">
              <CheckCircle2 className="h-3 w-3" />Docs complete
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 gap-1">
              <AlertCircle className="h-3 w-3" />Docs incomplete
            </Badge>
          )
        )}
        <Badge className={`${STATUS_VARIANT[row.status] ?? "bg-muted"} capitalize`}>
          {row.status.replace("_", " ")}
        </Badge>
        {row.status === "pending" && (
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        )}
        {row.status === "offer_sent" && (
          <Button asChild size="sm"><Link to="/app/tenant/lease">Review offer</Link></Button>
        )}
        <Button size="icon" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {open && (
        <div className="border-t p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Your documents</h3>
              <p className="text-xs text-muted-foreground">
                Required: CNIC + income proof (payslip or bank statement).
              </p>
            </div>

            {canUpload && (
              <div className="flex flex-wrap gap-2 mb-3">
                {TENANT_KINDS.map((k) => (
                  <DocumentUploader
                    key={k}
                    label={`${has(k) ? "Replace" : "Upload"} ${APP_DOC_LABEL[k]}`}
                    onPick={async (file) => {
                      // Replace = delete old then upload (keeps unique storage_path predictable)
                      const existing = docs.find((d) => d.kind === k);
                      if (existing) await deleteAppDoc(existing.id);
                      await uploadAppDoc(row.id, file, k);
                      await refresh();
                    }}
                  />
                ))}
              </div>
            )}

            <DocumentList
              rows={docs}
              table="application_documents"
              canDelete={canUpload}
              onDelete={async (id) => { await deleteAppDoc(id); await refresh(); }}
              showViews
            />

            {!canUpload && (
              <p className="text-xs text-muted-foreground mt-2">
                Documents can only be edited while the application is pending or under review.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
