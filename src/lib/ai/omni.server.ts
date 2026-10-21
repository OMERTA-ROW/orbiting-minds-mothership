import { authenticateBetaAi, BetaHttpError, readBoundedJson } from "@/lib/beta-auth.server";
import { assertNonSensitive, liveOmniInput, type OmniEvent } from "@/lib/beta";
import { createOmniCall } from "./omni-responses.server.ts";
import { getLovableAiGatewayResponseHeaders } from "./run-id.server.ts";
import { requiresPersistentPause } from "./gateway-errors";
export async function handleOmni(request: Request) {
  try {
    const { client, userId } = await authenticateBetaAi(request);
    const parsed = liveOmniInput.safeParse(await readBoundedJson(request));
    if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message || "Invalid message or consent." }, { status: 400 });
    const project = await client.from("beta_projects").select("name, brief").eq("id", parsed.data.projectId).eq("owner_id", userId).maybeSingle();
    if (project.error || !project.data) return Response.json({ message: "Project not found in your account." }, { status: 404 });
    assertNonSensitive(`${project.data.name}\n${project.data.brief}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = await supabaseAdmin.from("ai_gateway_state").select("blocked_status, message").eq("feature", "evolution-omni").maybeSingle();
    if (state.error) return Response.json({ message: "AI availability could not be checked." }, { status: 503 });
    if (state.data) return Response.json({ message: state.data.message }, { status: state.data.blocked_status });
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return Response.json({ message: "Lovable AI is not configured. No request started." }, { status: 401 });
    // Recheck immediately before inference; a slow body cannot retain a revoked permission.
    await authenticateBetaAi(request);
    const abort = new AbortController(), signal = AbortSignal.any([request.signal, abort.signal]);
    const call = createOmniCall(request, apiKey, JSON.stringify(project.data), parsed.data.message, signal);
    const encoder = new TextEncoder(); let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ async start(controller) {
      const send = (event: OmniEvent) => { if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      try {
        let text = "";
        for await (const part of call.result.fullStream) {
          if (part.type === "text-delta") { text += part.text; send({ type: "text", text: part.text }); }
          if (part.type === "reasoning-delta") send({ type: "thinking", text: part.text });
          if (part.type === "error") throw part.error;
        }
        if (signal.aborted) return;
        if (await call.result.finishReason === "content-filter") { send({ type: "error", status: 422, message: "The model declined this request. No action was taken." }); return; }
        if (!text.trim()) throw new Error("Empty model response");
        const usage = await call.result.totalUsage;
        send({ type: "done", inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null, totalTokens: usage.totalTokens ?? null, actualCharge: null, runId: call.gateway.getRunId() ?? null });
      } catch {
        const failure = call.getFailure();
        if (failure && requiresPersistentPause(failure.status)) { const saved = await supabaseAdmin.from("ai_gateway_state").upsert({ feature: "evolution-omni", blocked_status: failure.status, message: failure.message }); if (saved.error) console.error("OMNI access block could not be persisted"); }
        if (!signal.aborted) send({ type: "error", status: failure?.status ?? 502, message: failure?.message ?? "OMNI did not finish this response. No tools ran. Start a fresh request only when ready." });
      } finally { if (!cancelled) controller.close(); }
    }, cancel() { cancelled = true; abort.abort(); } });
    await call.gateway.waitForRunId();
    const failure = call.getFailure();
    if (failure) { await new Response(body).text(); return Response.json({ message: failure.message }, { status: failure.status, headers: getLovableAiGatewayResponseHeaders(call.getResponseHeaders(), { "Cache-Control": "no-store" }) }); }
    if (signal.aborted) return new Response(null, { status: 499 });
    return new Response(body, { headers: getLovableAiGatewayResponseHeaders(call.getResponseHeaders(), { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-store, no-transform", "X-Content-Type-Options": "nosniff" }) });
  } catch (error) { return Response.json({ message: error instanceof Error ? error.message : "OMNI is unavailable." }, { status: error instanceof BetaHttpError ? error.status : 400 }); }
}