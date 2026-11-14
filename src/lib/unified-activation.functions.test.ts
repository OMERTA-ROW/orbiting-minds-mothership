import { afterEach, beforeEach, expect, it, vi } from "vitest";

const jobId = "aaaaaaaa-0000-4000-8000-000000000001";
const projectId = "bbbbbbbb-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(input: unknown) => Promise<unknown>>,
  validators: [] as Array<((input: unknown) => unknown) | undefined>,
  calls: [] as string[],
  rpc: vi.fn(),
  state: vi.fn(),
  permit: vi.fn(),
  signed: vi.fn(),
  owner: vi.fn(),
  approvalMs: 3_600_000,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((input: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (parse: typeof validator) => {
        validator = parse;
        return builder;
      },
      handler: (fn: (input: unknown) => Promise<unknown>) => {
        mocks.handlers.push(fn);
        mocks.validators.push(validator);
        return fn;
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: mocks.owner }));
vi.mock("./unified-activation.server", () => ({ readExecutionState: mocks.state }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("./omni-executor-client", () => ({ signedExecutorRequest: mocks.signed }));
vi.mock("./jackboy-safety.server", () => ({
  recordSafetySnapshot: async () => {
    mocks.calls.push("safety");
  },
}));
vi.mock("./jackboy-link.server", () => ({
  configuredJackboyLink: async () => ({}),
  assertPublicLinkOrigin: vi.fn(),
  JackboyLink: class {
    async safety() {
      return {};
    }
    requestPermit(req: { jobId: string; kind: string; digest: string }) {
      return mocks.permit(req);
    }
    async releasePermit() {
      mocks.calls.push("release");
    }
  },
}));
import "./unified-activation.functions";

function query(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const op of ["select", "lte", "eq", "order", "limit"]) q[op] = () => q;
  q["then"] = (ok: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
  q["single"] = async () => ({ data: Array.isArray(data) ? data[0] : data, error: null });
  return q;
}
async function invoke(data: unknown, fresh = true) {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    step: i + 1,
    status: "approved",
    decided_at: new Date().toISOString(),
    approval_expires_at: i === 6 ? new Date(Date.now() + mocks.approvalMs).toISOString() : null,
  }));
  return mocks.handlers[2]!({
    data: mocks.validators[2]!(data),
    context: {
      userId: projectId,
      claims: {
        amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - (fresh ? 0 : 3600) }],
      },
      supabase: {
        rpc: mocks.rpc,
        from: (table: string) => query(table === "activation_approvals" ? rows : []),
      },
    },
  });
}
const plan = () => ({
  jobId,
  expiresAt: new Date(Date.now() + 50_000).toISOString(),
  commands: [{ argv: ["/usr/bin/true"], timeoutMs: 1000 }],
  confirm: true,
});
beforeEach(() => {
  mocks.calls.length = 0;
  mocks.approvalMs = 3_600_000;
  vi.stubEnv("OMNI_AUTONOMY_REVIEWED_RELEASE", "omni-bounded-plan-1");
  vi.stubEnv("OMNI_EXECUTOR_ORIGIN", "https://executor.fixture.invalid");
  vi.stubEnv("OMNI_EXECUTOR_CONTROL_SECRET", "c".repeat(32));
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "activation_effective" ? true : name === "jackboy_permit_record" ? "issued" : null,
  }));
  mocks.state.mockImplementation(async (operation = "safety") => {
    mocks.calls.push(operation);
    return {
      projectId,
      executorRelease: "omni-bounded-plan-1",
      executorOrigin: "https://executor.fixture.invalid",
      executionReady: true,
      cancellationPending: false,
      armed: operation !== "disarm",
    };
  });
  mocks.permit.mockImplementation(async (req) => {
    mocks.calls.push("permit");
    return {
      ...req,
      id: projectId,
      renewals: 0,
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
      limits: { perCallUsd: 0.5, perTaskUsd: 1, dailyUsd: 5 },
      signatureDigest: "d".repeat(64),
    };
  });
  mocks.signed.mockImplementation(async (_origin, _secret, operation) => {
    mocks.calls.push(operation);
    return {
      jobId,
      outcome: "completed",
      providerCostUsd: 0,
      outputs: [{ exitCode: 0, output: "", exceeded: false, cancelled: false }],
    };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("authorizes the exact hash, records fresh safety and acquires the upstream permit before dispatch", async () => {
  expect(await invoke(plan())).toMatchObject({ jobId, outcome: "completed", providerCostUsd: 0 });
  expect(mocks.calls).toEqual(["safety", "authorize", "safety", "permit", "run", "release"]);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "jackboy_permit_record",
    expect.objectContaining({ _job: jobId, _kind: "autonomous" }),
  );
});
it("stale owner authentication and ineffective upstream activation start nothing", async () => {
  await expect(invoke(plan(), false)).rejects.toThrow("Fresh owner");
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  await expect(invoke(plan())).rejects.toThrow("Current upstream");
  expect(mocks.signed).not.toHaveBeenCalled();
  expect(mocks.permit).not.toHaveBeenCalled();
});
it("UTF-8 byte ceilings, shell commands and expired plans are refused before admission", async () => {
  await expect(
    invoke({
      ...plan(),
      commands: [{ argv: ["/usr/bin/printf", "é".repeat(1100)], timeoutMs: 1000 }],
    }),
  ).rejects.toThrow();
  await expect(
    invoke({ ...plan(), commands: [{ argv: ["/bin/sh"], timeoutMs: 1000 }] }),
  ).rejects.toThrow("Bounded plan");
  await expect(
    invoke({ ...plan(), expiresAt: new Date(Date.now() - 1000).toISOString() }),
  ).rejects.toThrow("Bounded plan");
  expect(mocks.signed).not.toHaveBeenCalled();
  expect(mocks.permit).not.toHaveBeenCalled();
});
it("permit denial disarms and confirms cancellation without dispatch or replay", async () => {
  mocks.permit.mockRejectedValueOnce(new Error("Denied"));
  await expect(invoke(plan())).rejects.toThrow("no automatic retry");
  expect(mocks.calls).toContain("disarm");
  expect(mocks.signed).not.toHaveBeenCalled();
});
it("a plan cannot outlive the current Step 7 approval window", async () => {
  mocks.approvalMs = 10_000;
  await expect(invoke(plan())).rejects.toThrow("Bounded plan");
  expect(mocks.permit).not.toHaveBeenCalled();
  expect(mocks.signed).not.toHaveBeenCalled();
});
it("owner disarm records local revocation before remote reduction and service-only confirmation", async () => {
  await mocks.handlers[1]!({
    data: { operation: "disarm", confirm: true },
    context: {
      userId: projectId,
      claims: {},
      supabase: { rpc: mocks.rpc, from: () => query([{ attempt_id: jobId }]) },
    },
  });
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
    "activation_activation_revoke",
    "activation_rollback_confirmed",
  ]);
  expect(mocks.state).toHaveBeenCalledWith("disarm", {});
  expect(mocks.signed).not.toHaveBeenCalled();
});
