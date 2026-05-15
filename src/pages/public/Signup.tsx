import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema } from "@/lib/validators";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfigBanner } from "@/components/feedback/Feedback";
import { toast } from "sonner";
import { z } from "zod";
import { useState } from "react";

type FV = z.infer<typeof signupSchema>;

export default function Signup() {
  const nav = useNavigate();
  const [role, setRole] = useState<FV["role"]>("tenant");
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<FV>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: "tenant" },
  });

  const onSubmit = async (v: FV) => {
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: v.full_name, phone: v.phone, cnic: v.cnic, role: v.role },
      },
    });
    if (error) { toast.error(error.message); return; }
    if (data.user) {
      // best-effort: trigger creates profile + default role; update profile + role here
      await supabase.from("profiles").update({ full_name: v.full_name, phone: v.phone, cnic: v.cnic || null }).eq("id", data.user.id);
      await supabase.from("user_roles").upsert({ user_id: data.user.id, role: v.role }, { onConflict: "user_id,role" });
    }
    toast.success("Account created");
    nav("/app");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {!isSupabaseConfigured && <ConfigBanner />}
        <h1 className="font-display text-2xl font-bold mb-1">Create your account</h1>
        <p className="text-sm text-muted-foreground mb-6">Join HomeRentals as a tenant, landlord or maintenance staff.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input {...register("full_name")} />
            {errors.full_name && <p className="text-xs text-destructive mt-1">{errors.full_name.message}</p>}
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <Label>Phone (+92XXXXXXXXXX)</Label>
            <Input placeholder="+923001234567" {...register("phone")} />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <Label>CNIC (optional)</Label>
            <Input placeholder="12345-1234567-1" {...register("cnic")} />
            {errors.cnic && <p className="text-xs text-destructive mt-1">{errors.cnic.message}</p>}
          </div>
          <div>
            <Label>I am a…</Label>
            <Select value={role} onValueChange={(v) => { setRole(v as FV["role"]); setValue("role", v as FV["role"]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Tenant — looking for a home</SelectItem>
                <SelectItem value="landlord">Landlord — listing properties</SelectItem>
                <SelectItem value="maintenance">Maintenance staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create account"}</Button>
        </form>
        <div className="mt-4 text-sm text-center text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Log in</Link>
        </div>
      </div>
    </div>
  );
}
