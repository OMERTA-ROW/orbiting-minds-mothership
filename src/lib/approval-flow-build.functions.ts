/**
 * Signed-in check of which approval flow the live site serves. Fetches only the fixed public
 * marker on the live origin, refuses redirects, bounds time and size, and returns a version number.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  APPROVAL_FLOW_VERSION,
  LIVE_ORIGIN,
  MARKER_MAX_BYTES,
  MARKER_PATH,
  compareLive,
} from "./approval-flow-build";

async function readLiveMarker(): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(`${LIVE_ORIGIN}${MARKER_PATH}`, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, MARKER_MAX_BYTES + 1) };
  } catch {
    return null;
  }
}

export const getApprovalFlowBuild = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    serverVersion: APPROVAL_FLOW_VERSION,
    live: compareLive(await readLiveMarker()),
    checkedAt: new Date().toISOString(),
  }));
