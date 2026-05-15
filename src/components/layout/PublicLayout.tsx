import { Link, NavLink, Outlet } from "react-router-dom";
import { Home, Search, LogIn } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";

export default function PublicLayout() {
  const { user, role } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto h-16 px-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
              <Home className="h-4 w-4" />
            </span>
            HomeRentals
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <NavLink to="/" end className={({ isActive }) => isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}>Home</NavLink>
            <NavLink to="/browse" className={({ isActive }) => isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}>
              <span className="inline-flex items-center gap-1.5"><Search className="h-4 w-4" />Browse</span>
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link to={role ? `/app/${role === "admin" ? "admin" : role}` : "/app"}>Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login"><LogIn className="h-4 w-4 mr-1" />Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} HomeRentals · Pakistan
      </footer>
    </div>
  );
}
