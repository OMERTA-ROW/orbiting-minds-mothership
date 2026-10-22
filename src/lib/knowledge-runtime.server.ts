/** Nitro binds waitUntil on the incoming Cloudflare request. No guessed global context. */
export function dispatchKnowledgeWork(request: Request, work: () => Promise<unknown>, local: boolean): Promise<Response> | Response {
  const runtime = request as Request & { waitUntil?: (task: Promise<unknown>) => void };
  if (typeof runtime.waitUntil === "function") {
    runtime.waitUntil(work().catch(() => { console.error("Knowledge background attempt failed; inspect persisted run history."); }));
    return Response.json({ accepted: true, completed: false }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  // Development verification is explicitly synchronous; published calls fail closed
  // rather than acknowledge work the host cannot retain after the HTTP response.
  if (local) return work().then((result) => Response.json(result, { headers: { "Cache-Control": "no-store" } }));
  return Response.json({ accepted: false, error: "Background execution is unavailable; collection was not started." }, { status: 503 });
}

export async function readBoundedFeed(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new Error("Feed has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let bytes = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error("Feed exceeds byte limit"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}