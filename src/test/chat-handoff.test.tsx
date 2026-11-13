import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ read: vi.fn(), queue: vi.fn(), cancel: vi.fn() }));
vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/omni-terminal.functions", () => ({
  readOmniTerminal: m.read,
  queueTerminalTask: m.queue,
  cancelTerminalTask: m.cancel,
}));
import { ChatHandoffDialog } from "@/components/omnibridge/ChatHandoff";

const source = { request: "Write tests for login", reply: "Here is a plan." };
describe("chat handoff approval", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()));
  it("fails closed when owner terminal access is not confirmed", async () => {
    m.read.mockRejectedValue(new Error("aal2"));
    render(
      <ChatHandoffDialog source={source} projectName="p" onClose={() => {}} onQueued={() => {}} />,
    );
    await screen.findByText(/Owner terminal access was not confirmed/);
    expect(screen.getByRole("button", { name: /Save held task/ })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(m.queue).not.toHaveBeenCalled();
  });
  it("needs explicit approval and saves CODE tasks to Jackboy as held", async () => {
    m.read.mockResolvedValue({ emergencyStop: { engaged: true }, tasks: [] });
    m.queue.mockResolvedValue({ ok: true });
    const onQueued = vi.fn();
    render(
      <ChatHandoffDialog source={source} projectName="p" onClose={() => {}} onQueued={onQueued} />,
    );
    await screen.findByText(/Emergency Stop is engaged/);
    fireEvent.change(screen.getByLabelText("Task type"), { target: { value: "code.test" } });
    const save = screen.getByRole("button", { name: /Save held task/ });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(save);
    await waitFor(() => expect(m.queue).toHaveBeenCalledTimes(1));
    expect(m.queue.mock.calls[0]?.[0].data).toMatchObject({ kind: "code.test", agent: "jackboy" });
    expect(onQueued).toHaveBeenCalledWith(expect.objectContaining({ state: "held" }));
  });
});
