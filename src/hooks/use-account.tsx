import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const AccountContext = createContext<{ user: User | null; ready: boolean }>({ user: null, ready: false });
export function AccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true, revision = 0, identity: string | null = null;
    const check = async () => {
      const current = ++revision;
      const { data } = await supabase.auth.getUser();
      if (active && revision === current) {
        if (identity !== (data.user?.id ?? null)) { await queryClient.cancelQueries(); queryClient.clear(); }
        identity = data.user?.id ?? null; setUser(data.user); setReady(true);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") sessionStorage.setItem("evolution-password-recovery", "true");
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      // Defer auth calls outside the auth-client subscriber lock.
      queueMicrotask(() => { void (async () => {
        if (!active) return;
        if (event === "SIGNED_OUT" || identity !== (session?.user.id ?? null)) {
          revision++; setUser(null); setReady(false);
          await queryClient.cancelQueries(); queryClient.clear(); identity = null;
        }
        if (event === "SIGNED_OUT") { sessionStorage.removeItem("evolution-password-recovery"); setReady(true); await router.navigate({ to: "/auth", replace: true }); }
        else { await check(); await router.invalidate(); await queryClient.invalidateQueries(); }
      })(); });
    });
    void check();
    return () => { active = false; subscription.unsubscribe(); };
  }, [router, queryClient]);
  return <AccountContext.Provider value={{ user, ready }}><div key={user?.id ?? "signed-out"}>{children}</div></AccountContext.Provider>;
}
export const useAccount = () => useContext(AccountContext);