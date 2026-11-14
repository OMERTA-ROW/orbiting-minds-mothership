import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  decide: vi.fn(),
  check: vi.fn(),
  selfTest: vi.fn(),
  liveLink: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (name: string) => mocks[name as keyof typeof mocks],
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: { email: "owner@fixture.invalid", created_at: "2026-11-01T19:10:09Z" } },
      }),
      mfa: {
        listFactors: async () => ({ data: { totp: [{ id: "f1", status: "verified" }] } }),
        challengeAndVerify: vi.fn(),
      },
    },
  },
}));
vi.mock("@/lib/activation-approvals.functions", () => ({
  listActivationApprovals: "list",
  decideActivationApproval: "decide",
  runActivationApprovalCheck: "check",
  runStep8SelfTest: "selfTest",
  checkLiveLinkConnection: "liveLink",
}));

vi.mock("@/components/omnibridge/ApprovalBuildBanner", () => ({
  ApprovalBuildBanner: () => null,
}));

import { ActivationApprovals } from "@/components/omnibridge/ActivationApprovals";
import { codeStatus, liveLinkStatus } from "@/lib/live-link";
import { safetyView } from "@/lib/jackboy-safety";

const owner = "11111111-1111-4111-8111-111111111111";

function snapshot(
  mode: "runner_only" | "unknown" | "inconsistent",
  overrides: {
    approvedThrough?: number;
    failedStep?: number;
    checks?: unknown[];
    checksStore?: "ready" | "missing" | "unreadable";
    securityResetAt?: string | null;
    audit?: unknown[];
    mfaAgeSeconds?: number | null;
    liveReadiness?: Array<{ key: string; label: string; ok: boolean; detail: string }>;
    step7ExpiresAt?: string;
  } = {},
) {
  const rows = Array.from({ length: 10 }, (_, index) => {
    const step = index + 1;
    const status = step <= (overrides.approvedThrough ?? 0) ? "approved" : "pending";
    return {
      step,
      status: step === overrides.failedStep ? "failed" : status,
      approver_id: status === "approved" ? owner : null,
      decided_at: status === "approved" ? "2026-11-12T12:00:00.000Z" : null,
      note: "",
      approval_expires_at:
        step === 7 && status === "approved"
          ? (overrides.step7ExpiresAt ?? "2026-11-13T12:00:00.000Z")
          : null,
      spend_confirmations: null,
      revision: 1,
    };
  });
  return {
    viewerId: owner,
    rows,
    audit: overrides.audit ?? [],
    checks: overrides.checks ?? [],
    checksStore: overrides.checksStore ?? "ready",
    securityResetAt: overrides.securityResetAt ?? null,
    settings: [],
    deployment: {
      mode,
      jackboyOriginConfigured: mode === "runner_only",
      runnerOriginConfigured: mode === "runner_only",
      attention: [],
    },
    selfTest: null,
    liveLink: liveLinkStatus({
      rows: rows as never,
      readiness: overrides.liveReadiness ?? [],
      now: Date.now(),
      lastConnectedAt: null,
      lastAttemptAt: null,
    }),
    safety: safetyView(null, Date.now()),
    code: codeStatus(rows as never, Date.now(), safetyView(null, Date.now())),
    sandbox: { configured: false, enabled: false },
    mfaAgeSeconds: overrides.mfaAgeSeconds === undefined ? 0 : overrides.mfaAgeSeconds,
  };
}

const passingCheck = {
  step: 4,
  status: "passed",
  evidenceVersion: 2,
  checkedAt: "2026-11-12T12:00:00.000Z",
  summary: "Signed HTTPS configuration exchange verified.",
  details: [
    { label: "Jackboy origin", status: "passed", detail: "Jackboy HTTPS origin verified." },
  ],
};

beforeEach(() => {
  mocks.list.mockReset();
  mocks.decide.mockReset();
  mocks.check.mockReset();
});

