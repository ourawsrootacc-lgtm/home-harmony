import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PK_CITIES, ROLE_LABELS } from "@/lib/constants";
import { toast } from "sonner";

export default function Settings() {
  const { user, profile, role, refresh } = useAuth();
  const [form, setForm] = useState({ full_name: "", phone: "", cnic: "", city: "" });

  useEffect(() => {
    if (profile) setForm({
      full_name: profile.full_name ?? "", phone: profile.phone ?? "",
      cnic: profile.cnic ?? "", city: profile.city ?? "",
    });
  }, [profile]);

  const save = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); refresh(); }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" description="Update your profile information." />
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="text-sm text-muted-foreground">Account ID: <code className="text-xs">{user?.id}</code></div>
        <div className="text-sm text-muted-foreground">Role: <span className="font-medium text-foreground">{role && ROLE_LABELS[role]}</span></div>
        <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>CNIC</Label><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></div>
        <div>
          <Label>City</Label>
          <Select value={form.city || "none"} onValueChange={(v) => setForm({ ...form, city: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {PK_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}
