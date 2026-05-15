import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/validators";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfigBanner } from "@/components/feedback/Feedback";
import { Home } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

type FV = z.infer<typeof loginSchema>;

export default function Login() {
  const nav = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FV>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (v: FV) => {
    const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); nav("/app"); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex items-center justify-center bg-gradient-to-br from-primary/10 to-background p-10">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl mb-6">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground"><Home className="h-4 w-4" /></span>
            HomeRentals
          </Link>
          <h2 className="font-display text-3xl font-bold">Welcome back</h2>
          <p className="text-muted-foreground mt-2">Manage your properties, leases and applications all in one place.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {!isSupabaseConfigured && <ConfigBanner />}
          <h1 className="font-display text-2xl font-bold mb-6">Log in</h1>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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
            <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Log in"}</Button>
          </form>
          <div className="mt-4 text-sm text-center text-muted-foreground">
            <Link to="/signup" className="text-primary hover:underline">Create an account</Link>
            <span className="mx-2">·</span>
            <Link to="/reset-password" className="hover:underline">Forgot password?</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
