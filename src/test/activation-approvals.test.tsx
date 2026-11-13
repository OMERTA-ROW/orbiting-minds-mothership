import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  decide: vi.fn(),
  check: vi.fn(),
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
}));

import { ActivationApprovals } from "@/components/omnibridge/ActivationApprovals";

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
      approval_expires_at: step === 7 && status === "approved" ? "2026-11-13T12:00:00.000Z" : null,
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
    mocks.list
      .mockResolvedValueOnce(
        snapshot("runner_only", { approvedThrough: 1, failedStep: 2, checks: [failed] }),
      )
      .mockResolvedValueOnce(snapshot("runner_only", { approvedThrough: 2, checks: [passed] }));
    mocks.check.mockResolvedValue({ ok: true, check: passed });
    render(<ActivationApprovals />);

    expect(await screen.findByText(/Runner configuration needs attention/)).toBeInTheDocument();
    const step = screen
      .getByRole("heading", { name: /2\. Railway runner settings verified/ })
      .closest("li");
    fireEvent.click(within(step!).getByRole("button", { name: "Run check" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith({ data: { step: 2 } }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Existing Railway runner configuration verified through Jackboy.",
    );
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
