import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <div className="font-display text-7xl font-bold text-primary">404</div>
        <p className="text-muted-foreground mt-2">This page doesn't exist.</p>
        <Button asChild className="mt-6"><Link to="/">Back home</Link></Button>
      </div>
    </div>
  );
}
