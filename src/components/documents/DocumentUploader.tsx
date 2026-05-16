import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  label: string;
  onPick: (file: File) => Promise<void>;
  disabled?: boolean;
  accept?: string;
  size?: "sm" | "default";
}

/**
 * Single-file uploader. The caller decides where to store the file
 * (application_documents vs property_documents) via the `onPick` callback.
 */
export function DocumentUploader({
  label, onPick, disabled, accept = "application/pdf,image/jpeg,image/png,image/webp", size = "sm",
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await onPick(f);
      toast.success("Uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={handle} disabled={disabled || busy} />
      <Button type="button" size={size} variant="outline"
        disabled={disabled || busy} onClick={() => ref.current?.click()}>
        <Upload className="h-3.5 w-3.5 mr-1" />{busy ? "Uploading…" : label}
      </Button>
    </>
  );
}
