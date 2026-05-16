import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethodPicker } from "@/components/payments/PaymentMethodPicker";
import { toast } from "sonner";

export default function MaintenanceProfile() {
  const { user } = useAuth();
  const [skills, setSkills] = useState("");
  const [cities, setCities] = useState("");
  const [rate, setRate] = useState("");
  const [bio, setBio] = useState("");
  const [existing, setExisting] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("technicians").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExisting(data);
          setSkills((data.skills ?? []).join(", "));
          setCities((data.service_cities ?? []).join(", "));
          setRate(data.hourly_rate?.toString() ?? "");
          setBio(data.bio ?? "");
        }
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      service_cities: cities.split(",").map((s) => s.trim()).filter(Boolean),
      hourly_rate: Number(rate) || 0,
      bio: bio.trim(),
      is_active: true,
    };
    const q = existing
      ? supabase.from("technicians").update(payload).eq("user_id", user.id)
      : supabase.from("technicians").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message);
    else { toast.success("Profile saved"); setExisting(payload); }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader title="Technician profile" description="Required to receive job offers." />
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div>
          <Label>Skills (comma-separated)</Label>
          <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="plumbing, electrical, appliance" />
          <p className="text-xs text-muted-foreground mt-1">Match ticket categories to be eligible: plumbing, electrical, appliance, structural, other.</p>
        </div>
        <div>
          <Label>Service cities</Label>
          <Input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Lahore, Karachi" />
        </div>
        <div>
          <Label>Hourly rate (PKR)</Label>
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <Label>Short bio</Label>
          <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <Button onClick={save}>Save profile</Button>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-3">Payout methods</h3>
        <p className="text-sm text-muted-foreground mb-3">
          These details are shown to payers (landlord or tenant) when they pay you. At least one method is required to receive payments.
        </p>
        <PaymentMethodPicker />
      </section>
    </div>
  );
}
