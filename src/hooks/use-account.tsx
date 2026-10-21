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
    let active = true, revision = 0;
    const check = async () => {
      const current = ++revision;
      const { data } = await supabase.auth.getUser();
      if (active && revision === current) { setUser(data.user); setReady(true); }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      if (event === "SIGNED_OUT") { revision++; setUser(null); setReady(true); }
      else void check();
      void router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    void check();
    return () => { active = false; subscription.unsubscribe(); };
  }, [router, queryClient]);
  return <AccountContext.Provider value={{ user, ready }}>{children}</AccountContext.Provider>;
}
export const useAccount = () => useContext(AccountContext);