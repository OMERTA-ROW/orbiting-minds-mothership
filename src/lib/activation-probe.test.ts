import { describe, expect, it } from "vitest";
import { probeFailureDetails } from "./activation-probe";
import {
  JACKBOY_REFUSAL_CODES,
  JACKBOY_RUNNER_WAIT_MS,
  JackboyLinkError,
  linkTimeoutMs,
} from "./jackboy-link.server";

const err = (stage: string, status?: number, code?: string) =>
  Object.assign(new Error("x"), { stage, status, code });

describe("Step 2 probe failure explanations", () => {
  it("names an older published Jackboy when it answers link_disabled", () => {
    const [reply, cause] = probeFailureDetails(err("http", 503, "link_disabled"));
    expect(reply!.detail).toBe("HTTP 503 · link_disabled");
    expect(cause!.detail).toMatch(/published site .* lacks the configuration probe/);
    expect(cause!.detail).toMatch(/0063/);
  });
  it("distinguishes signature, project, scope and timeout failures", () => {
    expect(probeFailureDetails(err("http", 401, "authentication_failed"))[1]!.detail).toMatch(
      /signature/,
    );
    expect(probeFailureDetails(err("http", 403, "project_or_action_denied"))[1]!.detail).toMatch(
      /OMNI_LINK_PROJECT_ID/,
    );
    expect(probeFailureDetails(err("http", 403, "configuration_scope_denied"))[1]!.detail).toMatch(
      /global pause/,
    );
    expect(probeFailureDetails(err("timeout"))[1]!.detail).toMatch(/did not answer in time/);
    const killSwitch = probeFailureDetails(err("http", 403, "kill_switch_on"));
    expect(killSwitch[0]!.detail).toBe("HTTP 403 · kill_switch_on");
    expect(killSwitch[1]!.detail).toMatch(/^Safety denial, not a fault/);
    expect(killSwitch[1]!.detail).not.toMatch(/timeout|did not answer/i);
    expect(probeFailureDetails(err("proof"))[1]!.detail).toMatch(/signature did not verify/);
    expect(probeFailureDetails(new Error("plain"))[0]!.detail).toBe("No classified reply");
  });
  it("covers every Jackboy refusal code within the stored 280-character limit", () => {
    for (const code of JACKBOY_REFUSAL_CODES) {
      for (const d of probeFailureDetails(err("http", 400, code))) {
        expect(d.detail.length).toBeLessThanOrEqual(280);
        expect(d.detail).not.toMatch(/Refused the probe with HTTP/);
      }
    }
    for (const stage of [
      "audit",
      "connection",
      "timeout",
      "redirect",
      "too_large",
      "proof",
      "contract",
      "runner_mismatch",
      "unknown",
    ])
      for (const d of probeFailureDetails(err(stage)))
        expect(d.detail.length).toBeLessThanOrEqual(280);
    for (const phase of ["reply", "body"] as const)
      for (const d of probeFailureDetails(
        new JackboyLinkError("t", "timeout", { limitMs: 9000, waitedMs: 9001, phase }),
      ))
        expect(d.detail.length).toBeLessThanOrEqual(280);
  });
});

describe("Step 2 timeout (2026-11-13 live attempt)", () => {
  it("waits longer than Jackboy's own 5 s runner wait, so Jackboy's signed answer can arrive", () => {
    expect(JACKBOY_RUNNER_WAIT_MS.configuration).toBe(5000);
    expect(linkTimeoutMs("configuration")).toBe(9000);
    expect(linkTimeoutMs("configuration")).toBeGreaterThan(JACKBOY_RUNNER_WAIT_MS.configuration);
  });
  it("also outlasts Jackboy's 6 s wait for a self-test run, and keeps 5 s where Jackboy does not wait on the runner", () => {
    expect(linkTimeoutMs("run")).toBe(10000);
    for (const action of ["handshake", "submit", "status", "cancel"] as const)
      expect(linkTimeoutMs(action)).toBe(5000);
  });
  it("reports the actual deadline and places the delay at Jackboy's site when it exceeded the runner wait", () => {
    const [reply, cause] = probeFailureDetails(
      new JackboyLinkError("t", "timeout", { limitMs: 9000, waitedMs: 9004, phase: "reply" }),
    );
    expect(reply!.detail).toBe("No usable reply (timeout after 9 s)");
    expect(cause!.detail).toMatch(/within 9 s/);
    expect(cause!.detail).toMatch(/Jackboy's site itself/);
    expect(cause!.detail).not.toMatch(/5 seconds/);
  });
  it("does not blame Jackboy's site when the deadline was no longer than the runner wait", () => {
    const [, cause] = probeFailureDetails(
      new JackboyLinkError("t", "timeout", { limitMs: 5000, phase: "reply" }),
    );
    expect(cause!.detail).toMatch(/within 5 s/);
    expect(cause!.detail).not.toMatch(/Jackboy's site itself/);
  });
  it("separates a reply that started and stalled", () => {
    const [reply, cause] = probeFailureDetails(
      new JackboyLinkError("t", "timeout", { limitMs: 9000, phase: "body" }),
    );
    expect(reply!.detail).toBe("No usable reply (timeout after 9 s, reply incomplete)");
    expect(cause!.detail).toMatch(/stalled/);
  });
});
