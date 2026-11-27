import { describe, expect, it } from "vitest";
import {
  NEURO_PATHWAYS,
  emptyNeuroProfile,
  neuroChangeInput,
  neuroDestination,
  neuroProfile,
  neuroRegisterInput,
} from "./neuro";
import { assertEyeOwner } from "./razul-eye";
const id = "11111111-1111-4111-8111-111111111111";
describe("Neuro private registry boundaries", () => {
  it.each([
    "omni",
    "code",
    "jackboy",
    "evolution",
    "razul",
    "guardian",
    "jax",
    "hercules",
    "cyberlink",
    "honeycomb",
    "legacy",
    "x-federal",
  ])("keeps distinct pathway %s", (key) => {
    expect(NEURO_PATHWAYS.filter((p) => p === key)).toHaveLength(1);
  });
  it("supports new ecosystem entries without granting permissions", () => {
    expect(
      neuroRegisterInput.parse({ key: "voice-vault", name: "Voice Vault Brain Guild" }).key,
    ).toBe("voice-vault");
    expect(
      neuroRegisterInput.safeParse({
        key: "voice-vault",
        name: "Voice Vault",
        permissions: ["memory:read"],
      }).success,
    ).toBe(false);
  });
  it("refuses autonomy and operational status in profiles", () => {
    expect(
      neuroProfile.safeParse({ ...emptyNeuroProfile, version: "1", autonomy: true }).success,
    ).toBe(false);
    expect(
      neuroProfile.safeParse({
        ...emptyNeuroProfile,
        version: "1",
        integration_status: "connected",
      }).success,
    ).toBe(false);
  });
  it("requires owner confirmation for scope review, approval and rollback", () => {
    for (const action of ["scope_review", "approved", "rollback"]) {
      const data = {
        action,
        componentId: id,
        expected: 0,
        target: 1,
        note: "Owner-reviewed boundary evidence",
      };
      expect(neuroChangeInput.safeParse({ ...data, confirm: false }).success).toBe(false);
      expect(neuroChangeInput.safeParse({ ...data, confirm: true }).success).toBe(true);
    }
  });
  it("rejects credentials in memory notes", () => {
    expect(
      neuroProfile.safeParse({
        ...emptyNeuroProfile,
        version: "1",
        memory: "API_KEY=private-secret",
      }).success,
    ).toBe(false);
  });
  it("links only verified existing destinations, never unconnected project URLs", () => {
    expect(neuroDestination("razul")?.to).toBe("/omni-razul");
    expect(neuroDestination("evolution")?.to).toBe("/projects");
    expect(neuroDestination("omni")?.to).toBe("/omni-terminal");
    expect(neuroDestination("cyberlink")).toBeNull();
    expect(neuroDestination("x-federal")).toBeNull();
  });
  it("preserves verified owner and independent MFA checks", () => {
    expect(() =>
      assertEyeOwner(
        { callerId: id, verifiedUserId: id, emailConfirmed: true, assurance: "aal1" },
        true,
      ),
    ).toThrow();
    expect(() =>
      assertEyeOwner(
        { callerId: id, verifiedUserId: id, emailConfirmed: true, assurance: "aal2" },
        false,
      ),
    ).toThrow();
    expect(() =>
      assertEyeOwner(
        { callerId: id, verifiedUserId: id, emailConfirmed: true, assurance: "aal2" },
        true,
      ),
    ).not.toThrow();
  });
});
