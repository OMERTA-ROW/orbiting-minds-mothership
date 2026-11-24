/**
 * Signed, device-scoped native chat. The model call is settled before text is
 * emitted; NDJSON frames stream the settled result without exposing live tokens.
 */
import { createFileRoute } from "@tanstack/react-router";
import { corsHeaders } from "@/lib/omni-dock";
import { splitNativeChatText } from "@/lib/omni-native-chat";

const encoder = new TextEncoder();

function frame(controller: ReadableStreamDefaultController<Uint8Array>, value: unknown) {
  controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
}

export const Route = createFileRoute("/api/public/omni/dock/chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { dockPreflight } = await import("@/lib/omni-dock.server");
        return dockPreflight(request);
      },
      POST: async ({ request }) => {
        const { handleSigned } = await import("@/lib/omni-dock.server");
        const { adminDockStore } = await import("@/lib/omni-dock-store.server");
        const store = await adminDockStore();
        const abortController = new AbortController();
        const abortForRequest = () => abortController.abort();
        if (request.signal.aborted) abortController.abort();
        else request.signal.addEventListener("abort", abortForRequest, { once: true });
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            frame(controller, { type: "status", status: "validating" });
            try {
              const result = await handleSigned(
                request,
                "chat",
                store,
                Date.now(),
                abortController.signal,
              );
              const reply = result.body["reply"];
              if (
                result.status !== 200 ||
                result.body["ok"] !== true ||
                typeof reply !== "string"
              ) {
                frame(controller, {
                  type: "error",
                  status: result.status === 200 ? 503 : result.status,
                  protocol: "omni.native-chat/v1",
                  reason: result.body["reason"] ?? "invalid_result",
                  message: result.body["message"] ?? "The chat response was incomplete.",
                });
                controller.close();
                return;
              }
              const { reply: _reply, ...metadata } = result.body;
              frame(controller, { type: "status", status: "settled" });
              for (const text of splitNativeChatText(reply)) {
                frame(controller, { type: "text", text });
              }
              frame(controller, { type: "done", ...metadata });
              controller.close();
            } catch {
              try {
                frame(controller, {
                  type: "error",
                  status: 503,
                  ok: false,
                  protocol: "omni.native-chat/v1",
                  reason: "unavailable",
                  message: "The native chat request could not be completed.",
                });
                controller.close();
              } catch {
                // The client may have disconnected after the request was cancelled.
              }
            } finally {
              request.signal.removeEventListener("abort", abortForRequest);
            }
          },
          cancel() {
            abortController.abort();
          },
        });
        return new Response(body, {
          status: 200,
          headers: {
            ...corsHeaders(request.headers.get("origin")),
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
