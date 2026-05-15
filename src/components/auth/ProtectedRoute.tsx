import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import type { AppRole } from "@/lib/supabase";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!configured)
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export function RoleRoute({
  role: required,
  children,
}: {
  role: AppRole | AppRole[];
  children: ReactNode;
}) {
  const { role, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  const allowed = Array.isArray(required) ? required : [required];
  if (!role || !allowed.includes(role))
    return (
      <div className="max-w-md mx-auto mt-24 text-center space-y-3 p-6">
        <h1 className="text-2xl font-display font-bold">Access denied</h1>
        <p className="text-muted-foreground">
          Your account does not have permission to view this page.
        </p>
      </div>
    );
  return <>{children}</>;
}
