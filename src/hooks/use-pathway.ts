import { useEffect, useRef, useState } from "react";
import { conceptSchema, parsePathwayLine, type PartialPathway } from "@/lib/pathway";

export function usePathway() {
  const [pathway, setPathway] = useState<PartialPathway | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "complete" | "stopped" | "error">("idle");
  const [error, setError] = useState("");
  const [thinking, setThinking] = useState("");
  const [submitted, setSubmitted] = useState<{ concept: string; goal: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate(input: { concept: string; goal: string; consent: boolean }) {
    if (controller.current) return;
    const validated = conceptSchema.safeParse(input);
    if (!validated.success) { setError(validated.error.issues[0]?.message ?? "Check your concept."); return; }
    const abort = new AbortController();
    controller.current = abort;
    setSubmitted({ concept: validated.data.concept, goal: validated.data.goal });
    setStatus("generating"); setError(""); setThinking(""); setPathway(null);
    let terminal = false;
    try {
      const response = await fetch("/api/evolution-pathway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validated.data), signal: abort.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.message === "string" ? body.message : "AI generation could not start. Your concept is unchanged.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("AI generation returned an empty response.");
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = parsePathwayLine(line);
        if (event.type === "thinking") setThinking((t) => t + event.text);
        if (event.type === "partial") setPathway(event.pathway);
        if (event.type === "result") { setPathway(event.pathway); setStatus("complete"); terminal = true; }
        if (event.type === "error") { setError(event.message); setStatus("error"); terminal = true; }
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(consume);
      }
      buffer += decoder.decode();
      consume(buffer);
      if (!terminal) throw new Error("Generation ended before the pathway was complete. No validation was performed.");
    } catch (cause) {
      if (abort.signal.aborted) setStatus("stopped");
      else { setError(cause instanceof Error ? cause.message : "AI generation failed."); setStatus("error"); }
    } finally { controller.current = null; }
  }
  return { pathway, status, error, thinking, submitted, generate, stop: () => controller.current?.abort() };
}