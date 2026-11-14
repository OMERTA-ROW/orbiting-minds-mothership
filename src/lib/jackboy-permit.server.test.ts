import { describe, expect, it, vi } from "vitest";
import { JackboyLink, OMNI_PERMIT_LIMITS } from "./jackboy-link.server";
import { PermitHolder, type PermitStore } from "./jackboy-permit.server";
import { recordSafetySnapshot } from "./jackboy-safety.server";
import { FAKE, FakeJackboy, fakeLinkConfig } from "@/test/support/fake-jackboy";

const JOB = "9e8d7c6b-5a49-4382-9172-635445362718";
const REQ = { jobId: JOB, kind: "code" as const, digest: "d".repeat(64), estimateUsd: 1 };

function manualTimers() {
  const pending: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  return {
    pending,
    timers: {
      set: (fn: () => void, ms: number) => {
        const t = { fn, ms, cleared: false };
        pending.push(t);
        return t;
      },
      clear: (h: unknown) => {
        (h as { cleared: boolean }).cleared = true;
      },
    },
    /** Fires the live renewal timer (the shorter of the two). */
    renewNow() {
      const live = pending.filter((t) => !t.cleared).sort((a, b) => a.ms - b.ms)[0];
      live?.fn();
    },
  };
}

function setup(fake = new FakeJackboy()) {
  const link = new JackboyLink(fakeLinkConfig(), async () => {}, {
    fetch: fake.fetch,
    timeoutMs: 200,
  });
  const store: PermitStore & { record: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } =
    {
      record: vi.fn(async (_req, p) => (p.renewals === 0 ? "issued" : "renewed")),
      close: vi.fn(async () => {}),
    };
  const onHalt = vi.fn();
  const t = manualTimers();
  const holder = new PermitHolder(REQ, {
    link,
    store,
    approvalId: FAKE.approvalId,
    onHalt,
    timers: t.timers,
  });
  return { fake, link, store, onHalt, t, holder };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Jackboy permit (omni.permit/v1) and cross-system Emergency Stop", () => {
  it("acquires a signed, capped permit and renews it with the same scope", async () => {
    const { holder, store, t, fake } = setup();
    const p = await holder.acquire();
    expect(p.limits.perCallUsd).toBeLessThanOrEqual(OMNI_PERMIT_LIMITS.perCallUsd);
    expect(holder.usable()).toBe(true);
    expect(store.record).toHaveBeenCalledTimes(1);
    t.renewNow();
    await vi.waitFor(() => expect(store.record).toHaveBeenCalledTimes(2));
    expect(fake.permits.get(JOB)?.renewals).toBe(1);
    expect(holder.usable()).toBe(true);
  });

  it("END TO END: Jackboy's CODE Emergency Stop halts OMNI's job at the next renewal and is recorded as engaged", async () => {
    const { holder, store, t, fake, link, onHalt } = setup();
    await holder.acquire();
    fake.engageStop(); // owner presses the stop in Jackboy
    t.renewNow();
    await vi.waitFor(() => expect(onHalt).toHaveBeenCalledWith("emergency_stop_engaged"));
    expect(holder.usable()).toBe(false);
    expect(store.close).toHaveBeenCalledWith(JOB, "revoked", "emergency_stop_engaged");
    // The next safety read records the stop; Mothership's database halts everything on it.
    const rpc = vi.fn(async () => ({ data: "engaged", error: null }));
    await recordSafetySnapshot({ rpc } as never, await link.safety());
    expect(rpc).toHaveBeenCalledWith(
      "jackboy_safety_record_v2",
      expect.objectContaining({
        _source: "poll",
        _code_stop: true,
        _autonomous_allowed: false,
        _manual_allowed: true,
      }),
    );
    // Releasing the stop in Jackboy never resumes the halted job.
    fake.releaseStop();
    expect(await holder.renew()).toBe(false);
    expect(holder.usable()).toBe(false);
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it("halts on a stale network (renewal never answers) and on the Kill Switch", async () => {
    const a = setup();
    await a.holder.acquire();
    a.fake.hang = true;
    a.t.renewNow();
    await vi.waitFor(() => expect(a.onHalt).toHaveBeenCalledWith("link_timeout"));
    const b = setup();
    await b.holder.acquire();
    b.fake.killSwitch = true;
    b.t.renewNow();
    await vi.waitFor(() => expect(b.onHalt).toHaveBeenCalledWith("kill_switch_on"));
  });

  it("halts at the permit's own deadline even if no renewal ever completes", async () => {
    const { holder, onHalt, store } = setup();
    const link = {
      requestPermit: vi.fn(async () => ({
        ...(await setup().link.requestPermit(REQ, FAKE.approvalId)),
        expiresAt: new Date(Date.now() + 30).toISOString(),
      })),
      releasePermit: vi.fn(async () => {}),
    };
    const t = manualTimers();
    const h = new PermitHolder(REQ, { link, store, approvalId: null, onHalt, timers: t.timers });
    await h.acquire();
    expect(t.pending.filter((x) => !x.cleared)).toHaveLength(1);
    expect(t.pending.some((x) => x.ms === 0)).toBe(false); // Hard-bounded plans cannot extend their final deadline.
    await new Promise((r) => setTimeout(r, 40));
    t.pending.filter((x) => !x.cleared).forEach((x) => x.fn());
    await flush();
    expect(onHalt).toHaveBeenCalledWith("permit_lapsed");
    expect(h.usable()).toBe(false);
    expect(holder.usable()).toBe(false); // never acquired
  });

  it("refuses a tampered permit signature, over-cap limits and a second concurrent job without recording", async () => {
    const tampered = new FakeJackboy();
    tampered.tamperPermitSignature = true;
    const a = setup(tampered);
    await expect(a.holder.acquire()).rejects.toMatchObject({ stage: "proof" });
    expect(a.store.record).not.toHaveBeenCalled();
    const rich = new FakeJackboy();
    rich.limits = { perCallUsd: 2, perTaskUsd: 1, dailyUsd: 5 };
    const b = setup(rich);
    await expect(b.holder.acquire()).rejects.toMatchObject({ stage: "contract" });
    expect(b.store.record).not.toHaveBeenCalled();
    const c = setup();
    await c.holder.acquire();
    const other = { ...REQ, jobId: "1e8d7c6b-5a49-4382-9172-635445362718" };
    await expect(c.link.requestPermit(other, FAKE.approvalId)).rejects.toMatchObject({
      code: "permit_denied",
      reason: "concurrency_limit",
    });
  });

  it("starts nothing when Jackboy refuses the first permit (stop engaged)", async () => {
    const fake = new FakeJackboy();
    fake.engageStop();
    const { holder, store, onHalt } = setup(fake);
    await expect(holder.acquire()).rejects.toMatchObject({ reason: "emergency_stop_engaged" });
    expect(store.record).not.toHaveBeenCalled();
    expect(onHalt).not.toHaveBeenCalled();
    expect(holder.usable()).toBe(false);
  });

  it("gives an issued permit back and starts nothing when Mothership cannot record it", async () => {
    const { holder, store, fake, onHalt } = setup();
    store.record.mockRejectedValueOnce(new Error("permit_not_recorded"));
    await expect(holder.acquire()).rejects.toThrow(/not recorded/);
    expect(fake.permits.get(JOB)?.status).toBe("released");
    expect(holder.usable()).toBe(false);
    expect(onHalt).not.toHaveBeenCalled();
  });

  it("labels a refusal reason only when Jackboy signed the refusal", async () => {
    const fake = new FakeJackboy();
    fake.engageStop();
    const inner = fake.fetch;
    fake.fetch = async (url, init) => {
      const res = await inner(url, init);
      if (res.status !== 403) return res;
      return new Response(await res.text(), { status: 403 }); // proof stripped
    };
    const { holder } = setup(fake);
    const err = (await holder.acquire().catch((e: unknown) => e)) as {
      reason?: string;
      signed?: boolean;
      code?: string;
    };
    expect(err.code).toBe("permit_denied");
    expect(err.signed).toBe(false);
    expect(err.reason).toBeUndefined();
  });

  it("releases the permit at Jackboy and locally when the job ends", async () => {
    const { holder, store, fake } = setup();
    await holder.acquire();
    await holder.release();
    expect(fake.permits.get(JOB)?.status).toBe("released");
    expect(store.close).toHaveBeenCalledWith(JOB, "released", "released_by_omni");
    expect(holder.usable()).toBe(false);
  });
});