describe("Activation Approvals deployment checks", () => {
  it("shows runner-only ownership and checks Jackboy separately from Railway", async () => {
    mocks.list.mockResolvedValue(snapshot("runner_only", { approvedThrough: 3 }));
    mocks.check.mockResolvedValue({ ok: true, check: passingCheck });
    render(<ActivationApprovals />);

    expect(await screen.findByText(/Jackboy on Lovable owns the database/)).toBeInTheDocument();
    expect(screen.getByText(/Railway runs the self-test only/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Signed configuration exchange with Jackboy on Lovable; Railway runner is a separate endpoint/,
      ),
    ).toBeInTheDocument();
    const step = screen
      .getByRole("heading", { name: /4\. Jackboy HTTPS link verified/ })
      .closest("li");
    fireEvent.click(within(step!).getByRole("button", { name: "Run check" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith({ data: { step: 4 } }));
  });

  it("lets a failed Step 2 be rerun and refreshed to a passing result", async () => {
    const failed = {
      step: 2,
      status: "failed",
      evidenceVersion: 2,
      checkedAt: "2026-11-12T12:00:00.000Z",
      summary: "Runner configuration needs attention.",
      details: [
        {
          label: "OMNI_LINK_NODE_RUNNER_ENABLED",
          status: "failed",
          detail: "Must be exactly true in Railway service variables.",
        },
      ],
    };
    const passed = {
      step: 2,
      status: "passed",
      evidenceVersion: 2,
      checkedAt: "2026-11-12T12:05:00.000Z",
      summary: "Existing Railway runner configuration verified through Jackboy.",
      details: [{ label: "OMNI_LINK_NODE_RUNNER_ENABLED", status: "passed", detail: "Enabled." }],
    };
    const freshPass = { ...passed, checkedAt: new Date().toISOString() };
    mocks.list
      .mockResolvedValueOnce(
        snapshot("runner_only", { approvedThrough: 1, failedStep: 2, checks: [failed] }),
      )
      .mockResolvedValueOnce(snapshot("runner_only", { approvedThrough: 1, checks: [freshPass] }));
    mocks.check.mockResolvedValue({ ok: true, check: freshPass, approvalNeeded: true });
    render(<ActivationApprovals />);

    expect(await screen.findByText(/Runner configuration needs attention/)).toBeInTheDocument();
    const step = screen
      .getByRole("heading", { name: /2\. Railway runner settings verified/ })
      .closest("li");
    fireEvent.click(within(step!).getByRole("button", { name: "Retry check" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith({ data: { step: 2 } }));
    expect(await within(step!).findByRole("status")).toHaveTextContent(
      /Existing Railway runner configuration verified through Jackboy\. Not approved yet/,
    );
    // A pass is never approved for the owner.
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(within(step!).getByText("Pending")).toBeInTheDocument();
  });

  it("keeps an unknown deployment unresolved and names the exact settings to confirm", async () => {
    mocks.list.mockResolvedValue(snapshot("unknown", { approvedThrough: 1 }));
    mocks.check.mockResolvedValue({
      ok: true,
      check: {
        ...passingCheck,
        step: 2,
        status: "needs_attention",
        summary: "Evolution cannot verify a ready runner-only configuration.",
      },
    });
    render(<ActivationApprovals />);

    expect(await screen.findByText(/Deployment setup is unknown/)).toBeInTheDocument();
    expect(screen.getByText(/OMNI_LINK_RUNNER_MODE=true/)).toBeInTheDocument();
    expect(screen.getByText(/OMNI_LINK_NODE_RUNNER_ENABLED=true/)).toBeInTheDocument();
    expect(screen.getAllByText(/OMNI_LINK_REMOTE_RUNNER_SECRET/)).not.toHaveLength(0);
    expect(
      screen.getByText(/Do not repeat completed setup or copy its secret here/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/SUPABASE_(URL|SERVICE_ROLE_KEY)/)).not.toBeInTheDocument();
    const step = screen
      .getByRole("heading", { name: /2\. Railway runner settings verified/ })
      .closest("li");
    fireEvent.click(within(step!).getByRole("button", { name: "Run check" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith({ data: { step: 2 } }));
  });
});

describe("Activation Approvals access and next step", () => {
  it("tells a returning owner without a fresh sign-in code exactly what to do, without showing records", async () => {
    mocks.list.mockResolvedValue({ denied: true, reason: "needs_code" });
    render(<ActivationApprovals />);
    expect(
      await screen.findByRole("heading", { name: "Enter your two-step code" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "6-digit authenticator code" })).toBeInTheDocument();
    expect(await screen.findByText(/owner@fixture.invalid · account created/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve|Run check|Revoke/ })).toBeNull();
  });

  it("says plainly when the signed-in account is not the owner", async () => {
    mocks.list.mockResolvedValue({ denied: true, reason: "not_owner" });
    render(<ActivationApprovals />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not with the owner account/);
    expect(screen.getByRole("link", { name: "Owner sign in" })).toBeInTheDocument();
  });

  it("shows records and the database-update blocker when the check store is missing", async () => {
    mocks.list.mockResolvedValue(
      snapshot("runner_only", { approvedThrough: 1, checksStore: "missing" }),
    );
    render(<ActivationApprovals />);
    const next = await screen.findByRole("region", { name: "Next step" });
    expect(next).toHaveTextContent(/Step 2 is waiting on a database update/);
    expect(next).toHaveTextContent(/0051/);
    expect(screen.getByRole("alert")).toHaveTextContent(/check store/);
    const step = screen.getByRole("heading", { name: /2\. Railway runner settings verified/ });
    expect(within(step.closest("li")!).getByRole("button", { name: "Run check" })).toBeDisabled();
  });

  it("marks approvals from before a security reset as needing fresh approval", async () => {
    mocks.list.mockResolvedValue(
      snapshot("runner_only", {
        approvedThrough: 3,
        securityResetAt: "2026-11-13T16:20:51.000Z",
      }),
    );
    mocks.check.mockResolvedValue({ ok: true, check: passingCheck });
    render(<ActivationApprovals />);
    const next = await screen.findByRole("region", { name: "Next step" });
    expect(next).toHaveTextContent(/Run check for step 1/);
    expect(screen.getAllByText("Needs fresh approval")).toHaveLength(3);
    expect(screen.getByText(/0 of 10 approved/)).toBeInTheDocument();
    const step3 = screen.getByRole("heading", { name: /3\. Node 26 pinned/ }).closest("li")!;
    expect(within(step3).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(step3).getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    fireEvent.click(within(next).getByRole("button", { name: "Run check for step 1" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith({ data: { step: 1 } }));
  });

  it("labels a revoked step as revoked and keeps ordinary approvals", async () => {
    mocks.list.mockResolvedValue(
      snapshot("runner_only", {
        approvedThrough: 1,
        audit: [
          {
            id: "a1",
            actor_id: owner,
            action: "revoke",
            record_id: "2",
            occurred_at: "2026-11-12T13:00:00Z",
          },
        ],
      }),
    );
    render(<ActivationApprovals />);
    const step2 = (await screen.findByRole("heading", { name: /2\. Railway/ })).closest("li")!;
    expect(within(step2).getByText("Revoked")).toBeInTheDocument();
    const step1 = screen.getByRole("heading", { name: /1\. Mothership link/ }).closest("li")!;
    expect(within(step1).getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText(/1 of 10 approved/)).toBeInTheDocument();
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const stepItem = (n: number) =>
  screen.getByRole("heading", { name: new RegExp(`^${n}\\. `) }).closest("li")!;
const audit = (id: string, action: string, step: number, at: string) => ({
  id,
  actor_id: owner,
  action,
  record_id: String(step),
  occurred_at: at,
});

describe("Activation Approvals workflow", () => {
  it("shows an approved step as closed with disabled Run check/Approve and its own audit history, and focuses the next step", async () => {
    mocks.list.mockResolvedValue(
      snapshot("runner_only", {
        approvedThrough: 1,
        audit: [
          audit("a2", "approve", 1, "2026-11-13T19:51:01Z"),
          audit("a1", "check_passed", 1, "2026-11-13T19:51:00Z"),
        ],
      }),
    );
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^1\. / });
    const step1 = stepItem(1);
    expect(within(step1).getByText("Approved")).toBeInTheDocument();
    expect(within(step1).getByRole("button", { name: "Run check" })).toBeDisabled();
    expect(within(step1).getByRole("button", { name: "Approve" })).toBeDisabled();
    const toggle = within(step1).getByRole("button", { name: "Show details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(step1).queryByRole("region", { name: "Step 1 audit history" })).toBeNull();
    fireEvent.click(toggle);
    const history = within(step1).getByRole("region", { name: "Step 1 audit history" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
    expect(history).toHaveTextContent(/Check passed/);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^2\. / })),
    );
    expect(stepItem(2)).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("progressbar", { name: "Approved steps" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
  });

  it("explains failed signed Step 2 evidence, offers a safe retry and keeps steps 3–10 locked", async () => {
    const evidence = {
      step: 2,
      status: "needs_attention",
      evidenceVersion: 2,
      checkedAt: "2026-11-13T19:51:53Z",
      summary: "Railway runner configuration is not yet attested.",
      details: [
        { label: "Jackboy reply", status: "needs_attention", detail: "HTTP 503 · link_disabled" },
        {
          label: "Likely cause",
          status: "needs_attention",
          detail: "Jackboy's published site treated this as an ordinary link request.",
        },
      ],
    };
    mocks.list.mockResolvedValue(
      snapshot("runner_only", { approvedThrough: 1, failedStep: 2, checks: [evidence] }),
    );
    render(<ActivationApprovals />);
    const result = await screen.findByRole("region", { name: "Step 2 check result" });
    expect(result).toHaveTextContent("Jackboy reply (Needs attention): HTTP 503 · link_disabled");
    const step2 = stepItem(2);
    expect(within(step2).getByText("Failed")).toBeInTheDocument();
    expect(within(step2).getByRole("button", { name: "Retry check" })).toBeEnabled();
    expect(within(step2).getByRole("button", { name: "Approve" })).toBeDisabled();
    for (let n = 3; n <= 10; n++) {
      expect(within(stepItem(n)).getByText("Locked — waiting on step 2.")).toBeInTheDocument();
      expect(within(stepItem(n)).queryByRole("button", { name: /Run check|Approve/ })).toBeNull();
    }
  });

  it("ignores a second click while a check is running", async () => {
    const run = deferred<unknown>();
    mocks.list.mockResolvedValue(snapshot("runner_only", { approvedThrough: 1 }));
    mocks.check.mockReturnValue(run.promise);
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^2\. / });
    const button = within(stepItem(2)).getByRole("button", { name: "Run check" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("region", { name: "Next step" })).getByRole("button"));
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Running the step 2 check/)).toBeInTheDocument();
    run.resolve({ ok: false, reason: "rule", message: "Step 1 must be approved first." });
    expect(await within(stepItem(2)).findByRole("status")).toHaveTextContent(/approved first/);
  });

  it("stops waiting on a stuck check, does not rerun it, and shows the recorded status", async () => {
    mocks.list.mockResolvedValue(snapshot("runner_only", { approvedThrough: 1 }));
    mocks.check.mockReturnValue(new Promise(() => {}));
    render(<ActivationApprovals timeouts={{ check: 40 }} />);
    await screen.findByRole("heading", { name: /^2\. / });
    fireEvent.click(within(stepItem(2)).getByRole("button", { name: "Run check" }));
    // The "Running…" notice comes first; wait for the timeout notice that replaces it.
    await waitFor(() =>
      expect(within(stepItem(2)).getByRole("status")).toHaveTextContent(
        /No reply after .* the check was not retried/,
      ),
    );
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(within(stepItem(2)).getByRole("button", { name: "Run check" })).toBeEnabled();
  });

  it("recovers from a stuck first load with a retry", async () => {
    mocks.list
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(snapshot("runner_only", { approvedThrough: 1 }));
    render(<ActivationApprovals timeouts={{ list: 40 }} />);
    expect(
      await screen.findByRole("heading", { name: "Loading is taking too long" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
    expect(await screen.findByRole("heading", { name: /^2\. / })).toBeInTheDocument();
  });

  it("Refresh status only reads records and never reruns a check", async () => {
    mocks.list.mockResolvedValue(snapshot("runner_only", { approvedThrough: 1 }));
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^2\. / });
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText(/No checks were run/)).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("approves a technical step only by the owner's click after a fresh pass", async () => {
    const pass = {
      step: 2,
      status: "passed",
      evidenceVersion: 2,
      checkedAt: new Date().toISOString(),
      summary: "Existing Railway runner configuration verified through Jackboy.",
      details: [],
    };
    mocks.list
      .mockResolvedValueOnce(snapshot("runner_only", { approvedThrough: 1, checks: [pass] }))
      .mockResolvedValue(snapshot("runner_only", { approvedThrough: 2, checks: [pass] }));
    mocks.decide.mockResolvedValue({ ok: true });
    render(<ActivationApprovals />);
    expect(await screen.findByRole("region", { name: "Next step" })).toHaveTextContent(
      /Approve step 2/,
    );
    fireEvent.click(within(stepItem(2)).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith({
        data: expect.objectContaining({ step: 2, action: "approve" }),
      }),
    );
    // Authoritative status: shown as approved only after the server's record says so.
    await waitFor(() => expect(within(stepItem(2)).getByText("Approved")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^3\. / })),
    );
  });

  it("moves to the next step after an owner approval is recorded", async () => {
    mocks.list
      .mockResolvedValueOnce(snapshot("runner_only", { approvedThrough: 2 }))
      .mockResolvedValue(snapshot("runner_only", { approvedThrough: 3 }));
    mocks.decide.mockResolvedValue({ ok: true });
    render(<ActivationApprovals />);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^3\. / })),
    );
    fireEvent.click(within(stepItem(3)).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^4\. / })),
    );
    expect(within(stepItem(3)).getByRole("button", { name: "Show details" })).toBeInTheDocument();
    expect(screen.getByText(/3 of 10 approved/)).toBeInTheDocument();
  });

  it("keeps every action disabled without a fresh two-step code", async () => {
    mocks.list.mockResolvedValue(
      snapshot("runner_only", { approvedThrough: 2, mfaAgeSeconds: null }),
    );
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^3\. / });
    expect(within(stepItem(3)).getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Next step" })).toHaveTextContent(
      /Enter your authenticator code/,
    );
    fireEvent.click(within(stepItem(2)).getByRole("button", { name: "Show details" }));
    expect(within(stepItem(2)).getByRole("button", { name: "Revoke" })).toBeDisabled();
  });
});

