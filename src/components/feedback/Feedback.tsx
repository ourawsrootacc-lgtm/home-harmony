import { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title, description, action, icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted grid place-items-center text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="font-display font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card overflow-hidden animate-pulse">
          <div className="aspect-[4/3] bg-muted" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ConfigBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 p-4 mb-6">
      <div className="font-semibold">Backend not connected</div>
      <p className="text-sm mt-1">
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>,
        then restart the dev server. See <code>README.md</code> for setup steps.
      </p>
    </div>
  );
}
