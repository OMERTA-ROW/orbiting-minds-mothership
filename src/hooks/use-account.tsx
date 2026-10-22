import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { readRecoveryHint, rememberRecoveryHint } from "@/lib/account-recovery";

const AccountContext = createContext<{ user: User | null; ready: boolean; recoveryUserId: string | null; finishRecovery: () => void }>({ user: null, ready: false, recoveryUserId: null, finishRecovery: () => {} });
export function AccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false);
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);
  const finishRecovery = () => { rememberRecoveryHint(sessionStorage, null); setRecoveryUserId(null); };
  useEffect(() => {
    let active = true, revision = 0, identity: string | null = null, recoveryEventUser: string | null = null;
    const check = async () => {
      const current = ++revision;
      let candidate: User | null = null;
      try { const { data, error } = await supabase.auth.getUser(); if (!error) candidate = data.user; }
      catch { /* An unavailable identity check must not expose cached private records. */ }
      if (!active || revision !== current) return false;
      if (identity !== (candidate?.id ?? null)) {
        await queryClient.cancelQueries();
        if (!active || revision !== current) return false;
        queryClient.clear();
      }
      if (!active || revision !== current) return false;
      identity = candidate?.id ?? null;
      setUser(candidate);
      setRecoveryUserId(identity && recoveryEventUser === identity ? identity : readRecoveryHint(sessionStorage, identity));
      setReady(true);
      return true;
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryEventUser = session?.user.id ?? null;
        rememberRecoveryHint(sessionStorage, recoveryEventUser);
      }
      // Same-user renewal needs no router/cache invalidation; recover a previously
      // unavailable identity only when renewal changes the known identity.
      if (event === "TOKEN_REFRESHED" && identity === (session?.user.id ?? null)) return;
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "PASSWORD_RECOVERY", "TOKEN_REFRESHED"].includes(event)) return;
      const transition = ++revision;
      // Defer auth calls outside the auth-client subscriber lock.
      queueMicrotask(() => { void (async () => {
        if (!active || revision !== transition) return;
        if (event === "SIGNED_OUT" || identity !== (session?.user.id ?? null)) {
          setUser(null); setReady(false); setRecoveryUserId(null);
          await queryClient.cancelQueries();
          if (!active || revision !== transition) return;
          queryClient.clear(); identity = null;
        }
        if (event === "SIGNED_OUT") {
          recoveryEventUser = null; rememberRecoveryHint(sessionStorage, null);
          setReady(true); await router.navigate({ to: "/auth", replace: true });
        } else if (await check()) {
          const checked = revision;
          await router.invalidate();
          if (active && revision === checked && identity) await queryClient.invalidateQueries();
        }
      })().catch(() => { /* Identity remains guarded; no tokens/errors are logged. */ }); });
    });
    void check();
    return () => { active = false; subscription.unsubscribe(); };
  }, [router, queryClient]);
  return <AccountContext.Provider value={{ user, ready, recoveryUserId, finishRecovery }}><div key={user?.id ?? "signed-out"}>{children}</div></AccountContext.Provider>;
}
export const useAccount = () => useContext(AccountContext);