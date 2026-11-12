import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ACCOUNT_LINKS = [
  { to: "/beta", label: "My projects" },
  { to: "/account-security", label: "Security (two-step sign-in)" },
  { to: "/sign-in-help", label: "How to sign in" },
  { to: "/members", label: "Members & invitations (owner)" },
  { to: "/omni-api-keys", label: "API keys (owner)" },
  { to: "/activation-approvals", label: "Approvals (owner)" },
] as const;

export function AccountButton() {
  const { user, ready } = useAccount(),
    query = useQueryClient(),
    navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await query.cancelQueries();
      query.clear();
      const result = await supabase.auth.signOut();
      if (result.error) {
        setError("Sign-out failed. Retry before leaving this device.");
        return;
      }
      await navigate({ to: "/auth", replace: true });
    } catch {
      setError("Sign-out failed. Retry before leaving this device.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user)
    return (
      <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
        <Link to="/auth">
          <UserRound size={16} aria-hidden />
          Sign in
        </Link>
      </Button>
    );

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled={busy}>
            <UserRound size={16} aria-hidden />
            <span className="hidden sm:inline">Account</span>
            <span className="sr-only sm:hidden">Account menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 border-gold/25 p-2">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Signed in
          </DropdownMenuLabel>
          {ACCOUNT_LINKS.map((l) => (
            <DropdownMenuItem key={l.to} asChild>
              <Link to={l.to} className="py-2.5">
                {l.label}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              void signOut();
            }}
            className="gap-2 py-2.5"
          >
            <LogOut size={14} aria-hidden />
            {busy ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <span role="alert" className="max-w-36 text-xs text-warning">
          {error}
        </span>
      )}
    </div>
  );
}
