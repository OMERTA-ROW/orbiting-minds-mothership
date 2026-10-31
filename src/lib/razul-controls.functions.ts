import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyRazulControl, razulControlInput } from "./razul-controls";

export const saveRazulControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => razulControlInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    return applyRazulControl(
      {
        authorize: () => requireRazulOwner(context.supabase, context.userId, context.claims),
        rpc: async (name, args) => {
          if (name === "razul_pause")
            return context.supabase.rpc("razul_pause", args as { _reason: string });
          if (name === "razul_configure")
            return context.supabase.rpc(
              "razul_configure",
              args as {
                _threshold: number;
                _retention_days: number;
                _coverage: string[];
                _blocked_sources: string[];
              },
            );
          if (name === "razul_set_subscription")
            return context.supabase.rpc(
              "razul_set_subscription",
              args as { _agent: string; _categories: string[]; _floor: number; _enabled: boolean },
            );
          throw new Error("Unsupported owner control.");
        },
      },
      data,
    );
  });
