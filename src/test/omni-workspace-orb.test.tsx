import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));

const agent = (id: string, display_name: string) => ({
  id,
  display_name,
  status: "enrolled",
  allowed_actions: ["chat"],
  budget_task_cents: 0,
  budget_day_cents: 0,
  budget_total_cents: 0,
  paused: false,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});

const snapshot = {
  now: Date.now(),
  gate: {
    open: false,
    blockers: [
      "Cloud sandbox settings are missing or invalid.",
      "Cloud sandbox self-test has not passed in the last 24 hours.",
    ],
  },
  link: { configured: false, enabled: false, problem: null, selfTestPassedAt: null, lastCheck: null },
  killSwitchEnabled: true,
  killSwitchChangedAt: null,
  emergencyStopReleased: true,
  passkeyFreshAt: null,
  agents: [agent("jackboy", "Jackboy"), agent("omni", "OMNI")],
  agentSpend: {},
  autonomy: {},
  spend: { task: 0, day: 0, total: 0 },
  sessions: [],
  jobs: [],
  windows: [],
  approvals: [],
  audit: [],
  passkeys: [],
  steps: [],
};

vi.mock("@/lib/omni-workspace.functions", () => {
  const no = () => Promise.resolve({ ok: false, message: "not in test" });
  return {
    readWorkspace: () => Promise.resolve(snapshot),
    decideStep: no,
    endSession: no,
    passkeyCheckOptions: no,
    passkeyCheckVerify: no,
    passkeyRegisterOptions: no,
    passkeyRegisterVerify: no,
    pollSession: no,
    proposePullRequest: no,
    runCommand: no,
    runSandboxSelfTest: no,
    runStopDrill: no,
    sendChat: vi.fn(no),
    setAutonomy: no,
    setKillSwitch: no,
    startSession: no,
    stopWork: no,
    updateAgent: no,
  };
});

import { OmniWorkspace } from "@/components/omnibridge/OmniWorkspace";

describe("OMNI terminal orb", () => {
  it("shows the real terminal as not connected, with the recorded blockers", async () => {
    render(<OmniWorkspace />);
    await waitFor(() => expect(screen.getByTestId("orb-status")).toBeInTheDocument());
    expect(screen.getByTestId("orb-status").textContent).toContain("OMNI terminal not connected");
    expect(screen.getByRole("img", { name: /voice orb/ }).getAttribute("data-state")).toBe(
      "unavailable",
    );
    expect(screen.getAllByText("Cloud sandbox settings are missing or invalid.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Microphone not supported/ })).toBeDisabled();
    expect(screen.getByLabelText("Message OMNI")).toBeDisabled();
  });

  it("names the selected enrolled agent everywhere when switching, never as OMNI", async () => {
    render(<OmniWorkspace />);
    await waitFor(() => expect(screen.getByTestId("orb-agent-name")).toBeInTheDocument());
    expect(screen.getByTestId("orb-agent-name").textContent).toBe("OMNI");
    fireEvent.change(screen.getByLabelText("Agent"), { target: { value: "jackboy" } });
    expect(screen.getByTestId("orb-agent-name").textContent).toBe("Jackboy");
    expect(screen.getByText(/Chat with Jackboy/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message Jackboy")).toBeDisabled();
  });
});
