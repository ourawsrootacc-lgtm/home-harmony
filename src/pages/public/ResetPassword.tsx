import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ResetPassword() {
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setMode("update");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const sendLink = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Check your inbox for the reset link");
  };

  const updatePw = async () => {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Password updated. You can now log in.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-2xl font-bold">{mode === "request" ? "Reset your password" : "Set a new password"}</h1>
        {mode === "request" ? (
          <>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button className="w-full" onClick={sendLink} disabled={busy || !email}>Send reset link</Button>
          </>
        ) : (
          <>
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Button className="w-full" onClick={updatePw} disabled={busy || pw.length < 8}>Update password</Button>
          </>
        )}
        <div className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
