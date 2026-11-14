/**
 * Test-only fake of Jackboy's omni.link/v2 + omni.permit/v1 endpoint, mirroring Jackboy's documented
 * contract (docs/OMNI-PERMIT-CONTRACT.md in Jackboy Dev Control): bootstrap handshake refused while
 * the Kill Switch is on, session-signed `safety` and permit actions, signed permits, nonce-bound
 * response proofs, and a stop that revokes every active permit in the same step.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

const CONTRACT = "omni.link/v2";
const PATH = "/api/public/omni/link";
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const hmac = (k: string, t: string) => createHmac("sha256", k).update(t).digest("hex");

export const FAKE = {
  origin: "https://jackboy.example.com",
  clientId: "omni-mothership-client-01",
  projectId: "4f9a3c1e-2b7d-4e8f-9a1b-3c5d7e9f0a2b",
  bootstrap: "b".repeat(40),
  secret: "k".repeat(48),
  approvalId: "approval-0001",
};

type Permit = {
  id: string;
  jobId: string;
  kind: string;
  digest: string;
  status: "active" | "revoked" | "expired" | "released";
  issuedAt: string;
  expiresAt: string;
  renewals: number;
};

export class FakeJackboy {
  killSwitch = false;
  emergencyStop = false;
  codeEnabled = true;
  authorized = true;
  limits = { perCallUsd: 0.5, perTaskUsd: 1, dailyUsd: 5 };
  tamperPermitSignature = false;
  /** When set, the next request never answers (stale network). */
  hang = false;
  sessions = new Set<string>();
  permits = new Map<string, Permit>();
  nonces = new Set<string>();
  calls: string[] = [];

  /** Owner presses Jackboy's CODE Emergency Stop: every active permit is revoked at once. */
  engageStop() {
    this.emergencyStop = true;
    for (const p of this.permits.values()) if (p.status === "active") p.status = "revoked";
  }
  releaseStop() {
    this.emergencyStop = false;
  }

  private reason(): string | null {
    if (this.killSwitch) return "kill_switch_on";
    if (this.emergencyStop) return "emergency_stop_engaged";
    if (!this.codeEnabled) return "code_disabled";
    if (!this.authorized) return "not_authorized";
    return null;
  }

  fetch = async (url: string, init: RequestInit): Promise<Response> => {
    if (this.hang) return new Promise<Response>((_r, reject) => {
      (init.signal as AbortSignal | undefined)?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
    if (new URL(url).pathname !== PATH) return new Response("{}", { status: 404 });
    const h = new Headers(init.headers);
    const body = String(init.body);
    const token = /^Bearer (.+)$/.exec(h.get("authorization") || "")?.[1] || "";
    const ts = h.get("x-omni-timestamp") || "";
    const nonce = h.get("x-omni-nonce") || "";
    const sig = h.get("x-omni-signature") || "";
    const plain = (status: number, error: string) =>
      new Response(JSON.stringify({ error }), { status });
    if (
      h.get("x-omni-client") !== FAKE.clientId ||
      sig !== hmac(FAKE.secret, `${CONTRACT}\nPOST\n${PATH}\n${ts}\n${nonce}\n${sha256(token)}\n${body}`)
    )
      return plain(401, "authentication_failed");
    if (this.nonces.has(nonce)) return plain(409, "replay");
    this.nonces.add(nonce);
    const input = JSON.parse(body) as Record<string, unknown>;
    if (input["projectId"] !== FAKE.projectId) return plain(403, "project_denied");
    const action = String(input["action"]);
    this.calls.push(action);
    const signed = (status: number, payload: Record<string, unknown>) => {
      const text = JSON.stringify({ contract: CONTRACT, requestNonce: nonce, ...payload });
      return new Response(text, {
        status,
        headers: { "x-omni-proof": hmac(FAKE.secret, `${CONTRACT}\nresponse\n${nonce}\n${status}\n${text}`) },
      });
    };
    if (action === "handshake") {
      if (token !== FAKE.bootstrap) return plain(401, "authentication_failed");
      if (this.killSwitch) return plain(403, "grant_unavailable");
      const session = randomBytes(32).toString("hex");
      this.sessions.add(session);
      return signed(200, {
        sessionToken: session,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        ready: true,
        capabilities: ["jobs.cancel", "jobs.read", "protocol.self-test"],
      });
    }
    if (token === FAKE.bootstrap || !this.sessions.has(token)) return plain(401, "session_expired_or_invalid");
    for (const p of this.permits.values())
      if (p.status === "active" && Date.parse(p.expiresAt) <= Date.now()) p.status = "expired";
    const reason = this.reason();
    if (action === "safety") {
      const now = Date.now();
      return signed(200, {
        http: 200,
        safety: {
          contract: "omni.safety/v1",
          checkedAt: new Date(now).toISOString(),
          validUntil: new Date(now + 30_000).toISOString(),
          killSwitch: this.killSwitch,
          emergencyStop: this.emergencyStop,
          codeEnabled: this.codeEnabled,
          authorization: this.authorized
            ? { id: "c0ffee00-0000-4000-8000-000000000001", expiresAt: new Date(now + 3600_000).toISOString() }
            : null,
          autonomousAllowed: reason === null,
          blockedBy: reason,
          manualDiagnosticsAllowed: !this.killSwitch,
          activePermits: [...this.permits.values()].filter((p) => p.status === "active").length,
        },
      });
    }
    const jobId = String(input["jobId"]);
    const existing = this.permits.get(jobId);
    if (action === "permit.release") {
      if (existing && existing.status === "active") existing.status = "released";
      return signed(200, { http: 200, permit: existing ? { id: existing.id, jobId, status: existing.status } : null });
    }
    // permit.request
    let refusal = reason;
    if (!refusal && existing) {
      if (existing.status === "expired") refusal = "permit_lapsed";
      else if (existing.status !== "active") refusal = "job_closed";
      else if (existing.digest !== input["digest"] || existing.kind !== input["kind"]) refusal = "scope_mismatch";
    }
    if (!refusal && !existing && [...this.permits.values()].some((p) => p.status === "active"))
      refusal = "concurrency_limit";
    if (refusal) {
      if (existing?.status === "active") existing.status = "revoked";
      return signed(403, { http: 403, error: "permit_denied", reason: refusal });
    }
    const now = Date.now();
    const p: Permit = existing ?? {
      id: randomUUID(),
      jobId,
      kind: String(input["kind"]),
      digest: String(input["digest"]),
      status: "active",
      issuedAt: new Date(now).toISOString(),
      expiresAt: "",
      renewals: -1,
    };
    p.renewals += 1;
    p.expiresAt = new Date(now + 60_000).toISOString();
    this.permits.set(jobId, p);
    const fields = [
      "omni.permit/v1", p.id, p.jobId, p.kind, p.digest, FAKE.clientId, FAKE.projectId, FAKE.approvalId, p.expiresAt,
    ].join("\n");
    return signed(200, {
      http: 200,
      permit: {
        contract: "omni.permit/v1",
        id: p.id,
        jobId: p.jobId,
        kind: p.kind,
        digest: p.digest,
        status: p.status,
        issuedAt: p.issuedAt,
        expiresAt: p.expiresAt,
        renewals: p.renewals,
        limits: this.limits,
        clientId: FAKE.clientId,
        projectId: FAKE.projectId,
        approvalId: FAKE.approvalId,
        renewEverySeconds: 20,
        signature: this.tamperPermitSignature ? "0".repeat(64) : hmac(FAKE.secret, fields),
      },
    });
  };
}

export function fakeLinkConfig() {
  return {
    origin: FAKE.origin,
    clientId: FAKE.clientId,
    projectId: FAKE.projectId,
    bootstrap: FAKE.bootstrap,
    secret: FAKE.secret,
    approvalExpiresAt: Date.now() + 6 * 3600_000,
  };
}
