import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { AttachmentKind, uploadAttachment } from "@/lib/maintenanceAttachments";
import { toast } from "sonner";

interface Props {
  ticketId: string;
  kind: AttachmentKind;
  accept?: string;
  label?: string;
  onUploaded?: () => void;
  disabled?: boolean;
}

export function AttachmentUploader({
  ticketId, kind, accept = "image/*,application/pdf", label = "Upload", onUploaded, disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name} > 10MB`);
        await uploadAttachment(ticketId, f, kind);
      }
      toast.success(files.length > 1 ? `${files.length} files uploaded` : "Uploaded");
      onUploaded?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} multiple
        className="hidden" onChange={onPick} disabled={disabled || busy} />
      <Button type="button" size="sm" variant="outline" disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5 mr-1" />{busy ? "Uploading…" : label}
      </Button>
    </>
  );
}
