import { describe, expect, it } from "vitest";
import {
  canSendTo,
  introFor,
  orbState,
  speakableText,
  speakerLabel,
  voiceAgent,
} from "@/lib/omni-voice";

const open = { aiApproved: true, paused: false, hasProject: true, consent: true };

describe("OMNI voice agent identity and routing", () => {
  it("routes messages to OMNI only when every existing gate passes", () => {
    expect(canSendTo("omni", open)).toEqual({ ok: true });
    expect(canSendTo("omni", { ...open, aiApproved: false }).ok).toBe(false);
    expect(canSendTo("omni", { ...open, paused: true }).ok).toBe(false);
    expect(canSendTo("omni", { ...open, consent: false }).ok).toBe(false);
    expect(canSendTo("omni", { ...open, hasProject: false }).ok).toBe(false);
  });

  it("never routes a Jackboy message anywhere from this page, even with all gates open", () => {
    const result = canSendTo("jackboy", open);
    expect(result.ok).toBe(false);
    expect(voiceAgent("jackboy").chatPath).toBeNull();
  });

  it("labels each reply with the agent that produced it", () => {
    expect(speakerLabel("assistant", "omni")).toBe("OMNI");
    expect(speakerLabel("assistant", "jackboy")).toBe("JACKBOY");
    expect(speakerLabel("user", "jackboy")).toBe("YOU");
  });

  it("introduces OMNI by name and never voices Jackboy as if it were speaking", () => {
    expect(introFor("omni")).toBe("You are now speaking with OMNI, on Orbiting Minds Mothership.");
    const jackboy = introFor("jackboy");
    expect(jackboy).toContain("Jackboy is not connected");
    expect(jackboy).not.toMatch(/speaking with Jackboy|this is Jackboy/i);
    expect(jackboy).not.toContain("OMNI");
  });
});

describe("OMNI orb state", () => {
  const base = { agentConnected: true, listening: false, speaking: false, busy: false };
  it("shows not-connected for an unconnected agent regardless of activity", () => {
    expect(orbState({ ...base, agentConnected: false, speaking: true, busy: true })).toBe(
      "unavailable",
    );
  });
  it("prefers listening, then speaking, then waiting", () => {
    expect(orbState({ ...base, listening: true, speaking: true })).toBe("listening");
    expect(orbState({ ...base, speaking: true, busy: true })).toBe("speaking");
    expect(orbState({ ...base, busy: true })).toBe("thinking");
    expect(orbState(base)).toBe("idle");
  });
});

describe("speakableText", () => {
  it("does not read code blocks or link addresses aloud", () => {
    const out = speakableText("Run this:\n```ts\nconst x = 1;\n```\nSee [docs](https://example.com).");
    expect(out).not.toContain("const x");
    expect(out).not.toContain("https://");
    expect(out).toContain("docs");
  });
  it("caps very long replies", () => {
    expect(speakableText("Word. ".repeat(600)).length).toBeLessThan(1300);
  });
});
