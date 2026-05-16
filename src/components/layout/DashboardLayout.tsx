import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home, LayoutDashboard, Building2, Heart, FileText, Wrench, Users,
  ShieldCheck, MessageSquare, Bell, Settings, LogOut, UserCircle, CreditCard, UserCog,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";

type Item = { to: string; label: string; icon: any };

const NAV: Record<string, Item[]> = {
  tenant: [
    { to: "/app/tenant", label: "Overview", icon: LayoutDashboard },
    { to: "/app/tenant/favorites", label: "Favorites", icon: Heart },
    { to: "/app/tenant/applications", label: "Applications", icon: FileText },
    { to: "/app/tenant/lease", label: "My Lease", icon: Building2 },
    { to: "/app/tenant/maintenance", label: "Maintenance", icon: Wrench },
  ],
  landlord: [
    { to: "/app/landlord", label: "Overview", icon: LayoutDashboard },
    { to: "/app/landlord/listings", label: "Listings", icon: Building2 },
    { to: "/app/landlord/applications", label: "Applications", icon: FileText },
    { to: "/app/landlord/leases", label: "Leases", icon: FileText },
    { to: "/app/landlord/tenants", label: "Tenants", icon: Users },
  ],
  maintenance: [
    { to: "/app/maintenance", label: "Tickets", icon: Wrench },
  ],
  admin: [
    { to: "/app/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/app/admin/users", label: "Users", icon: Users },
    { to: "/app/admin/listings", label: "Verify Listings", icon: ShieldCheck },
    { to: "/app/admin/complaints", label: "Complaints", icon: FileText },
  ],
};

const SHARED: Item[] = [
  { to: "/app/messages", label: "Messages", icon: MessageSquare },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout() {
  const { profile, role, signOut } = useAuth();
  const nav = useNavigate();
  const items = role ? NAV[role] ?? [] : [];

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <Link to="/" className="h-16 px-5 flex items-center gap-2 font-display font-bold text-lg border-b">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
            <Home className="h-4 w-4" />
          </span>
          HomeRentals
        </Link>
        <nav className="flex-1 p-3 space-y-1 text-sm">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md transition ${
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/60"
              }`
            }>
              <i.icon className="h-4 w-4" />{i.label}
            </NavLink>
          ))}
          <div className="pt-3 mt-3 border-t space-y-1">
            {SHARED.map((i) => (
              <NavLink key={i.to} to={i.to} className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md transition ${
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/60"
                }`
              }>
                <i.icon className="h-4 w-4" />{i.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="p-3 border-t text-sm">
          <div className="flex items-center gap-2 mb-2">
            <UserCircle className="h-8 w-8 text-muted-foreground" />
            <div className="min-w-0">
              <div className="font-medium truncate">{profile?.full_name ?? "Account"}</div>
              <div className="text-xs text-muted-foreground">{role && ROLE_LABELS[role]}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={async () => { await signOut(); nav("/"); }}>
            <LogOut className="h-4 w-4 mr-1" />Sign out
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="md:hidden h-14 border-b flex items-center justify-between px-4">
          <Link to="/" className="font-display font-bold">HomeRentals</Link>
          <Button size="sm" variant="outline" onClick={async () => { await signOut(); nav("/"); }}>Sign out</Button>
        </header>
        <div className="flex-1 p-4 md:p-8 bg-muted/30">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
