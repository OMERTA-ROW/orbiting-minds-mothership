import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CB = "https://omni-orbit-command-companion.lovable.app/mothership/callback";
const SEARCH = {
  response_type: "code",
  client_id: "omni-web",
  redirect_uri: CB,
  scope: "tasks:write safety:emergency-stop chat:write",
  state: "s".repeat(32),
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
};
const mocks = vi.hoisted(() => ({
  search: {} as Record<string, string>,
  describe: vi.fn(),
  approve: vi.fn(),
  assign: vi.fn(),
}));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => ({ user: { id: "u1" }, ready: true }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => mocks.search }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/omni-delegation.functions", () => ({
  describeOmniAuthorization: mocks.describe,
  approveOmniAuthorization: mocks.approve,
}));
vi.mock("@/components/account/OwnerCodeForm", () => ({ OwnerCodeForm: () => <p>code form</p> }));
import { Route } from "@/routes/omni-authorize";
const Page = (Route as unknown as { options: { component: () => React.ReactElement } }).options
  .component;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search = { ...SEARCH };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: mocks.assign },
  });
});
afterEach(cleanup);

describe("OMNI connection approval page", () => {
  it("owner must tick a permission; unavailable ones can't be ticked; approve sends only ticked scopes", async () => {
    mocks.describe.mockResolvedValue({
      valid: true,
      owner: true,
      needsSecondStep: false,
      mfaBlocker: null,
    });
    mocks.approve.mockResolvedValue({ ok: true, redirectTo: `${CB}?code=x&state=y` });
    render(<Page />);
    const allow = await screen.findByRole("button", { name: /Allow/ });
    expect(allow).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes[2]).toBeDisabled(); // chat:write
    expect(boxes.every((b) => b.getAttribute("aria-checked") === "false")).toBe(true);
    fireEvent.click(boxes[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Allow/ }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(`${CB}?code=x&state=y`));
    expect(mocks.approve).toHaveBeenCalledWith({
      data: { request: SEARCH, scopes: ["tasks:write"], confirm: true },
    });
  });
  it("asks for a fresh code before approving", async () => {
    mocks.describe.mockResolvedValue({
      valid: true,
      owner: true,
      needsSecondStep: false,
      mfaBlocker: "Enter a fresh authenticator code first (last 15 minutes).",
    });
    render(<Page />);
    await screen.findByText("code form");
    expect(screen.queryByRole("button", { name: /Allow/ })).toBeNull();
  });
  it("non-owners cannot approve; declining returns access_denied to the allowlisted callback", async () => {
    mocks.describe.mockResolvedValue({
      valid: true,
      owner: false,
      needsSecondStep: false,
      mfaBlocker: null,
    });
    render(<Page />);
    await screen.findByText(/Only the verified Mothership owner/);
    fireEvent.click(screen.getByRole("button", { name: "Don't allow" }));
    const url = new URL(mocks.assign.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe(CB);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("code")).toBeNull();
  });
  it("an unknown callback is shown as an error and never redirected", async () => {
    mocks.search = { ...SEARCH, redirect_uri: "https://evil.example/cb" };
    render(<Page />);
    await screen.findByText(/return address isn't the approved OMNI address/);
    expect(screen.queryByRole("button", { name: "Don't allow" })).toBeNull();
    expect(mocks.describe).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
