import { authenticateBetaAi, BetaHttpError, readBoundedJson } from "@/lib/beta-auth.server";
import { assertNonSensitive } from "@/lib/beta";
import {
  assertAgentMembership,
  omniAgentInput,
  type AgentEvent,
  type AgentState,
  type OmniAgentRun,
} from "@/lib/omni-agent";
import { createOmniCall } from "./omni-responses.server.ts";
import { contextFromRuns, type ContextMessage } from "@/lib/omni-chat";
import { getLovableAiGatewayResponseHeaders } from "./run-id.server.ts";
import { requiresPersistentPause } from "./gateway-errors";

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
const jsonError = (status: number, message: string) =>
  Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

export async function handleOmniAgent(request: Request) {
  try {
    const { client, userId } = await authenticateBetaAi(request);
    const membership = await (client.rpc as unknown as Rpc).call(client, "caller_role", {});
    if (membership.error)
      return jsonError(
        503,
        "Private owner/member setup is not activated. No agent request started.",
      );
    assertAgentMembership(membership.data);
    const parsed = omniAgentInput.safeParse(await readBoundedJson(request));
    if (!parsed.success)
      return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request or consent.");
    const input = parsed.data;
    const project = await client
      .from("beta_projects")
      .select("name, brief")
      .eq("id", input.projectId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (project.error || !project.data) return jsonError(404, "Project not found in your account.");
    assertNonSensitive(`${project.data.name}\n${project.data.brief}`);
    // Earlier turns are sent only when the owner chose a number for this request.
    let history: ContextMessage[] = [],
      contextIds: string[] = [];
    if (input.contextTurns > 0) {
      const saved = await (client.rpc as unknown as Rpc).call(client, "list_omni_agent_runs", {
        _project: input.projectId,
      });
      if (saved.error || !Array.isArray(saved.data))
        return jsonError(503, "Earlier saved turns could not be read. No request started.");
      const picked = contextFromRuns(
        saved.data as OmniAgentRun[],
        input.requestId,
        input.contextTurns,
        (text) => {
          try {
            assertNonSensitive(text);
            return true;
          } catch {
            return false;
          }
        },
      );
      history = picked.messages;
      contextIds = picked.ids;
    }
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return jsonError(503, "Lovable AI is not configured. No request started.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = await supabaseAdmin
      .from("ai_gateway_state")
      .select("blocked_status, message")
      .eq("feature", "evolution-omni")
      .maybeSingle();
    if (state.error) return jsonError(503, "AI availability could not be checked.");
    if (state.data) return jsonError(state.data.blocked_status, state.data.message);
    const prepared = await (client.rpc as unknown as Rpc).call(client, "start_omni_agent_run", {
      _id: input.requestId,
      _project: input.projectId,
      _message: input.message,
      _consent: input.consent,
    });
    if (prepared.error || !prepared.data)
      return jsonError(
        503,
        "Saved agent runs are not activated or access changed. No model request started.",
      );
    const run = prepared.data as OmniAgentRun;
    if (run.status !== "queued")
      return Response.json(
        {
          message: "This request already exists. Read its saved status; it will not be replayed.",
          run,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    // Dynamic relation is intentionally absent from generated types until approved SQL activation.
    const runs = () =>
      (supabaseAdmin.from as unknown as (table: string) => ReturnType<typeof supabaseAdmin.from>)(
        "omni_agent_runs",
      );
    const claim = await runs()
      .update({ status: "running" } as never)
      .eq("id", input.requestId)
      .eq("owner_id", userId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data)
      return jsonError(409, "Request was cancelled or claimed already. No model request started.");
    // Durable pre-provider guard remains if any terminal write fails. It also prevents paid duplicate requests across worker restarts.
    const guardMessage = `OMNI request ${input.requestId} is in progress or its outcome needs owner review. No automatic restart.`;
    const guard = await supabaseAdmin
      .from("ai_gateway_state")
      .insert({ feature: "evolution-omni", blocked_status: 503, message: guardMessage });
    if (guard.error) {
      await runs()
        .update({
          status: "failed",
          error_status: 503,
          error_message: "AI request guard unavailable; no inference started.",
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", input.requestId)
        .eq("owner_id", userId)
        .eq("status", "running");
      return jsonError(503, "AI request guard could not be saved. No model request started.");
    }
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    let cancelled = false,
      stopped: AgentState | undefined,
      text = "";
    let call: ReturnType<typeof createOmniCall> | undefined;
    let terminalStatus = 200,
      terminalMessage = "";
    let ready: () => void = () => {};
    const providerReady = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: AgentEvent) => {
          if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        // This is a request-bound control poll, not a background runner or timeout/retry.
        let checking: Promise<void> | null = null;
        const check = async () => {
          const saved = await runs()
            .select("status")
            .eq("id", input.requestId)
            .eq("owner_id", userId)
            .maybeSingle();
          if (saved.error || !saved.data)
            throw new BetaHttpError(503, "Run permissions could not be checked.");
          if ((saved.data as unknown as { status: string }).status !== "running") {
            stopped = "cancelled";
            abort.abort();
            return;
          }
          const auth = await authenticateBetaAi(request);
          const member = await (auth.client.rpc as unknown as Rpc).call(
            auth.client,
            "caller_role",
            {},
          );
          if (member.error) throw new BetaHttpError(503, "Membership could not be checked.");
          assertAgentMembership(member.data);
          const owned = await auth.client
            .from("beta_projects")
            .select("id")
            .eq("id", input.projectId)
            .eq("owner_id", userId)
            .maybeSingle();
          if (owned.error || !owned.data)
            throw new BetaHttpError(403, "Project permission was revoked.");
        };
        const interval = setInterval(() => {
          if (checking || signal.aborted) return;
          checking = check()
            .catch((error: unknown) => {
              stopped =
                error instanceof Error && /paused/i.test(error.message) ? "paused" : "denied";
              terminalMessage = error instanceof Error ? error.message : "Permission changed.";
              abort.abort();
            })
            .finally(() => {
              checking = null;
            });
        }, 1000);
        try {
          await check();
          if (signal.aborted) throw new DOMException("Stopped", "AbortError");
          send({ type: "state", id: input.requestId, status: "running" });
          if (contextIds.length) send({ type: "context", ids: contextIds });
          call = createOmniCall(
            request,
            apiKey,
            JSON.stringify(project.data),
            input.message,
            signal,
            history,
          );
          ready();
          for await (const part of call.result.fullStream) {
            if (signal.aborted) break;
            if (part.type === "text-delta") {
              text += part.text;
              send({ type: "text", text: part.text });
            }
            if (part.type === "reasoning-delta") send({ type: "thinking", text: part.text });
            if (part.type === "error") throw part.error;
          }
          if (signal.aborted) throw new DOMException("Stopped", "AbortError");
          await check();
          if (signal.aborted) throw new DOMException("Stopped", "AbortError");
          const reason = await call.result.finishReason;
          if (reason === "content-filter") {
            stopped = "refused";
            terminalStatus = 422;
            terminalMessage = "The model declined this request. No tools ran.";
          } else if (reason === "length") {
            stopped = "failed";
            terminalStatus = 422;
            terminalMessage = "Output budget reached. Partial text retained; no automatic retry.";
          } else if (!text.trim()) {
            stopped = "failed";
            terminalStatus = 502;
            terminalMessage = "The model returned no answer. No tools ran.";
          } else stopped = "completed";
        } catch (error) {
          const failure = call?.getFailure();
          if (failure) {
            terminalStatus = failure.status;
            terminalMessage = failure.message;
            stopped = requiresPersistentPause(failure.status) ? "denied" : "failed";
          } else if (signal.aborted) {
            stopped ??= "cancelled";
            terminalStatus = stopped === "cancelled" ? 499 : 403;
            terminalMessage ||= "Stopped. Partial text retained; billed usage may apply.";
          } else {
            stopped = "failed";
            terminalStatus = error instanceof BetaHttpError ? error.status : 502;
            terminalMessage =
              error instanceof BetaHttpError
                ? error.message
                : "Agent did not finish. No tools ran; no automatic retry.";
          }
        } finally {
          ready();
          clearInterval(interval);
          if (checking) await checking;
          const failure = call?.getFailure();
          const status = stopped ?? "failed";
          const usage =
            call && !signal.aborted
              ? await Promise.resolve(call.result.totalUsage).catch(() => undefined)
              : undefined;
          const result = await runs()
            .update({
              status,
              result: text.slice(0, 40000),
              error_status: status === "completed" ? null : terminalStatus,
              error_message: status === "completed" ? null : terminalMessage.slice(0, 1500),
              input_tokens: usage?.inputTokens ?? null,
              output_tokens: usage?.outputTokens ?? null,
              total_tokens: usage?.totalTokens ?? null,
              gateway_run_id: call?.gateway.getRunId() ?? null,
              finished_at: new Date().toISOString(),
            } as never)
            .eq("id", input.requestId)
            .eq("owner_id", userId)
            .eq("status", "running")
            .select("*")
            .maybeSingle();
          // Cancellation can win the row update; never overwrite it with completed.
          const readback = result.data
            ? result
            : await runs()
                .select("*")
                .eq("id", input.requestId)
                .eq("owner_id", userId)
                .maybeSingle();
          if (failure && requiresPersistentPause(failure.status)) {
            const blocked = await supabaseAdmin
              .from("ai_gateway_state")
              .update({ blocked_status: failure.status, message: failure.message })
              .eq("feature", "evolution-omni")
              .eq("message", guardMessage)
              .select("feature")
              .maybeSingle();
            if (blocked.error || !blocked.data)
              terminalMessage = `${failure.message} Access remains paused; owner review required.`;
          } else if (!result.error && !readback.error && readback.data) {
            const cleared = await supabaseAdmin
              .from("ai_gateway_state")
              .delete()
              .eq("feature", "evolution-omni")
              .eq("message", guardMessage)
              .select("feature")
              .maybeSingle();
            if (cleared.error || !cleared.data)
              send({
                type: "error",
                status: 503,
                message: "Result saved, but AI remains paused pending owner review.",
              });
          }
          if (result.error || readback.error || !readback.data)
            send({
              type: "error",
              status: 503,
              message: "Result could not be saved. AI remains paused; do not restart this request.",
            });
          else {
            if (status !== "completed")
              send({
                type: "error",
                status: terminalStatus,
                message: terminalMessage || "Agent stopped. No tools ran.",
              });
            send({ type: "result", run: readback.data as unknown as OmniAgentRun });
          }
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        abort.abort();
      },
    });
    await providerReady;
    if (call) {
      await call.gateway.waitForRunId();
      const failure = call.getFailure();
      if (failure) {
        await new Response(body).text();
        return jsonError(failure.status, failure.message);
      }
    } else {
      await new Response(body).text();
      return jsonError(
        signal.aborted ? 499 : terminalStatus,
        terminalMessage || "No model request started.",
      );
    }
    if (request.signal.aborted) {
      abort.abort();
      return new Response(null, { status: 499 });
    }
    const headers = {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    };
    return new Response(body, {
      headers: getLovableAiGatewayResponseHeaders(call.getResponseHeaders(), headers),
    });
  } catch (error) {
    return jsonError(
      error instanceof BetaHttpError ? error.status : 403,
      error instanceof Error ? error.message : "Agent unavailable.",
    );
  }
}
