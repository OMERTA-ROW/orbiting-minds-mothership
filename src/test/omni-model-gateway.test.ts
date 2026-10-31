import { describe, expect, it } from "vitest";
import {
  declareAdapter,
  discoverCapabilities,
  emptyModelGatewayStore,
  issuePassport,
  jaxBrokerDecision,
  loadModelGatewayStore,
  modelGatewayReadiness,
  recordDispatch,
  revokePassport,
  routeTask,
  type AgentPassport,
  type ProviderAdapter,
} from "@/lib/omni-model-gateway";

const now = "2026-10-31T13:05:00.000Z";
const adId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ppId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pid = "11111111-1111-4111-8111-111111111111";

function adapter(): ProviderAdapter {
  return declareAdapter(
    {
      name: "Owner Cloud LLM",
      kind: "cloud-api",
      endpoint: "https://api.example.com",
      models: ["model-a"],
      credentialName: "OWNER_LLM_KEY",
    },
    adId,
    now,
  );
}

function passport(): AgentPassport {
  return issuePassport(
    {
      agentName: "Owner Research Agent",
      specialty: "Project inspection and gap analysis",
      adapterId: adId,
      projectId: pid,
      permissions: ["inspect-own-project", "report-gaps"],
      endpoint: "local://agents/research",
      ownerConfirmed: true,
    },
    ppId,
    now,
  );
}

describe("provider adapter registry", () => {
  it("marks cloud APIs without a credential as credential-missing, never connected", () => {
    const a = declareAdapter(
      {
        name: "Keyless API",
        kind: "cloud-api",
        endpoint: "https://api.example.com",
        models: ["m1"],
      },
      adId,
      now,
    );
    expect(a.status).toBe("credential-missing");
    expect(adapter().status).toBe("declared");
    expect(adapter().status).not.toBe("connected");
  });

  it("capability discovery reports declarations and never claims a live probe", () => {
    const caps = discoverCapabilities([adapter()]);
    expect(caps[0].probed).toBe(false);
    expect(caps[0].note).toContain("no live probe");
  });
});

describe("agent passports", () => {
  it("requires owner confirmation and starts with unknown health", () => {
    const p = passport();
    expect(p.health).toBe("unknown");
    expect(p.revoked).toBe(false);
    expect(() =>
      issuePassport(
        {
          agentName: "X",
          specialty: "s",
          adapterId: adId,
          projectId: pid,
          permissions: ["report-gaps"],
          endpoint: "e",
          ownerConfirmed: false,
        },
        ppId,
        now,
      ),
    ).toThrow();
  });

  it("revocation withdraws permissions and blocks routing and dispatch", () => {
    const p = revokePassport(passport(), now);
    expect(p.revoked).toBe(true);
    const r = routeTask(p, adapter(), "inspect-own-project", adId, now);
    expect(r.kind).toBe("blocked");
    expect(() =>
      recordDispatch(
        { passportId: ppId, stage: "inspect", summary: "Trying to inspect after revoke." },
        p,
        adId,
        now,
      ),
    ).toThrow(/revoked/);
  });
});

describe("routing", () => {
  it("plans routes for declared permissions but never executes", () => {
    const r = routeTask(passport(), adapter(), "inspect-own-project", adId, now);
    expect(r.kind).toBe("planned");
    expect(r.executed).toBe(false);
  });

  it("blocks undeclared permissions, unknown adapters and missing credentials", () => {
    const p = passport();
    expect(routeTask(p, adapter(), "draft-code", adId, now).kind).toBe("blocked");
    expect(routeTask(p, undefined, "inspect-own-project", adId, now).kind).toBe("blocked");
    const keyless = declareAdapter(
      { name: "Keyless", kind: "cloud-api", endpoint: "https://x.example.com", models: ["m1"] },
      adId,
      now,
    );
    const r = routeTask(p, keyless, "inspect-own-project", adId, now);
    expect(r.kind).toBe("blocked");
    expect(r.reason).toContain("credential");
  });
});

describe("Jackboy dispatch loop", () => {
  it("records inspect, gap-report, dispatch and outcome stages as simulated", () => {
    const p = passport();
    for (const stage of ["inspect", "gap-report", "dispatch", "outcome"] as const) {
      const rec = recordDispatch(
        { passportId: ppId, stage, summary: `Stage ${stage} recorded for review.` },
        p,
        adId,
        now,
      );
      expect(rec.simulated).toBe(true);
    }
    expect(() =>
      recordDispatch(
        { passportId: ppId, stage: "inspect", summary: "Unknown passport record here." },
        undefined,
        adId,
        now,
      ),
    ).toThrow(/Unknown passport/);
  });
});

describe("JAX broker constraints", () => {
  it("never allows Honeycomb Vault secrets", () => {
    const d = jaxBrokerDecision({
      action: "read",
      targetScope: "honeycomb-vault-secrets",
      hasConsent: true,
      submitsExternalData: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("Honeycomb Vault");
  });

  it("blocks external data submission without consent, allows approved broker work", () => {
    expect(
      jaxBrokerDecision({
        action: "submit",
        targetScope: "partner-api",
        hasConsent: false,
        submitsExternalData: true,
      }).allowed,
    ).toBe(false);
    const ok = jaxBrokerDecision({
      action: "broker",
      targetScope: "partner-api",
      hasConsent: true,
      submitsExternalData: true,
    });
    expect(ok.allowed).toBe(true);
    expect(ok.reason).toContain("runner");
  });
});

describe("readiness and store", () => {
  it("separates real from simulated and names an unrunnable acceptance test", () => {
    const r = modelGatewayReadiness();
    expect(r.state).toBe("Blocked");
    expect(r.real.length).toBeGreaterThan(0);
    expect(r.simulated.length).toBeGreaterThan(0);
    expect(r.credentialPrerequisites.length).toBeGreaterThanOrEqual(3);
    expect(r.acceptanceTest).toContain("not yet runnable");
  });

  it("loads an empty store from missing or corrupt data", () => {
    expect(loadModelGatewayStore(null)).toEqual(emptyModelGatewayStore);
    expect(loadModelGatewayStore("{bad json")).toEqual(emptyModelGatewayStore);
  });
});
