import { describe, expect, it } from "vitest";
import {
  ActuationError,
  connectionExpiresAt,
  describeActuationFailure,
  earlierOf,
  verifyThenConfigure,
} from "./activation-actuation";
import { JackboyLinkError } from "./jackboy-link.server";

const NOW = Date.parse("2026-11-16T21:15:00Z");

describe("Step 9 connection window", () => {
  it("asks Jackboy for its own approval end when Step 7 was renewed past it (the 21:15 failure)", () => {
    expect(
      connectionExpiresAt("2026-11-17T08:45:00Z", Date.parse("2026-11-17T03:49:58.534Z"), NOW),
    ).toBe("2026-11-17T03:49:58.534Z");
  });
  it("keeps Step 7's end when it is earlier than Jackboy's approval", () => {
    expect(
      connectionExpiresAt("2026-11-16T20:33:00Z", Date.parse("2026-11-17T03:49:58Z"), Date.parse("2026-11-16T20:00:00Z")),
    ).toBe("2026-11-16T20:33:00.000Z");
  });
  it("refuses locally when Jackboy's approval is missing or ending within a minute", () => {
    expect(() => connectionExpiresAt("2026-11-17T08:45:00Z", NaN, NOW)).toThrow(ActuationError);
    expect(() => connectionExpiresAt("2026-11-17T08:45:00Z", NOW + 30_000, NOW)).toThrow(
      /ends within a minute/,
    );
  });
  it("refuses locally when Step 7 has ended", () => {
    expect(() => connectionExpiresAt("2026-11-16T21:00:00Z", NOW + 3600_000, NOW)).toThrow(
      /Step 7/,
    );
  });
  it("earlierOf picks the earlier valid time", () => {
    expect(earlierOf("2026-11-17T08:45:00Z", "2026-11-17T03:49:58Z")).toBe(
      "2026-11-17T03:49:58.000Z",
    );
    expect(earlierOf(null, "2026-11-17T03:49:58Z")).toBe("2026-11-17T03:49:58.000Z");
    expect(earlierOf(null, null)).toBeNull();
  });
});

describe("actuation failure reasons", () => {
  it("names Jackboy's signed approval_expired refusal", () => {
    const f = describeActuationFailure(
      new JackboyLinkError("x", "http", { status: 403, code: "approval_expired" }),
    );
    expect(f.reason).toBe("jackboy_http_403_approval_expired");
    expect(f.message).toMatch(/outlast Jackboy's own link approval/);
  });
  it("names a refusal by Jackboy's execution authority", () => {
    const f = describeActuationFailure(
      new JackboyLinkError("x", "http", { status: 503, code: "execution_control_unavailable" }),
    );
    expect(f.reason).toBe("jackboy_http_503_execution_control_unavailable");
  });
  it("classifies local state mismatch and unverifiable replies without contents", () => {
    expect(describeActuationFailure(new ActuationError("state_mismatch", "x")).reason).toBe(
      "state_mismatch",
    );
    expect(describeActuationFailure(new Error("stale")).reason).toBe("state_unverified");
  });
  it("keeps the stored reason within the database's limit", () => {
    const f = describeActuationFailure(
      new JackboyLinkError("x", "http", { status: 403, code: "approval_expired_or_link_disabled" }),
    );
    expect(`backend_actuation_${f.reason}`.length).toBeLessThanOrEqual(200);
  });
});

describe("Jackboy 9081a41 execution-control refusals", () => {
  it("names the classified reason and Jackboy's stage from a signed refusal", () => {
    const f = describeActuationFailure({
      stage: "http",
      status: 409,
      code: "executor_verification_required",
      remoteStage: "verification",
      signed: true,
    });
    expect(f.reason).toBe("jackboy_http_409_executor_verification_required_verification");
    expect(f.message).toContain("fresh executor verification");
    expect(f.message).toContain("Jackboy refused at: executor verification");
  });
  it("ignores a stage on an unsigned refusal", () => {
    const f = describeActuationFailure({
      stage: "http",
      status: 409,
      code: "spend_enforcement_unverified",
      remoteStage: "authority",
      signed: false,
    });
    expect(f.reason).toBe("jackboy_http_409_spend_enforcement_unverified");
    expect(f.message).not.toContain("Jackboy refused at");
  });
  it("explains a missing executor verification as its own local issue", () => {
    expect(describeActuationFailure(new ActuationError("executor_unverified", "x")).reason).toBe(
      "executor_unverified",
    );
  });
});

describe("Step 10 verify, then configure", () => {
  const base = {
    connected: true,
    configured: false,
    armed: false,
    executorRelease: "omni-bounded-plan-2" as string | null,
    operationId: "aaaaaaaa-0000-4000-8000-000000000009",
  };
  it("verifies immediately before configuring, in that order", async () => {
    const calls: string[] = [];
    const state = await verifyThenConfigure(async (op) => {
      calls.push(op);
      return op === "verify" ? base : { ...base, configured: true };
    }, "omni-bounded-plan-2");
    expect(calls).toEqual(["verify", "configure"]);
    expect(state.configured).toBe(true);
  });
  it("never configures when verification recorded no release", async () => {
    const calls: string[] = [];
    await expect(
      verifyThenConfigure(async (op) => {
        calls.push(op);
        return { ...base, executorRelease: null };
      }, "omni-bounded-plan-2"),
    ).rejects.toMatchObject({ issue: "executor_unverified" });
    expect(calls).toEqual(["verify"]);
  });
  it("refuses an unreviewed release before configuring", async () => {
    await expect(
      verifyThenConfigure(async () => ({ ...base, executorRelease: "other-1" }), "omni-bounded-plan-2"),
    ).rejects.toMatchObject({ issue: "release_mismatch" });
  });
  it("refuses a configured state that came back armed", async () => {
    await expect(
      verifyThenConfigure(
        async (op) => (op === "verify" ? base : { ...base, configured: true, armed: true }),
        "omni-bounded-plan-2",
      ),
    ).rejects.toMatchObject({ issue: "state_mismatch" });
  });
});
