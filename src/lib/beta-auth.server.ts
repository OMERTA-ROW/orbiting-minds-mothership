import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertBetaAiAccess } from "./beta";
export class BetaHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function authenticateBetaAi(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new BetaHttpError(403, "Only same-origin requests are accepted.");
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new BetaHttpError(401, "Sign in before sending a model request.");
  const url = process.env["SUPABASE_URL"],
    key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key)
    throw new BetaHttpError(503, "Account validation is unavailable. No AI request started.");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new BetaHttpError(401, "Your session is invalid or expired. Sign in again.");
  if (!data.user.email_confirmed_at)
    throw new BetaHttpError(403, "Confirm your account email before sending a model request.");
  const access = await client
    .from("beta_access")
    .select("ai_approved, paused")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (access.error)
    throw new BetaHttpError(503, "Beta permission could not be checked. No request started.");
  try {
    assertBetaAiAccess(access.data);
  } catch (e) {
    throw new BetaHttpError(403, e instanceof Error ? e.message : "Beta access blocked");
  }
  return { client, userId: data.user.id };
}
export async function readBoundedJson(request: Request, limit = 12000): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new BetaHttpError(400, "Send JSON only.");
  const reader = request.body?.getReader();
  if (!reader) throw new BetaHttpError(400, "No input was supplied.");
  let size = 0,
    raw = "";
  const decoder = new TextDecoder();
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BetaHttpError(413, "Input exceeds the beta request size limit.");
    }
    raw += decoder.decode(part.value, { stream: true });
  }
  try {
    return JSON.parse(raw + decoder.decode());
  } catch {
    throw new BetaHttpError(400, "Invalid JSON input.");
  }
}
