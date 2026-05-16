import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Trash2, FileText, ImageIcon, Lock } from "lucide-react";
import {
  getDocSignedUrl, logView, listAccessLog,
  type AppDoc, type PropertyDoc, APP_DOC_LABEL, PROPERTY_DOC_LABEL,
} from "@/lib/documents";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";

type Row = AppDoc | PropertyDoc;
type Table = "application_documents" | "property_documents";

interface Props {
  rows: Row[];
  table: Table;
  canDelete?: boolean;
  onDelete?: (id: string) => Promise<void>;
  showViews?: boolean; // owner-side: show "X viewed Y ago" badges
  locked?: boolean;    // e.g. landlord on a pending application
  lockedHint?: string;
}

const labelFor = (table: Table, kind: string) =>
  table === "application_documents"
    ? APP_DOC_LABEL[kind as keyof typeof APP_DOC_LABEL] ?? kind
    : PROPERTY_DOC_LABEL[kind as keyof typeof PROPERTY_DOC_LABEL] ?? kind;

export function DocumentList({
  rows, table, canDelete, onDelete, showViews, locked, lockedHint,
}: Props) {
  const [views, setViews] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!showViews || !rows.length) return;
    listAccessLog(table, rows.map((r) => r.id)).then((logs) => {
      const map: Record<string, number> = {};
      for (const l of logs) map[l.document_id] = (map[l.document_id] ?? 0) + 1;
      setViews(map);
    });
  }, [showViews, table, rows.map((r) => r.id).join(",")]);

  if (locked) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground flex items-start gap-2">
        <Lock className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{lockedHint ?? "Locked. Move the application to 'Under review' to view these documents."}</span>
      </div>
    );
  }

  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>;
  }

  const open = async (r: Row) => {
    try {
      const url = await getDocSignedUrl(r.storage_path);
      await logView(table, r.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Cannot open document");
    }
  };

  return (
    <ul className="divide-y rounded-md border bg-card">
      {rows.map((r) => {
        const isImg = (r.mime ?? "").startsWith("image/");
        return (
          <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
            {isImg ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                   : <FileText className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium">{labelFor(table, r.kind)}</div>
              <div className="text-xs text-muted-foreground">
                uploaded {relativeTime(r.created_at)}
                {showViews && views[r.id] ? (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Viewed {views[r.id]}×
                  </Badge>
                ) : null}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => open(r)}>
              <Eye className="h-4 w-4" />
            </Button>
            {canDelete && onDelete && (
              <Button size="sm" variant="ghost"
                onClick={async () => {
                  if (!confirm("Delete this document?")) return;
                  try { await onDelete(r.id); toast.success("Deleted"); }
                  catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
                }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
