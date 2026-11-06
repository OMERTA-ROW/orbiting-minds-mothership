import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ approve: vi.fn(), revoke: vi.fn(), callback: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/jackboy-dispatch.functions", () => ({
  approveJackboyReceipt: mocks.approve,
  revokeJackboyReceipt: mocks.revoke,
  sendJackboyCallback: mocks.callback,
}));
import { JackboyDispatchReview } from "@/components/omnibridge/JackboyDispatchReview";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires fresh explicit review after any scope edit", async () => {
  mocks.approve.mockResolvedValue({ payloadDigest: "fixture-digest" });
  render(<JackboyDispatchReview />);
  const approval = screen.getByRole("button", { name: "Approve quarantine grant" });
  expect(approval).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I reviewed these exact job details/));
  expect(approval).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Exact reviewed instructions"), {
    target: { value: "bounded request" },
  });
  expect(approval).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I reviewed these exact job details/));
  fireEvent.click(approval);
  await waitFor(() =>
    expect(mocks.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ instructions: "bounded request", confirm: true }),
      }),
    ),
  );
  expect(await screen.findByText(/fixture-digest/)).toBeInTheDocument();
});
