import { describe, expect, it } from "vitest";
import { readinessEvidence, type EvidenceInput } from "./readiness-evidence";
import { safetyView } from "./jackboy-safety";

const NOW = Date.parse("2026-11-14T11:00:00Z");
const iso = (minsFromNow: number) => new Date(NOW + minsFromNow * 60_000).toISOString();

function base(over: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    now: NOW,
    handshake: { lastConnectedAt: null, lastAttemptAt: null },
    safety: safetyView(null, NOW),
    permit: null,
    approvals: [
      { step: 7, status: "approved", decided_at: iso(-600), approval_expires_at: iso(60) },
      { step: 9, status: "approved", decided_at: iso(-300), approval_expires_at: null },
      { step: 10, status: "approved", decided_at: iso(-299), approval_expires_at: null },
    ],
    activations: [
      {
        kind: "live_link",
        status: "inactive",
        activatedAt: null,
        updatedAt: iso(-500),
        effective: false,
      },
      {
        kind: "autonomy",
        status: "inactive",
        activatedAt: null,
        updatedAt: iso(-500),
        effective: false,
      },
    ],
    selfTest: { action: "self_test_passed", occurred_at: iso(-600) },
    mothershipStop: { engaged: false, changedAt: iso(-1000) },
    ...over,
  };
}
const row = (i: EvidenceInput, id: string) => readinessEvidence(i).find((r) => r.id === id)!;

describe("readiness evidence", () => {
  it("handshake is current only within 30 minutes, stale after, missing when never", () => {
    expect(row(base(), "handshake").status).toBe("missing");
    expect(
      row(base({ handshake: { lastConnectedAt: iso(-29), lastAttemptAt: iso(-29) } }), "handshake")
        .status,
    ).toBe("current");
    const stale = row(
      base({ handshake: { lastConnectedAt: iso(-31), lastAttemptAt: iso(-31) } }),
      "handshake",
    );
    expect(stale.status).toBe("stale");
    expect(stale.at).toBe(iso(-31));
  });

  it("reports a later failed handshake attempt", () => {
    const r = row(
      base({ handshake: { lastConnectedAt: iso(-40), lastAttemptAt: iso(-2) } }),
      "handshake",
    );
    expect(r.detail).toContain("did not complete");
  });

  it("no permit means missing, never valid; unreadable stays unreadable", () => {
    expect(row(base(), "permit").status).toBe("missing");
    expect(row(base({ permit: "unreadable" }), "permit").status).toBe("unreadable");
  });

  it("an active permit past its expiry counts as expired, not current", () => {
    const p = {
      kind: "code",
      status: "active",
      issuedAt: iso(-2),
      expiresAt: iso(-1),
      closedAt: null,
      closedReason: null,
    };
    expect(row(base({ permit: p }), "permit").status).toBe("expired");
    expect(row(base({ permit: { ...p, expiresAt: iso(1) } }), "permit")).toMatchObject({
      status: "current",
      signed: true,
      at: iso(-2),
    });
  });

  it("approved Steps 9–10 do not count as activation", () => {
    expect(row(base(), "owner_approvals").status).toBe("current");
    expect(row(base(), "activation_live_link").status).toBe("missing");
    expect(row(base(), "activation_autonomy").status).toBe("missing");
  });

  it("Step 7 window expires at its recorded time", () => {
    expect(row(base(), "step7_window")).toMatchObject({ status: "current", at: iso(60) });
    const late = base({ now: NOW + 61 * 60_000 });
    expect(row(late, "step7_window").status).toBe("expired");
  });

  it("Step 8 proof is valid for 24 hours from the recorded pass", () => {
    const r = row(base(), "step8_proof");
    expect(r.at).toBe(iso(-600 + 24 * 60));
    expect(r.status).toBe("current");
    expect(
      row(
        base({ selfTest: { action: "self_test_passed", occurred_at: iso(-24 * 60 - 1) } }),
        "step8_proof",
      ).status,
    ).toBe("expired");
  });

  it("without a signed Jackboy reading, stops and authorization are not current", () => {
    for (const id of ["jackboy_code_stop", "jackboy_kill_switch", "jackboy_authorization"]) {
      const r = row(base(), id);
      expect(r.status).toBe("missing");
      expect(r.signed).toBe(false);
      expect(r.value).toBe("unknown");
    }
  });

  it("an unreadable Mothership stop is unknown, not released", () => {
    expect(
      row(base({ mothershipStop: { engaged: null, changedAt: null } }), "mothership_stop"),
    ).toMatchObject({ value: "unknown", status: "unreadable" });
    expect(row(base(), "mothership_stop")).toMatchObject({
      value: "released",
      status: "current",
      at: iso(-1000),
    });
  });
});
