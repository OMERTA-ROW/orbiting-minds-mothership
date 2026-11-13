import { describe, expect, it } from "vitest";
import {
  canSendTo,
  introFor,
  orbState,
  speakableText,
  speakerLabel,
  stepSpeaker,
  terminalIntro,
  unreadReplies,
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
    expect(introFor("omni")).toBe(
      "You are now speaking with OMNI, the Mothership text agent (Lovable AI), not the OMNI terminal on Railway.",
    );
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
    const out = speakableText(
      "Run this:\n```ts\nconst x = 1;\n```\nSee [docs](https://example.com).",
    );
    expect(out).not.toContain("const x");
    expect(out).not.toContain("https://");
    expect(out).toContain("docs");
  });
  it("caps very long replies", () => {
    expect(speakableText("Word. ".repeat(600)).length).toBeLessThan(1300);
  });
});

describe("OMNI terminal voice identity", () => {
  const agents = [
    { id: "omni", display_name: "OMNI" },
    { id: "jackboy", display_name: "Jackboy" },
  ];
  it("names each reply by the enrolled agent that produced it, never defaulting to OMNI", () => {
    expect(stepSpeaker("jackboy", agents)).toBe("Jackboy");
    expect(stepSpeaker("omni", agents)).toBe("OMNI");
    expect(stepSpeaker("razul", agents)).toBe("Unknown agent (razul)");
  });
  it("says the terminal is not connected instead of claiming a live conversation", () => {
    expect(terminalIntro("Jackboy", true)).toBe(
      "You are now speaking with Jackboy, through the OMNI terminal.",
    );
    const off = terminalIntro("Jackboy", false);
    expect(off).toContain("not connected");
    expect(off).not.toMatch(/speaking with/);
  });
  it("reads aloud only real chat replies, once each", () => {
    const steps = [
      { id: "a", kind: "message", body: "Done." },
      { id: "b", kind: "output", body: "ls" },
      { id: "c", kind: "message", body: "  " },
      { id: "d", kind: "message", body: "Next." },
    ];
    expect(unreadReplies(steps, new Set()).map((s) => s.id)).toEqual(["a", "d"]);
    expect(unreadReplies(steps, new Set(["a"])).map((s) => s.id)).toEqual(["d"]);
  });
});
