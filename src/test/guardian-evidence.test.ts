import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  maxGuardianEvidenceBytes,
  validateGuardianEvidence,
  type GuardianEvidenceEvent,
} from "@/lib/guardian-evidence";

async function signedEvent(
  overrides: Partial<GuardianEvidenceEvent> = {},
): Promise<GuardianEvidenceEvent> {
  const event: GuardianEvidenceEvent = {
    version: 1,
    sequence: 1,
    at: "2026-10-25T16:15:00Z",
    project: "owned-test",
    severity: "warning",
    rule: "task-allowlist",
    action: "DENIED",
    evidence: "Unknown task denied; no process started.",
    previous: "",
    sha256: "0".repeat(64),
    ...overrides,
  };
  const payload = [
    event.version,
    event.sequence,
    event.at,
    event.project,
    event.severity,
    event.rule,
    event.action,
    event.evidence,
    event.previous,
  ].join("\n");
  event.sha256 = Buffer.from(
    await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)),
  ).toString("hex");
  return event;
}

describe("Guardian offline evidence validation, never authorization", () => {
  beforeEach(() => vi.stubGlobal("crypto", webcrypto));
  afterEach(() => vi.unstubAllGlobals());
  it("validates an actual-format ordered chain and independent head", async () => {
    const first = await signedEvent(),
      second = await signedEvent({
        sequence: 2,
        previous: first.sha256,
        action: "CANCELLED",
        rule: "task-result",
      });
    expect(await validateGuardianEvidence(JSON.stringify([first, second]), second.sha256)).toEqual([
      first,
      second,
    ]);
  });
  it("rejects changed evidence without rewriting its digest", async () => {
    const event = await signedEvent();
    event.action = "AUTHORIZED";
    await expect(validateGuardianEvidence(JSON.stringify([event]))).rejects.toThrow(
      "fingerprint mismatch",
    );
  });
  it("rejects a reordered chain", async () => {
    const first = await signedEvent(),
      second = await signedEvent({ sequence: 2, previous: first.sha256 });
    await expect(validateGuardianEvidence(JSON.stringify([second, first]))).rejects.toThrow(
      "order",
    );
  });
  it("rejects mixed project evidence even with internally valid digests", async () => {
    const first = await signedEvent(),
      second = await signedEvent({ sequence: 2, previous: first.sha256, project: "other-owner" });
    await expect(validateGuardianEvidence(JSON.stringify([first, second]))).rejects.toThrow(
      "project",
    );
  });
  it("detects truncation only when an independent head is supplied", async () => {
    const first = await signedEvent(),
      second = await signedEvent({ sequence: 2, previous: first.sha256 });
    expect(await validateGuardianEvidence(JSON.stringify([first]))).toHaveLength(1);
    await expect(validateGuardianEvidence(JSON.stringify([first]), second.sha256)).rejects.toThrow(
      "saved head",
    );
  });
  it("rejects a rewritten chain against the saved external head", async () => {
    const original = await signedEvent(),
      rewritten = await signedEvent({ action: "AUTHORIZED" });
    await expect(
      validateGuardianEvidence(JSON.stringify([rewritten]), original.sha256),
    ).rejects.toThrow("saved head");
  });
  it("permits empty evidence without inventing activity", async () =>
    expect(await validateGuardianEvidence("[]")).toEqual([]));
  it("bounds import at exactly 2 MiB before parsing", async () => {
    expect(maxGuardianEvidenceBytes).toBe(2097152);
    await expect(validateGuardianEvidence(" ".repeat(2097153))).rejects.toThrow("2 MiB");
  });
  it("rejects forged capability fields; records never confer scopes", async () => {
    const event = await signedEvent();
    await expect(
      validateGuardianEvidence(
        JSON.stringify([{ ...event, scopes: ["secrets:read"], owner: "admin" }]),
      ),
    ).rejects.toThrow();
  });
  it("rejects multiline evidence that could alter canonical hashing", async () => {
    const event = await signedEvent({ evidence: "line one\nline two" });
    await expect(validateGuardianEvidence(JSON.stringify([event]))).rejects.toThrow();
  });
});
