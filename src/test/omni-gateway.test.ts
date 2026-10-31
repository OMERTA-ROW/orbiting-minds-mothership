import { describe, expect, it } from "vitest";
import {
  createDelegation,
  guardianDecide,
  recordLearning,
  addFeedback,
  canJobTransition,
  emptyGatewayStore,
  enrollProject,
  forbiddenGoalHints,
  gatewayReadiness,
  loadGatewayStore,
  receiveJob,
  revokeProject,
  transitionJob,
  type EnrolledProject,
} from "@/lib/omni-gateway";

const now = "2026-10-31T12:00:00.000Z";
const pid = "11111111-1111-4111-8111-111111111111";
const jid = "22222222-2222-4222-8222-222222222222";

function enrolled(): EnrolledProject {
  return enrollProject(
    {
      name: "Jackboy",
      origin: "private repository (label only)",
      scopes: ["read-source", "propose-patch", "run-sandbox-tests"],
      ownerConfirmed: true,
    },
    pid,
    now,
  );
}

describe("project enrollment", () => {
  it("requires owner confirmation and at least one scope", () => {
    expect(() =>
      enrollProject(
        { name: "Jackboy", origin: "repo", scopes: ["read-source"], ownerConfirmed: false },
        pid,
        now,
      ),
    ).toThrow();
    expect(() =>
      enrollProject(
        { name: "Jackboy", origin: "repo", scopes: [], ownerConfirmed: true },
        pid,
        now,
      ),
    ).toThrow();
  });

  it("enrolls with scopes and records history", () => {
    const p = enrolled();
    expect(p.status).toBe("enrolled");
    expect(p.scopes).toContain("propose-patch");
    expect(p.history[0]).toContain("enrolled");
  });

  it("revocation withdraws scopes and blocks new jobs", () => {
    const p = revokeProject(enrolled(), now);
    expect(p.status).toBe("revoked");
    expect(() =>
      receiveJob(
        {
          projectId: pid,
          goal: "Add a small helper function for formatting dates",
          jackboyApproved: true,
          approvalNote: "Approved in review",
          noUntrustedCode: true,
        },
        p,
        jid,
        now,
      ),
    ).toThrow(/revoked/);
  });
});

describe("job intake", () => {
  it("requires Jackboy approval and the no-untrusted-code attestation", () => {
    const p = enrolled();
    const base = {
      projectId: pid,
      goal: "Add a small helper function for formatting dates",
      approvalNote: "Approved in review",
    };
    expect(() =>
      receiveJob({ ...base, jackboyApproved: false, noUntrustedCode: true }, p, jid, now),
    ).toThrow();
    expect(() =>
      receiveJob({ ...base, jackboyApproved: true, noUntrustedCode: false }, p, jid, now),
    ).toThrow();
  });

  it("blocks immediately because no runner is connected, with no patch or evidence", () => {
    const job = receiveJob(
      {
        projectId: pid,
        goal: "Add a small helper function for formatting dates",
        jackboyApproved: true,
        approvalNote: "Approved in review",
        noUntrustedCode: true,
      },
      enrolled(),
      jid,
      now,
    );
    expect(job.state).toBe("blocked");
    expect(job.patchProposal).toBeNull();
    expect(job.testEvidence).toBeNull();
    expect(job.log.at(-1)?.note).toContain("not connected");
  });

  it("flags goals implying merge, deploy, secrets or destructive actions", () => {
    expect(forbiddenGoalHints("merge the patch and deploy to production")).toEqual([
      "merge/push",
      "deploy/release",
    ]);
    expect(forbiddenGoalHints("rotate the api key then delete old logs")).toEqual([
      "secrets",
      "destructive",
    ]);
    expect(forbiddenGoalHints("add a date formatting helper")).toEqual([]);
  });

  it("rejects jobs for a different project id", () => {
    expect(() =>
      receiveJob(
        {
          projectId: "33333333-3333-4333-8333-333333333333",
          goal: "Add a small helper function for formatting dates",
          jackboyApproved: true,
          approvalNote: "Approved in review",
          noUntrustedCode: true,
        },
        enrolled(),
        jid,
        now,
      ),
    ).toThrow(/does not match/);
  });
});

