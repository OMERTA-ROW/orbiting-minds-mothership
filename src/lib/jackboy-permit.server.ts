/**
 * OMNI side of Jackboy's execution permit (omni.permit/v1). An autonomous or CODE job may run only
 * while it holds a fresh, signed Jackboy permit: acquire before starting, renew every 20 s, and halt
 * immediately (never resume) when a renewal is refused, fails, times out or the permit expires.
 * Nothing here starts a job; the executor that runs jobs must call `usable()` before every step.
 */
import type { JackboyPermit, PermitRequest } from "./jackboy-link.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const PERMIT_RENEW_MS = 20_000;

export type PermitLink = {
  requestPermit(req: PermitRequest, approvalId: string | null): Promise<JackboyPermit>;
  releasePermit(jobId: string): Promise<void>;
};

export type PermitStore = {
  /** Records the verified permit (database re-checks stops, Step 10 and caps). */
  record(req: PermitRequest, permit: JackboyPermit): Promise<"issued" | "renewed">;
  /** Closes the local permit; lapsed/revoked also stops the job in the database. */
  close(jobId: string, status: "released" | "lapsed" | "revoked", reason: string): Promise<void>;
};

export type HaltReason = string;

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Nonsecret halt reason from a failed request (Jackboy's reason when it gave one). */
export function permitHaltReason(error: unknown): HaltReason {
  const e = error as { stage?: string; code?: string; reason?: string; status?: number };
  if (e?.reason) return e.reason;
  if (e?.code) return e.code;
  if (e?.stage) return `link_${e.stage}`;
  return "permit_unavailable";
}

export class PermitHolder {
  private permit: JackboyPermit | null = null;
  private halted: HaltReason | null = null;
  private renewTimer: unknown = null;
  private deadlineTimer: unknown = null;
  private readonly timers: Timers;
  private readonly now: () => number;

  constructor(
    private readonly req: PermitRequest,
    private readonly deps: {
      link: PermitLink;
      store: PermitStore;
      approvalId: string | null;
      /** Called once, synchronously with the halt: the executor must cancel the job now. */
      onHalt: (reason: HaltReason) => void;
      timers?: Timers;
      now?: () => number;
    },
  ) {
    this.timers = deps.timers ?? realTimers;
    this.now = deps.now ?? Date.now;
  }

  /** True only while an unexpired permit is held and nothing has halted the job. */
  usable(): boolean {
    return (
      this.halted === null && this.permit !== null && Date.parse(this.permit.expiresAt) > this.now()
    );
  }

  haltReason(): HaltReason | null {
    return this.halted;
  }

  /** First permit. Throws (and starts nothing) when Jackboy or the database refuses. */
  async acquire(): Promise<JackboyPermit> {
    if (this.permit || this.halted) throw new Error("This job already requested a permit.");
    const permit = await this.deps.link.requestPermit(this.req, this.deps.approvalId);
    let recorded: "issued" | "renewed" | null = null;
    try {
      recorded = await this.deps.store.record(this.req, permit);
    } catch {
      recorded = null;
    }
    if (recorded !== "issued") {
      // Jackboy issued it but Mothership refused or failed to record it: give it back, start nothing.
      this.halted = "permit_not_recorded";
      await this.deps.link.releasePermit(this.req.jobId).catch(() => {});
      throw new Error("Permit was not recorded as a new job.");
    }
    if (this.halted) throw new Error("This job was halted while its permit was being recorded.");
    this.accept(permit);
    return permit;
  }

  /** One renewal; any failure halts the job permanently. */
  async renew(): Promise<boolean> {
    if (this.halted || !this.permit) return false;
    if (!this.usable()) {
      await this.halt("permit_lapsed", "lapsed");
      return false;
    }
    try {
      const permit = await this.deps.link.requestPermit(this.req, this.deps.approvalId);
      if (permit.id !== this.permit.id) throw new Error("permit_replaced");
      if (this.halted) return false;
      await this.deps.store.record(this.req, permit);
      // A halt (deadline, release) may have happened while recording: never re-arm a halted job.
      if (this.halted) return false;
      this.accept(permit);
      return true;
    } catch (error) {
      await this.halt(permitHaltReason(error), "revoked");
      return false;
    }
  }

  /** The job finished: release at Jackboy and locally. Never throws past a local close. */
  async release(): Promise<void> {
    this.clearTimers();
    if (this.halted) return;
    this.halted = "released_by_omni";
    await this.deps.link.releasePermit(this.req.jobId).catch(() => {});
    await this.deps.store.close(this.req.jobId, "released", "released_by_omni");
  }

  private accept(permit: JackboyPermit) {
    this.permit = permit;
    this.clearTimers();
    const ttl = Date.parse(permit.expiresAt) - this.now();
    if (ttl > 5_000)
      this.renewTimer = this.timers.set(
        () => void this.renew(),
        Math.min(PERMIT_RENEW_MS, ttl - 5_000),
      );
    // Hard deadline: even if the renewal call hangs, the job halts when the permit expires.
    this.deadlineTimer = this.timers.set(
      () => {
        if (!this.halted && !this.usable()) void this.halt("permit_lapsed", "lapsed");
      },
      Math.max(0, ttl),
    );
  }

  private clearTimers() {
    if (this.renewTimer !== null) this.timers.clear(this.renewTimer);
    if (this.deadlineTimer !== null) this.timers.clear(this.deadlineTimer);
    this.renewTimer = this.deadlineTimer = null;
  }

  private async halt(reason: HaltReason, status: "lapsed" | "revoked") {
    if (this.halted) return;
    this.halted = reason;
    this.clearTimers();
    // Cancel first; recording happens after, and its failure never un-halts the job.
    this.deps.onHalt(reason);
    await this.deps.store.close(this.req.jobId, status, reason).catch(() => {});
    await this.deps.link.releasePermit(this.req.jobId).catch(() => {});
  }
}

/** Database-backed store for the permit mirror (service role only). */
export function databasePermitStore(admin: Pick<SupabaseClient<Database>, "rpc">): PermitStore {
  return {
    async record(req, permit) {
      const { data, error } = await admin.rpc("jackboy_permit_record", {
        _job: req.jobId,
        _kind: req.kind,
        _digest: req.digest,
        _permit_id: permit.id,
        _expires_at: permit.expiresAt,
        _renewals: permit.renewals,
        _per_call: permit.limits.perCallUsd,
        _per_task: permit.limits.perTaskUsd,
        _daily: permit.limits.dailyUsd,
        _signature_digest: permit.signatureDigest,
      });
      if (error || (data !== "issued" && data !== "renewed"))
        throw new Error("permit_not_recorded");
      return data;
    },
    async close(jobId, status, reason) {
      const { error } = await admin.rpc("jackboy_permit_close", {
        _job: jobId,
        _status: status,
        _reason: reason.slice(0, 60),
      });
      if (error) throw new Error("permit_not_closed");
    },
  };
}
