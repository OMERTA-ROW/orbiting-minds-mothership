import { describe, expect, it } from "vitest";
import { probeFailureDetails } from "./activation-probe";
import { JACKBOY_REFUSAL_CODES } from "./jackboy-link.server";

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
    expect(probeFailureDetails(err("timeout"))[1]!.detail).toMatch(/5 seconds/);
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
  });
});
