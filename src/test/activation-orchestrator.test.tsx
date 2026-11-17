import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readiness: vi.fn(),
  together: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (name: string) => mocks[name as keyof typeof mocks],
}));
vi.mock("@/lib/activation-orchestrate.functions", () => ({
  getActivationReadiness: "readiness",
  activateTogether: "together",
}));

import { ActivationOrchestrator } from "@/components/omnibridge/ActivationOrchestrator";

const facts = {
  checkedAt: "2026-11-16T22:30:00Z",
  jackboyBuild: { commit: "9081a4187c4f8e691e209f12ec3afd1db3b75b91", builtAt: "2026-11-16T21:55:36Z" },
  executor: { ok: true, release: "omni-bounded-plan-2", reviewedRelease: "omni-bounded-plan-2", enabled: false },
  pinned: true,
  windowEndsAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
  linkEffective: true,
  autonomyEffective: false,
  mothershipStop: false,
  jackboy: {
    connected: true,
    configured: false,
    armed: false,
    running: false,
    emergencyStop: false,
    killSwitch: false,
    executorRelease: null,
    cancellationPending: false,
  },
  codeEnabled: true,
  activePermits: 0,
  sandbox: { configured: false, enabled: false },
};

beforeEach(() => {
  mocks.readiness.mockReset().mockResolvedValue(facts);
  mocks.together.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("Activate OMNI and Jackboy together", () => {
  it("shows a not-operational checklist naming the Railway setting, with every scope unticked", async () => {
    render(<ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />);
    expect(await screen.findByText(/^Not operational/)).toBeTruthy();
    expect(screen.getAllByText(/OMNI_AUTONOMOUS_ENABLED=true/).length).toBeGreaterThan(0);
    for (const box of screen.getAllByRole("checkbox")) expect((box as HTMLInputElement).checked).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Activate selected together" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("stays disabled without a fresh two-step code", async () => {
    render(<ActivationOrchestrator mfaFresh={false} step9Approved step10Approved busy={false} />);
    await screen.findByText(/^Not operational/);
    fireEvent.click(screen.getByLabelText(/Step 10 autonomy authorization/));
    expect(
      (screen.getByRole("button", { name: "Activate selected together" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("sends only the selected scopes and shows a partial result plainly", async () => {
    mocks.together.mockResolvedValue({
      ok: false,
      mfa: false,
      partial: true,
      ownerAction: null,
      summary: "Partly done. In effect: Step 9 live link.",
      stages: [
        { id: "live_link", status: "already", message: "Already in effect; not re-run." },
        { id: "autonomy", status: "failed", message: "Not activated: spending enforcement." },
        { id: "arm", status: "not_selected", message: "Not selected." },
      ],
    });
    const changed = vi.fn();
    render(
      <ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} onChanged={changed} />,
    );
    await screen.findByText(/^Not operational/);
    fireEvent.click(screen.getByLabelText(/Step 10 autonomy authorization/));
    fireEvent.click(screen.getByRole("button", { name: "Activate selected together" }));
    await waitFor(() => expect(mocks.together).toHaveBeenCalledTimes(1));
    const sent = mocks.together.mock.calls[0]![0].data;
    expect(sent).toMatchObject({ confirm: true, liveLink: false, autonomy: true, arm: false });
    expect(sent.attempts.live_link).not.toBe(sent.attempts.autonomy);
    expect(await screen.findByText(/Partly done/)).toBeTruthy();
    expect(screen.getByText(/Failed \(rolled back\)/)).toBeTruthy();
    expect(changed).toHaveBeenCalled();
  });

  it("reuses the same attempt IDs after an unanswered request", async () => {
    mocks.together.mockRejectedValueOnce(new Error("network"));
    mocks.together.mockResolvedValueOnce({
      ok: true, mfa: false, partial: false, ownerAction: null, summary: "In effect.", stages: [],
    });
    render(<ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />);
    await screen.findByText(/^Not operational/);
    fireEvent.click(screen.getByLabelText(/Step 10 autonomy authorization/));
    fireEvent.click(screen.getByRole("button", { name: "Activate selected together" }));
    expect(await screen.findByText(/result is unknown, not active/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Activate selected together" }));
    await waitFor(() => expect(mocks.together).toHaveBeenCalledTimes(2));
    expect(mocks.together.mock.calls[1]![0].data.attempts).toEqual(
      mocks.together.mock.calls[0]![0].data.attempts,
    );
  });

  const noSignedAnswer =
    "The staging executor (Vultr) did not give a signed answer. Check that omni-executor.service is running.";
  const armFailure = {
    ok: false,
    mfa: false,
    partial: true,
    ownerAction: noSignedAnswer,
    summary: "Partly done. In effect: Step 9 live link.",
    stages: [
      { id: "live_link", status: "already", message: "Already in effect; not re-run." },
      { id: "autonomy", status: "already", message: "Already in effect; not re-run." },
      { id: "arm", status: "skipped", message: `Not attempted: ${noSignedAnswer}` },
    ],
  };

  async function runOnce() {
    fireEvent.click(screen.getByLabelText(/Arm bounded executor/));
    fireEvent.click(screen.getByRole("button", { name: "Activate selected together" }));
  }

  it("labels the last result with its attempt time and shows a missing signed answer once", async () => {
    mocks.together.mockResolvedValue(armFailure);
    render(<ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />);
    await screen.findByText(/^Not operational/);
    await runOnce();
    const box = await screen.findByRole("alert", { name: "Previous activation attempt" });
    expect(box.textContent).toMatch(/Previous attempt — Last attempt at \d{1,2}:\d{2}/);
    expect(box.textContent!.split("did not give a signed answer").length - 1).toBe(1);
    expect(box.textContent).toMatch(/Not attempted — see “Your action” below/);
  });

  it("replaces the old result with In progress as soon as a new attempt starts", async () => {
    mocks.together.mockResolvedValueOnce(armFailure);
    let finish!: (v: unknown) => void;
    mocks.together.mockReturnValueOnce(new Promise((r) => (finish = r)));
    render(<ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />);
    await screen.findByText(/^Not operational/);
    await runOnce();
    await screen.findByRole("alert", { name: "Previous activation attempt" });
    await runOnce();
    expect(await screen.findByRole("status", { name: "Activation in progress" })).toBeTruthy();
    expect(screen.queryByText(/did not give a signed answer/)).toBeNull();
    expect(screen.queryByRole("alert", { name: "Previous activation attempt" })).toBeNull();
    finish({ ...armFailure, ok: true, ownerAction: null, summary: "In effect.", stages: [] });
    expect(await screen.findByText("In effect.")).toBeTruthy();
  });

  it("marks the previous result out of date after a later successful Verify executor", async () => {
    mocks.together.mockResolvedValue(armFailure);
    const { rerender } = render(
      <ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />,
    );
    await screen.findByText(/^Not operational/);
    await runOnce();
    await screen.findByRole("alert", { name: "Previous activation attempt" });
    expect(screen.queryByText(/out of date/)).toBeNull();
    rerender(
      <ActivationOrchestrator
        mfaFresh
        step9Approved
        step10Approved
        busy={false}
        executorVerifiedAt={Date.now() + 1000}
      />,
    );
    const box = screen.getByRole("status", { name: "Previous activation attempt" });
    expect(box.textContent).toMatch(/\(out of date\)/);
    expect(box.textContent).toMatch(/Verify executor succeeded at/);
    expect(box.className).not.toMatch(/text-destructive/);
  });

  it("marks the previous result out of date when a refreshed check shows the step in effect", async () => {
    mocks.together.mockResolvedValue(armFailure);
    render(<ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />);
    await screen.findByText(/^Not operational/);
    await runOnce();
    await screen.findByRole("alert", { name: "Previous activation attempt" });
    mocks.readiness.mockResolvedValue({
      ...facts,
      autonomyEffective: true,
      jackboy: { ...facts.jackboy, configured: true, armed: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    expect(await screen.findByText(/now in effect/)).toBeTruthy();
    expect(screen.getByRole("status", { name: "Previous activation attempt" })).toBeTruthy();
  });

  it("keeps the result current when a refreshed check still shows the step not in effect", async () => {
    mocks.together.mockResolvedValue(armFailure);
    render(<ActivationOrchestrator mfaFresh step9Approved step10Approved busy={false} />);
    await screen.findByText(/^Not operational/);
    await runOnce();
    await screen.findByRole("alert", { name: "Previous activation attempt" });
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await waitFor(() => expect(mocks.readiness.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(screen.queryByText(/out of date/)).toBeNull();
  });
});