describe("Step 8 run protocol self-test & verify", () => {
  const readyItems = [
    { key: "stop", label: "Mothership Emergency Stop", ok: true, detail: "Released." },
    { key: "self_test", label: "Self-test switch (JACKBOY_LINK_SELF_TEST_ENABLED)", ok: true, detail: "On." },
  ];
  const step8 = (readiness = readyItems, extra: Record<string, unknown> = {}) => {
    const base = snapshot("runner_only", { approvedThrough: 7 });
    // Step 7's approval window must still be open for Step 8 to unlock.
    const future = new Date(Date.now() + 6 * 3600_000).toISOString();
    return {
      ...base,
      rows: base.rows.map((r) => (r.step === 7 ? { ...r, approval_expires_at: future } : r)),
      selfTestReadiness: readiness,
      ...extra,
    };
  };
  const runButton = () =>
    within(stepItem(8)).getByRole("button", { name: /protocol self-test & verify|Continue pending/ });

  beforeEach(() => {
    mocks.selfTest.mockReset();
    window.sessionStorage.clear();
  });

  it("needs the explicit authorization tick, then runs once and shows a verified pass without approving", async () => {
    mocks.list.mockResolvedValue(step8());
    mocks.selfTest.mockResolvedValue({
      ok: true,
      outcome: "passed",
      resumed: false,
      job: { id: "22222222-2222-4222-8222-222222222222", status: "completed", checks: 3, runner: "restricted-protocol-self-test" },
      startedAt: "2026-11-14T00:00:00.000Z",
      finishedAt: "2026-11-14T00:00:04.000Z",
      check: passingCheck,
      approvalNeeded: true,
      attemptFinal: true,
    });
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^8\. / });
    expect(runButton()).toBeDisabled();
    fireEvent.click(within(stepItem(8)).getByRole("checkbox", { name: /I authorize Mothership/ }));
    fireEvent.click(runButton());
    fireEvent.click(runButton());
    await waitFor(() => expect(mocks.selfTest).toHaveBeenCalledTimes(1));
    expect(mocks.selfTest.mock.calls[0]![0]).toEqual({
      data: { attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/), confirm: true },
    });
    const result = await within(stepItem(8)).findByLabelText("Self-test result");
    expect(result).toHaveTextContent(/Passed/);
    expect(result).toHaveTextContent(/signature verified/);
    expect(result).toHaveTextContent(/Not approved yet/);
    expect(mocks.decide).not.toHaveBeenCalled();
    // The authorization is per click.
    expect(within(stepItem(8)).getByRole("checkbox", { name: /I authorize Mothership/ })).not.toBeChecked();
  });

  it("keeps the button disabled and lists the next step when a setting blocks sending", async () => {
    mocks.list.mockResolvedValue(
      step8([
        { key: "self_test", label: "Self-test switch (JACKBOY_LINK_SELF_TEST_ENABLED)", ok: false, detail: "Off or missing: set it to exactly true." },
      ]),
    );
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^8\. / });
    fireEvent.click(within(stepItem(8)).getByRole("checkbox", { name: /I authorize Mothership/ }));
    expect(runButton()).toBeDisabled();
    expect(within(stepItem(8)).getByText(/set it to exactly true/)).toBeInTheDocument();
    expect(mocks.selfTest).not.toHaveBeenCalled();
  });

  it("shows a safety denial and a timeout distinctly; a timed-out attempt is resumed with the same ID", async () => {
    mocks.list.mockResolvedValue(step8());
    mocks.selfTest.mockResolvedValueOnce({
      ok: false,
      reason: "timeout",
      message: "Timeout: Jackboy sent no usable reply within 10 s. Retrying only reads this job's status; it never runs it again.",
      details: [],
      attemptFinal: false,
      sent: true,
    });
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^8\. / });
    const tick = () => fireEvent.click(within(stepItem(8)).getByRole("checkbox", { name: /I authorize Mothership/ }));
    tick();
    fireEvent.click(runButton());
    expect(await within(stepItem(8)).findByText(/Timeout — no usable reply in time/)).toBeInTheDocument();
    expect(runButton()).toHaveTextContent("Continue pending self-test (status only)");
    const firstId = mocks.selfTest.mock.calls[0]![0].data.attemptId;

    mocks.selfTest.mockResolvedValueOnce({
      ok: false,
      reason: "safety_denial",
      message: "Safety denial: Jackboy's global Kill Switch is on, so it refused the self-test. Nothing ran.",
      details: [],
      attemptFinal: true,
      sent: true,
    });
    tick();
    fireEvent.click(runButton());
    expect(await within(stepItem(8)).findByText(/Safety denial — nothing was run/)).toBeInTheDocument();
    expect(mocks.selfTest.mock.calls[1]![0].data.attemptId).toBe(firstId);
    expect(runButton()).toHaveTextContent("Run protocol self-test & verify");
  });

  it("stops waiting on a stuck run without resending", async () => {
    mocks.list.mockResolvedValue(step8());
    mocks.selfTest.mockReturnValue(new Promise(() => {}));
    render(<ActivationApprovals timeouts={{ selfTest: 40 }} />);
    await screen.findByRole("heading", { name: /^8\. / });
    fireEvent.click(within(stepItem(8)).getByRole("checkbox", { name: /I authorize Mothership/ }));
    fireEvent.click(runButton());
    expect(await within(stepItem(8)).findByText(/This page stopped waiting/)).toBeInTheDocument();
    expect(mocks.selfTest).toHaveBeenCalledTimes(1);
    expect(runButton()).toHaveTextContent("Continue pending");
  });

  it("is locked while an earlier step is not approved", async () => {
    mocks.list.mockResolvedValue({ ...snapshot("runner_only", { approvedThrough: 6 }), selfTestReadiness: readyItems });
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^8\. / });
    expect(within(stepItem(8)).queryByRole("button", { name: /protocol self-test/ })).toBeNull();
    expect(within(stepItem(8)).getByText(/waiting on step 7/)).toBeInTheDocument();
  });
});

