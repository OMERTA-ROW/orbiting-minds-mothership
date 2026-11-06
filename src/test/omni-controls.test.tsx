import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "synthetic-owner" } as { id: string } | null,
  check: vi.fn(),
  submit: vi.fn(),
  keys: vi.fn(),
  audit: vi.fn(),
  create: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => ({ user: mocks.user, ready: true }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/omni-autonomy.functions", () => ({
  readAutonomyReadiness: mocks.check,
  submitAutonomyTask: mocks.submit,
}));
vi.mock("@/lib/omni-api-keys.functions", () => ({
  listOmniApiKeys: mocks.keys,
  listOmniApiKeyAudit: mocks.audit,
  createOmniApiKey: mocks.create,
  rotateOmniApiKey: mocks.rotate,
  revokeOmniApiKey: mocks.revoke,
}));
vi.mock("@/lib/jackboy-link.functions", () => ({ requestJackboyLink: vi.fn() }));
vi.mock("@/lib/jackboy-dispatch.functions", () => ({
  approveJackboyReceipt: vi.fn(),
  revokeJackboyReceipt: vi.fn(),
  sendJackboyCallback: vi.fn(),
}));
import { OmniAutonomy } from "@/components/omnibridge/OmniAutonomy";
import { OmniApiKeys } from "@/components/omnibridge/OmniApiKeys";
import { OmniRights } from "@/components/omnibridge/OmniRights";
import { useOmniLocalRecords } from "@/hooks/use-omni-local-records";
import { Button } from "@/components/ui/button";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user = { id: "synthetic-owner" };
  mocks.keys.mockResolvedValue([]);
  mocks.audit.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OMNI control reliability", () => {
  it("preserves unreadable Rights records instead of replacing them on open", async () => {
    localStorage.setItem("evolution.omni-rights.v1", "not-valid-json");
    render(<OmniRights />);
    await waitFor(() =>
      expect(localStorage.getItem("evolution.omni-rights.v1")).toBe("not-valid-json"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/preserved/);
  });
  it("catches failed specimen hashing without adding a false fingerprint", async () => {
    render(<OmniRights />);
    const file = new File(["fictional"], "synthetic.txt", { type: "text/plain" });
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.reject(new Error("fixture read failure")),
    });
    fireEvent.change(screen.getByLabelText("Specimen capture file"), { target: { files: [file] } });
    await screen.findByText(/Specimen was not added/);
    expect(localStorage.getItem("evolution.omni-rights.v1") ?? "").not.toContain("synthetic.txt");
  });
  it("clears an old readiness failure after a successful retry", async () => {
    mocks.check
      .mockRejectedValueOnce(new Error("fixture denied"))
      .mockResolvedValueOnce({ state: "Blocked", blockers: ["executor absent"] });
    render(<OmniAutonomy />);
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await screen.findByText("fixture denied");
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("fixture denied")).not.toBeInTheDocument());
  });
  it("blocks duplicate task submissions until the pending request finishes", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.submit.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<OmniAutonomy />);
    fireEvent.change(screen.getByLabelText("Task goal"), {
      target: { value: "Read a fictional page" },
    });
    fireEvent.change(screen.getByLabelText("Allowed websites"), {
      target: { value: "example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit task" }));
    expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ state: "blocked", hints: [], log: [] }));
  });
  it("reports clipboard denial and keeps the show-once secret available", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("fixture clipboard denied")) },
    });
    mocks.create.mockResolvedValue({ id: "fixture", secret: "synthetic-show-once-value" });
    render(<OmniApiKeys />);
    await screen.findByRole("button", { name: "Create key" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fixture" } });
    fireEvent.click(screen.getByLabelText(/I approve creating/));
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("synthetic-show-once-value");
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    await screen.findByText(/Copy failed/);
    expect(screen.getByText("synthetic-show-once-value")).toBeInTheDocument();
  });
  it("copies the new value and hides it only when explicitly dismissed", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    mocks.create.mockResolvedValue({ id: "fixture", secret: "synthetic-show-once-value" });
    render(<OmniApiKeys />);
    await screen.findByRole("button", { name: "Create key" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fixture" } });
    fireEvent.click(screen.getByLabelText(/I approve creating/));
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("synthetic-show-once-value");
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith("synthetic-show-once-value"));
    fireEvent.click(screen.getByRole("button", { name: "I have saved it — hide" }));
    expect(screen.queryByText("synthetic-show-once-value")).not.toBeInTheDocument();
  });
  it.each(["Rotate", "Revoke"])(
    "%s submits only the selected key and confirms list readback",
    async (action) => {
      mocks.keys.mockResolvedValue([
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Fixture key",
          key_prefix: "synthetic",
          scopes: ["health"],
          created_at: "2026-11-04T00:00:00Z",
          expires_at: "2099-01-01T00:00:00Z",
          last_used_at: null,
          revoked_at: null,
          rotated_at: null,
        },
      ]);
      const mutate = action === "Rotate" ? mocks.rotate : mocks.revoke;
      mutate.mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        ...(action === "Rotate" ? { secret: "synthetic-rotated-value" } : {}),
      });
      render(<OmniApiKeys />);
      fireEvent.click(await screen.findByRole("button", { name: action }));
      await waitFor(() =>
        expect(mutate).toHaveBeenCalledWith({
          data: { id: "11111111-1111-4111-8111-111111111111", confirm: true },
        }),
      );
      await waitFor(() => expect(mocks.keys).toHaveBeenCalledTimes(2));
    },
  );
  it("keeps created secret and does not imply mutation failed when only readback fails", async () => {
    mocks.create.mockResolvedValue({ id: "fixture", secret: "synthetic-created-value" });
    mocks.keys.mockResolvedValueOnce([]).mockRejectedValue(new Error("fixture refresh failure"));
    render(<OmniApiKeys />);
    await screen.findByRole("button", { name: "Create key" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fixture" } });
    fireEvent.click(screen.getByLabelText(/I approve creating/));
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText(/do not repeat the change/);
    expect(screen.getByText("synthetic-created-value")).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("denied owner access exposes no provisioning action and allows a read-only retry", async () => {
    mocks.keys.mockRejectedValueOnce(new Error("fixture denied")).mockResolvedValueOnce([]);
    render(<OmniApiKeys />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry access check" }));
    await screen.findByRole("button", { name: "Create key" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.keys).toHaveBeenCalledTimes(2);
  });
});

function RecordsFixture() {
  const { records, setRecords, storageNotice } = useOmniLocalRecords({
    key: "fixture-records",
    initial: [] as number[],
    read: (raw) => (raw ? (JSON.parse(raw) as number[]) : []),
    collections: [],
  });
  return (
    <>
      <Button onClick={() => setRecords([...records, 1])}>Add fixture</Button>
      <p role="status">{storageNotice}</p>
    </>
  );
}
describe("OMNI browser records", () => {
  it("preserves another tab's saved version", async () => {
    localStorage.setItem("fixture-records", "[2]");
    render(<RecordsFixture />);
    localStorage.setItem("fixture-records", "[3]");
    fireEvent.click(screen.getByText("Add fixture"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/another tab/));
    expect(localStorage.getItem("fixture-records")).toBe("[3]");
  });
  it("reports a blocked browser save while preserving the original", async () => {
    localStorage.setItem("fixture-records", "[2]");
    render(<RecordsFixture />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("fixture quota exceeded");
    });
    fireEvent.click(screen.getByText("Add fixture"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/saving failed/));
    expect(localStorage.getItem("fixture-records")).toBe("[2]");
  });
});
