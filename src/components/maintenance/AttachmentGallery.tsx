import { useEffect, useState } from "react";
import { Attachment, AttachmentKind, getAttachmentSignedUrl, listAttachments } from "@/lib/maintenanceAttachments";
import { FileText, ImageIcon } from "lucide-react";

interface Props {
  ticketId: string;
  kinds?: AttachmentKind[];
  emptyText?: string;
  reloadKey?: number;
}

export function AttachmentGallery({ ticketId, kinds, emptyText = "No attachments yet.", reloadKey }: Props) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    listAttachments(ticketId).then(async (rows) => {
      const filtered = kinds ? rows.filter((r) => kinds.includes(r.kind)) : rows;
      setItems(filtered);
      const next: Record<string, string> = {};
      for (const a of filtered) {
        try { next[a.id] = await getAttachmentSignedUrl(a.storage_path); } catch { /* ignore */ }
      }
      setUrls(next);
    });
  }, [ticketId, reloadKey, kinds?.join(",")]);

  if (!items.length) return <p className="text-xs text-muted-foreground">{emptyText}</p>;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {items.map((a) => {
        const url = urls[a.id];
        const isImg = (a.mime ?? "").startsWith("image/");
        return (
          <a key={a.id} href={url} target="_blank" rel="noreferrer"
            className="block rounded border overflow-hidden bg-muted/30 aspect-square">
            {isImg && url ? (
              <img src={url} alt={a.kind} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
                {isImg ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                <span className="mt-1 capitalize">{a.kind}</span>
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}
