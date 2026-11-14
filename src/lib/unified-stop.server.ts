import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readExecutionState } from "./unified-activation.server";
import { staged } from "./staged-rpc";

/** Retries only a durable safety reduction, never a job or an activation. */
export async function reconcileTerminalStop() {
  const pending = await staged(supabaseAdmin).rpc("omni_stop_pending");
  if (pending.error) throw new Error("Local Stop propagation could not be read");
  if (pending.data === null) return;
  const state = await readExecutionState("disarm");
  if (state.armed || state.running || state.cancellationPending)
    throw new Error("Remote cancellation remains unverified");
  const delivered = await staged(supabaseAdmin).rpc("omni_stop_delivered", {
    _revision: pending.data,
  });
  if (delivered.error) throw new Error("Verified Stop delivery could not be recorded");
}
