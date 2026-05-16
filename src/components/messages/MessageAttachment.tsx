import { useEffect, useState } from "react";
import { getMessageAttachmentUrl, formatFileSize } from "@/lib/messageAttachments";
import { FileText, Download, ImageOff } from "lucide-react";

export function ImageBubble({ path, name }: { path: string; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    getMessageAttachmentUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [path]);

  if (err) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80">
        <ImageOff className="h-4 w-4" /> Image unavailable
      </div>
    );
  }
  if (!url) return <div className="h-40 w-56 bg-black/10 rounded-lg animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={name ?? "Image"}
        loading="lazy"
        className="rounded-lg max-h-64 max-w-[260px] object-cover"
      />
    </a>
  );
}

export function FileBubble({
  path, name, size, mine,
}: { path: string; name: string | null; size: number | null; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getMessageAttachmentUrl(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [path]);

  return (
    <div className={`flex items-center gap-3 rounded-lg p-2 ${mine ? "bg-white/10" : "bg-muted"}`}>
      <div className={`h-9 w-9 rounded-md grid place-items-center ${mine ? "bg-white/20" : "bg-background"}`}>
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{name ?? "File"}</div>
        <div className="text-[10px] opacity-70">{size != null ? formatFileSize(size) : ""}</div>
      </div>
      {url && (
        <a
          href={url}
          download={name ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={`shrink-0 rounded-md p-1.5 ${mine ? "hover:bg-white/20" : "hover:bg-background"}`}
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
