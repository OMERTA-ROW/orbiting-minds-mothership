import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  account: {
    user: { id: "owner-a" },
    ready: true,
    recoveryUserId: "owner-a" as string | null,
    finishRecovery: vi.fn(),
  },
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => mocks.account }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
import { Route } from "@/routes/reset-password";
const Page = Route.options.component;
function open() {
  if (!Page) throw new Error("Recovery page missing");
  return render(<Page />);
}
function fill() {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "synthetic-new-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "synthetic-new-password" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.ready = true;
  mocks.account.recoveryUserId = "owner-a";
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);
describe("password recovery", () => {
  it("does not allow a URL flag alone to show or submit a reset form", () => {
    window.history.replaceState({}, "", "/reset-password?type=recovery");
    mocks.account.recoveryUserId = null;
    open();
    expect(screen.queryByRole("button", { name: "Update password" })).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("revalidates matching identity and preserves a successful completion without current-password input", async () => {
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByText("Password updated. You can return to your projects.");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "synthetic-new-password" });
    expect(mocks.account.finishRecovery).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Update password" })).not.toBeInTheDocument();
  });
  it("blocks updates if the recovery identity is no longer the signed-in account", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-b" } }, error: null });
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByText(
      "Your recovery session is unavailable. Open a fresh link from your email.",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("disables repeat submission and shows a rejected update without clearing recovery", async () => {
    let reject: (error: Error) => void = () => {};
    mocks.updateUser.mockReturnValue(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Updating password…" })).toBeDisabled(),
    );
    await act(async () => reject(new Error("Recovery request unavailable")));
    await screen.findByText("Recovery request unavailable");
    expect(mocks.account.finishRecovery).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled();
  });
});
