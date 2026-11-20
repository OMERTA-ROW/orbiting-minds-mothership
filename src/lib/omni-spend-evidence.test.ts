import { describe, expect, it } from "vitest";
import {
  INTENDED_SPEND_LIMITS,
  SPEND_EVIDENCE_FRESH_MS,
  manifestSpendingCapUsd,
  spendingCapView,
  type SignedPermitLimits,
} from "./omni-spend-evidence";
import { OMNI_PERMIT_LIMITS } from "./jackboy-link.server";
import { buildManifest } from "./omni-contract";

const NOW = Date.parse("2026-11-20T16:00:00.000Z");
const permit = (over: Partial<SignedPermitLimits> = {}): SignedPermitLimits => ({
  perCallUsd: 0.5,
  perTaskUsd: 1,
  dailyUsd: 5,
  recordedAt: new Date(NOW - 60_000).toISOString(),
  ...over,
});
const view = (p: SignedPermitLimits | null) => spendingCapView({ status: "read", latest: p }, NOW);

describe("CODE spending cap evidence", () => {
  it("owner caps are $0.50 per call, $1 per job, $5 per day, one job at a time", () => {
    expect(INTENDED_SPEND_LIMITS).toEqual({
      perCallUsd: 0.5,
      perTaskUsd: 1,
      dailyUsd: 5,
      maxActiveJobs: 1,
    });
  });

  it("matches the caps the Mothership enforces on every signed permit", () => {
    expect(OMNI_PERMIT_LIMITS).toEqual({
      perCallUsd: INTENDED_SPEND_LIMITS.perCallUsd,
      perTaskUsd: INTENDED_SPEND_LIMITS.perTaskUsd,
      dailyUsd: INTENDED_SPEND_LIMITS.dailyUsd,
    });
  });

  it("a fresh signed permit at the caps verifies and reports the $5 daily cap", () => {
    const v = view(permit());
    expect(v.state).toBe("verified");
    expect(manifestSpendingCapUsd(v)).toBe(5);
  });

  it("a permit exactly 15 minutes old still counts; one millisecond older does not", () => {
    const edge = new Date(NOW - SPEND_EVIDENCE_FRESH_MS).toISOString();
    const past = new Date(NOW - SPEND_EVIDENCE_FRESH_MS - 1).toISOString();
    expect(view(permit({ recordedAt: edge })).state).toBe("verified");
    expect(view(permit({ recordedAt: past })).state).toBe("stale");
    expect(manifestSpendingCapUsd(view(permit({ recordedAt: past })))).toBeUndefined();
  });

  it("the live record from 2026-11-19 01:57 UTC is history, not proof", () => {
    const v = view(permit({ recordedAt: "2026-11-19T01:57:46.647Z" }));
    expect(v.state).toBe("stale");
    expect(v.lastSignedPermit?.matchesIntended).toBe(true);
    expect(manifestSpendingCapUsd(v)).toBeUndefined();
  });

  it("$0.51 per call is above the cap and never verifies", () => {
    const v = view(permit({ perCallUsd: 0.51 }));
    expect(v.state).toBe("exceeds_caps");
    expect(manifestSpendingCapUsd(v)).toBeUndefined();
  });

  it("$1.01 per job or $5.01 per day is above the cap", () => {
    expect(view(permit({ perTaskUsd: 1.01 })).state).toBe("exceeds_caps");
    expect(view(permit({ dailyUsd: 5.01 })).state).toBe("exceeds_caps");
  });

  it("zero, negative or non-numeric limits never verify", () => {
    expect(view(permit({ perCallUsd: 0 })).state).toBe("exceeds_caps");
    expect(view(permit({ dailyUsd: -1 })).state).toBe("exceeds_caps");
    expect(view(permit({ perTaskUsd: Number.NaN })).state).toBe("exceeds_caps");
  });

  it("lower limits are enforced but flagged as not the intended values", () => {
    const v = view(permit({ dailyUsd: 2 }));
    expect(v.state).toBe("verified");
    expect(v.lastSignedPermit?.matchesIntended).toBe(false);
    expect(manifestSpendingCapUsd(v)).toBe(2);
  });

  it("an unreadable record time is never fresh", () => {
    expect(view(permit({ recordedAt: "not-a-date" })).state).toBe("stale");
  });

  it("no permit ever, an unreadable store, or no read stays unverified", () => {
    expect(view(null).state).toBe("no_evidence");
    expect(spendingCapView({ status: "unreadable" }, NOW).state).toBe("unknown");
    expect(spendingCapView({ status: "not_read" }, NOW).state).toBe("unknown");
  });

  it("the manifest omits spendingCapUsd unless verified, and always dates the reading", () => {
    const stale = buildManifest("https://evoomni.tech", {
      aiConfigured: true,
      chatInstalled: false,
      spend: { status: "read", latest: permit({ recordedAt: "2026-11-19T01:57:46.647Z" }) },
      now: NOW,
    });
    expect("spendingCapUsd" in stale).toBe(false);
    expect(stale.spendingCap.state).toBe("stale");
    expect(stale.checkedAt).toBe("2026-11-20T16:00:00.000Z");
    const fresh = buildManifest("https://evoomni.tech", {
      aiConfigured: true,
      chatInstalled: false,
      spend: { status: "read", latest: permit() },
      now: NOW,
    });
    expect((fresh as { spendingCapUsd?: number }).spendingCapUsd).toBe(5);
    expect("spendingCapUsd" in buildManifest("https://evoomni.tech")).toBe(false);
  });
});
