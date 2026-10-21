import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, UserRound } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
export function AccountButton() {
  const { user, ready } = useAccount(), query = useQueryClient(), navigate = useNavigate();
  const [error, setError] = useState("");
  return <div className="flex items-center gap-1">
    <Button asChild variant="ghost" size="icon" aria-label={user ? "My beta projects" : "Sign in"} title={user ? "My beta projects" : "Sign in"}><Link to={user ? "/beta" : "/auth"}><UserRound size={18} /></Link></Button>
    {ready && user && <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={async () => {
      await query.cancelQueries(); query.clear();
      const result = await supabase.auth.signOut();
      if (result.error) { setError("Sign-out failed. Retry before leaving this device."); return; }
      await navigate({ to: "/auth", replace: true });
    }}><LogOut size={16} /></Button>}
    {error && <span role="alert" className="max-w-36 text-xs text-warning">{error}</span>}
  </div>;
}