import { describe, it, expect } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  initialCanon,
  branchPlan,
  canonSchema,
  releaseSchema,
  initialRelease,
  releaseAction,
  assertReleaseAction,
  rssXml,
  ownedHttps,
  channelEvidence,
  releaseChannels,
  canonicalJson,
} from "@/lib/forge-universe";
const id = "11111111-1111-4111-8111-111111111111",
  at = "2026-10-21T06:20:00.000Z";
const rss = {
  ...initialRelease,
  title: "Original & independent",
  siteUrl: "https://creator-owned.net/podcast",
  assetId: id,
};
describe("Creator Universe boundaries", () => {
  it("branches one exact fictional canon without granting execution", () => {
    const plans = branchPlan(initialCanon);
    expect(plans.map((v) => v.kind)).toEqual(["podcast", "game", "website"]);
    expect(plans.every((v) => v.status === "EDITABLE PLAN / NOT EXECUTED")).toBe(true);
  });
  it("rejects duplicate branches", () =>
    expect(canonSchema.safeParse({ ...initialCanon, branches: ["game", "game"] }).success).toBe(
      false,
    ));
  it("rejects excluded project content", () =>
    expect(canonSchema.safeParse({ ...initialCanon, name: "CyberLink Social" }).success).toBe(
      false,
    ));
  it("requires RSS source and site", () =>
    expect(releaseSchema.safeParse(initialRelease).success).toBe(false));
  it("unconnected channels cannot autopublish or invent receipts", () => {
    for (const c of releaseChannels)
      expect(channelEvidence(c)).toMatchObject({
        connection: "NOT CONNECTED",
        autopublish: false,
        receipt: null,
      });
  });
});
describe("Manual release consent and revocation", () => {
  it("first review requires human approval", () =>
    expect(
      releaseAction.safeParse({
        id,
        action: "review",
        consent: { rights: true, privacy: true },
        approve: false,
      }).success,
    ).toBe(false));
  it("export requires rights and privacy", () =>
    expect(releaseAction.safeParse({ id, action: "prepare", approve: true }).success).toBe(false));
  it("draft cannot be prepared before review", () =>
    expect(() => assertReleaseAction("DRAFT", "prepare", true, false)).toThrow(/Review/));
  it("revoked release cannot prepare", () =>
    expect(() => assertReleaseAction("REVOKED", "prepare", true, false)).toThrow(/Revoked/));
  it("pause blocks preparation", () =>
    expect(() => assertReleaseAction("REVIEWED", "prepare", true, true)).toThrow(/unpaused/));
  it("revoke stays available without approval or while paused", () =>
    expect(() => assertReleaseAction("REVIEWED", "revoke", false, true)).not.toThrow());
  it("reviewed and already prepared bundles can be repeated", () => {
    expect(() => assertReleaseAction("REVIEWED", "prepare", true, false)).not.toThrow();
    expect(() => assertReleaseAction("BUNDLE_PREPARED", "prepare", true, false)).not.toThrow();
  });
});
describe("RSS bundle reference integrity", () => {
  it("accepts actual database UTC offsets in saved creation timestamps", () =>
    expect(rssXml(rss, id, 16044, "2026-10-21T06:20:00+00:00")).toBe(rssXml(rss, id, 16044, at)));
  it("hash input ignores database JSON key ordering", () =>
    expect(canonicalJson({ title: "Original", credits: "Creator", nested: { b: 1, a: 2 } })).toBe(
      canonicalJson({ nested: { a: 2, b: 1 }, credits: "Creator", title: "Original" }),
    ));
  it("generates parseable escaped RSS with exact WAV byte length", () => {
    const xml = rssXml(rss, id, 16044, at);
    expect(XMLValidator.validate(xml)).toBe(true);
    const item = new XMLParser({ ignoreAttributes: false }).parse(xml).rss.channel.item;
    expect(item.enclosure["@_length"]).toBe("16044");
    expect(item.enclosure["@_type"]).toBe("audio/wav");
    expect(item.enclosure["@_url"]).toBe(`https://creator-owned.net/podcast/audio/${id}.wav`);
    expect(item.title).toBe("Original & independent");
  });
  it("stable GUID and date make retries identical", () =>
    expect(rssXml(rss, id, 16044, at)).toBe(rssXml(rss, id, 16044, at)));
  it("target date does not schedule or alter publication time", () =>
    expect(rssXml({ ...rss, targetDate: "2026-11-01T12:00:00.000Z" }, id, 16044, at)).toBe(
      rssXml(rss, id, 16044, at),
    ));
  it.each([
    "h",
    "not a URL",
    "http://creator.net",
    "https://localhost",
    "https://127.0.0.1",
    "https://foo.internal",
    "https://a.supabase.co/storage/a",
    "https://a.lovable.app",
    "https://user:pass@creator.net",
    "https://creator.net?token=value",
  ])("refuses unsafe/private destination %s", (url) =>
    expect(ownedHttps.safeParse(url).success).toBe(false),
  );
});
