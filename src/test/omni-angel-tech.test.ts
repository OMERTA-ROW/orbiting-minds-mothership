import { describe, expect, it } from "vitest";
import {
  createInsight,
  createProspect,
  draftCampaign,
  invitationBlockers,
  loadAngelTechStore,
  prepareInvitation,
  readinessSummary,
  revokeProspect,
  saveAngelTechStore,
  type ProspectInput,
} from "@/lib/omni-angel-tech";

const now = "2026-10-31T00:00:00.000Z";
const validProspect: ProspectInput = {
  name: "Aster",
  organization: "Public Research Group",
  focus: "Studies accessible AI collaboration patterns for creators.",
  source: "Owner-entered public website note",
  perspective: "Interested in consent-first agent partnerships and transparent research boundaries.",
  compatibility: ["api-documented", "mcp-documented"],
  permissions: ["public-research", "draft-campaign", "prepare-invitation"],
  ownerAuthorization: true,
  humanApproval: "approved",
};

describe("Angel Tech / Sabrina local workspace", () => {
  it("creates a manually recorded prospect without contact", () => {
    const prospect = createProspect(validProspect, "p1", now);
    expect(prospect.status).toBe("identified");
    expect(prospect.consent).toBe("not-requested");
    expect(prospect.delivery).toBe("none");
  });

  it("rejects incomplete prospect records", () => {
    expect(() => createProspect({ ...validProspect, perspective: "short" }, "p1", now)).toThrow();
    expect(() => createProspect({ ...validProspect, source: "" }, "p1", now)).toThrow();
  });

  it("requires explicit owner authorization before invitation preparation", () => {
    const prospect = createProspect({ ...validProspect, ownerAuthorization: false }, "p1", now);
    expect(invitationBlockers(prospect)).toContain("Explicit owner authorization is missing.");
  });

  it("requires human approval before invitation preparation", () => {
    const prospect = createProspect({ ...validProspect, humanApproval: "not-reviewed" }, "p1", now);
    expect(invitationBlockers(prospect)).toContain("Human approval has not approved this prospect.");
  });

  it("requires the prepare-invitation permission", () => {
    const prospect = createProspect({ ...validProspect, permissions: ["public-research"] }, "p1", now);
    expect(invitationBlockers(prospect)).toContain("The prepare-invitation permission is not granted.");
  });

  it("prepares a local draft but never sends it", () => {
    const result = prepareInvitation(createProspect(validProspect, "p1", now), now);
    expect(result.blockers).toEqual([]);
    expect(result.prospect.status).toBe("invitation-drafted");
    expect(result.prospect.delivery).toBe("none");
    expect(result.prospect.invitationDraft).toContain("has not been sent");
  });

  it("does not prepare duplicate drafts", () => {
    const first = prepareInvitation(createProspect(validProspect, "p1", now), now).prospect;
    const second = prepareInvitation(first, now);
    expect(second.blockers).toContain("An invitation draft already exists; delivery remains blocked.");
  });

  it("revocation clears permissions and blocks future drafts", () => {
    const revoked = revokeProspect(createProspect(validProspect, "p1", now), now);
    expect(revoked.status).toBe("revoked");
    expect(revoked.permissions).toEqual([]);
    expect(prepareInvitation(revoked, now).blockers.length).toBeGreaterThan(0);
  });

  it("requires authorization before saving private-context insights", () => {
    expect(() =>
      createInsight(
        {
          audience: "Independent creators",
          trend: "Creators are asking for transparent AI assistance with reviewable drafts.",
          invention: "Angel Tech partnership kit",
          evidence: "Owner note from a private strategy session.",
          confidence: 70,
          usesPrivateContext: true,
          privateAuthorization: false,
        },
        "i1",
        now,
      ),
    ).toThrow(/Private context requires explicit owner authorization/);
  });

  it("drafts a campaign for review without external channels", () => {
    const insight = createInsight(
      {
        audience: "AI research groups",
        trend: "Consent-first agent collaboration is becoming a partnership requirement.",
        invention: "Angel Tech ambassador program",
        evidence: "Owner-entered trend note with a public source reference.",
        confidence: 62,
        usesPrivateContext: false,
        privateAuthorization: false,
      },
      "i1",
      now,
    );
    const draft = draftCampaign(insight, "d1", now);
    expect(draft.channels).toEqual(["owner-review", "omni-checkpoint", "jackboy-context", "jax-approval"]);
    expect(draft.body).toContain("No campaign has been published");
  });

  it("round-trips local storage and rejects corrupt data", () => {
    const prospect = createProspect(validProspect, "p1", now);
    const store = { insights: [], prospects: [prospect], drafts: [] };
    expect(loadAngelTechStore(saveAngelTechStore(store)).prospects[0]?.id).toBe("p1");
    expect(loadAngelTechStore("{bad json")).prospects).toEqual([]);
  });

  it("reports zero connected partnerships until credentials and consent exist", () => {
    const summary = readinessSummary([createProspect(validProspect, "p1", now)]);
    expect(summary.connected).toBe(0);
    expect(summary.pending.join(" ")).toContain("credentials");
  });
});