describe("job state machine", () => {
  it("never allows merge/deploy states and keeps terminal states final", () => {
    expect(canJobTransition("approved", "in-review")).toBe(false);
    expect(canJobTransition("cancelled", "received")).toBe(false);
    expect(canJobTransition("blocked", "cancelled")).toBe(true);
    expect(canJobTransition("tested", "in-review")).toBe(true);
    expect(() => transitionJob("blocked", "approved")).toThrow();
  });
});

describe("feedback channels", () => {
  it("records AngelTech quality and DemonTech security notes as advisory only", () => {
    const q = addFeedback(
      { jobId: jid, channel: "angeltech-quality", note: "Naming is inconsistent with the module." },
      "44444444-4444-4444-8444-444444444444",
      now,
    );
    const s = addFeedback(
      { jobId: jid, channel: "demontech-security", note: "Patch touches an auth-adjacent path." },
      "55555555-5555-4555-8555-555555555555",
      now,
    );
    expect(q.advisory).toBe(true);
    expect(s.channel).toBe("demontech-security");
    expect(() =>
      addFeedback({ jobId: jid, channel: "unknown", note: "Not a real channel here." }, jid, now),
    ).toThrow();
  });
});

describe("readiness and store", () => {
  it("always reports blocked with concrete prerequisites", () => {
    const r = gatewayReadiness();
    expect(r.state).toBe("Blocked");
    expect(r.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it("loads an empty store from missing or corrupt data", () => {
    expect(loadGatewayStore(null)).toEqual(emptyGatewayStore);
    expect(loadGatewayStore("{bad json")).toEqual(emptyGatewayStore);
  });
});

describe("Guardian policy gate", () => {
  it("defaults to deny when Guardian is unavailable and logs the decision", () => {
    const d = guardianDecide({
      id: "66666666-6666-4666-8666-666666666666",
      at: now,
      jobId: jid,
      action: "generate-patch",
      guardianAvailable: false,
    });
    expect(d.outcome).toBe("deny");
    expect(d.basis).toBe("default-deny-unavailable");
    expect(d.note).toContain("No simulated approval");
  });

  it("merge/deploy need human approval first, then allow only via that approval", () => {
    const base = { id: jid, at: now, jobId: jid, guardianAvailable: true };
    expect(guardianDecide({ ...base, action: "merge" }).outcome).toBe("deny");
    const approved = guardianDecide({ ...base, action: "merge", humanApproved: true });
    expect(approved.outcome).toBe("allow");
    expect(approved.basis).toBe("human-approval");
  });

  it("merge/deploy can never be delegated, even by owner policy", () => {
    expect(() =>
      createDelegation({ action: "merge", note: "auto-merge main", at: now }),
    ).toThrow(/cannot be delegated/);
    expect(() => createDelegation({ action: "deploy", note: "auto-deploy", at: now })).toThrow();
  });

  it("allows scoped owner delegation for non-merge actions when Guardian is available", () => {
    const delegation = createDelegation({
      action: "run-sandbox-tests",
      note: "Owner delegates sandbox test runs for Jackboy project",
      at: now,
    });
    expect(delegation.grantedBy).toBe("owner");
    const d = guardianDecide({
      id: jid,
      at: now,
      jobId: jid,
      action: "run-sandbox-tests",
      guardianAvailable: true,
      delegations: [delegation],
    });
    expect(d.outcome).toBe("allow");
    expect(d.basis).toBe("owner-policy");
  });
});

describe("Jackboy learning loop", () => {
  it("records human review outcomes as local lessons, never retraining", () => {
    const rec = recordLearning(
      { jobId: jid, outcome: "changes-requested", lesson: "Prefer named exports in this module." },
      "77777777-7777-4777-8777-777777777777",
      now,
    );
    expect(rec.source).toBe("human-review");
    expect(rec.retraining).toBe(false);
    expect(() =>
      recordLearning({ jobId: jid, outcome: "auto", lesson: "Invalid outcome value here." }, jid, now),
    ).toThrow();
  });

  it("store round-trips guardian decisions, delegations and learning records", () => {
    const store = loadGatewayStore(
      JSON.stringify({
        ...emptyGatewayStore,
        guardianDecisions: [{ id: "1" }],
        delegations: [{ action: "generate-patch" }],
        learning: [{ id: "2" }],
      }),
    );
    expect(store.guardianDecisions).toHaveLength(1);
    expect(store.delegations).toHaveLength(1);
    expect(store.learning).toHaveLength(1);
  });
});
