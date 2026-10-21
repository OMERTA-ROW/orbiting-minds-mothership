import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
// Client-only managed-gate shape: private data handlers independently verify the bearer.
export const Route = createFileRoute("/_authenticated")({ ssr: false, beforeLoad: async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect({ to: "/auth" });
}, component: Outlet });