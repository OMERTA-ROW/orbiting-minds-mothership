import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => request }));
vi.mock("@/lib/jackboy-link.functions", () => ({ requestJackboyLink: {} }));
import { JackboyLinkPanel } from "@/components/omnibridge/JackboyLinkPanel";

beforeEach(() => {
  request.mockReset();
});

describe("Jackboy scoped protocol panel", () => {
  it("requires explicit confirmation before queueing or running the test", async () => {
    request.mockResolvedValue({ id: "job", status: "queued" });
    render(<JackboyLinkPanel />);
    expect(screen.getByRole("button", { name: "Queue self-test" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run self-test" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Jackboy project UUID"), {
      target: { value: "project" },
    });
    fireEvent.change(screen.getByLabelText("Approved grant UUID"), {
      target: { value: "approval" },
    });
    fireEvent.change(screen.getByLabelText("Job UUID (not needed for handshake)"), {
      target: { value: "job" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Queue self-test" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        data: {
          action: "submit",
          projectId: "project",
          approvalId: "approval",
          jobId: "job",
          confirm: true,
        },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Job: queued");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run self-test" })).toBeDisabled(),
    );
  });
  it("reports uncertainty without claiming success when an operation fails", async () => {
    request.mockRejectedValue(new Error("audit unavailable"));
    render(<JackboyLinkPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Handshake" }));
    expect(await screen.findByRole("status")).toHaveTextContent("same job ID");
  });
});