describe("Steps 9–10 live link and CODE panel", () => {
  const gates = (stopOk = true) => [
    { key: "stop", label: "Mothership Emergency Stop", ok: stopOk, detail: stopOk ? "Released." : "Engaged." },
    { key: "owner", label: "Link owner", ok: true, detail: "Matches you." },
    { key: "link", label: "Link switch (JACKBOY_LINK_ENABLED)", ok: true, detail: "On." },
    { key: "window", label: "Link approval window", ok: true, detail: "Open." },
    { key: "identity", label: "Link identity settings", ok: true, detail: "Present." },
  ];
  const live = (approvedThrough: number, stopOk = true) =>
    snapshot("runner_only", {
      approvedThrough,
      liveReadiness: gates(stopOk),
      step7ExpiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    });
  const panel = () => screen.getByRole("region", { name: /Live link, terminal and CODE/ });
  const checkButton = () => within(panel()).getByRole("button", { name: "Check live connection" });

  beforeEach(() => mocks.liveLink.mockReset());

  it("keeps the connection check disabled until Step 9 is approved, and shows CODE off", async () => {
    mocks.list.mockResolvedValue(live(8));
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^9\. / });
    expect(within(panel()).getByText("Waiting for your Step 9 approval")).toBeInTheDocument();
    expect(within(panel()).getByRole("checkbox", { name: /connection-only check/ })).toBeDisabled();
    expect(checkButton()).toBeDisabled();
    expect(within(panel()).getByText(/Mothership has no CODE request path/)).toBeInTheDocument();
    expect(mocks.liveLink).not.toHaveBeenCalled();
  });

  it("after Step 9, sends one connection-only check per authorization and reports the verified reply", async () => {
    mocks.list.mockResolvedValue(live(9));
    mocks.liveLink.mockResolvedValue({
      ok: true,
      verifiedAt: "2026-11-14T01:00:00.000Z",
      message: "Live link verified: Jackboy answered a signed handshake with a ready session. No job, self-test or CODE request was sent.",
    });
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^9\. / });
    expect(checkButton()).toBeDisabled();
    fireEvent.click(within(panel()).getByRole("checkbox", { name: /connection-only check/ }));
    fireEvent.click(checkButton());
    fireEvent.click(checkButton());
    await waitFor(() => expect(mocks.liveLink).toHaveBeenCalledTimes(1));
    expect(mocks.liveLink.mock.calls[0]![0]).toEqual({ data: { confirm: true } });
    expect(await within(panel()).findByText(/Live link verified/)).toBeInTheDocument();
    expect(within(panel()).getByRole("checkbox", { name: /connection-only check/ })).not.toBeChecked();
    expect(mocks.decide).not.toHaveBeenCalled();
    // CODE stays off even with Step 9 approved.
    expect(within(panel()).getByText("Off")).toBeInTheDocument();
  });

  it("shows Jackboy's Kill Switch refusal as a safety denial", async () => {
    mocks.list.mockResolvedValue(live(9));
    mocks.liveLink.mockResolvedValue({
      ok: false,
      reason: "safety_denial",
      message: "Safety denial from Jackboy: its global Kill Switch is on. Nothing ran and nothing was changed.",
      details: [{ label: "Jackboy reply", status: "needs_attention", detail: "HTTP 403 · grant_unavailable" }],
    });
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^9\. / });
    fireEvent.click(within(panel()).getByRole("checkbox", { name: /connection-only check/ }));
    fireEvent.click(checkButton());
    expect(await within(panel()).findByText(/Safety denial from Jackboy/)).toBeInTheDocument();
    expect(within(panel()).getByText(/grant_unavailable/)).toBeInTheDocument();
  });

  it("blocks the check while Mothership's Emergency Stop is engaged and never offers to release it", async () => {
    mocks.list.mockResolvedValue(live(9, false));
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^9\. / });
    expect(within(panel()).getByText("Blocked on Mothership")).toBeInTheDocument();
    expect(checkButton()).toBeDisabled();
    expect(within(panel()).queryByRole("button", { name: /release/i })).toBeNull();
  });

  it("keeps the check disabled without a fresh two-step code", async () => {
    mocks.list.mockResolvedValue({ ...live(9), mfaAgeSeconds: null });
    render(<ActivationApprovals />);
    await screen.findByRole("heading", { name: /^9\. / });
    fireEvent.click(within(panel()).getByRole("checkbox", { name: /connection-only check/ }));
    expect(checkButton()).toBeDisabled();
    expect(within(panel()).getByText(/fresh two-step code/)).toBeInTheDocument();
  });
});
