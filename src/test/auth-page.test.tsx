import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  oauth: vi.fn(),
  getUser: vi.fn(),
  aal: vi.fn(),
  factors: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => ({ user: null, ready: true }) }));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: mocks.oauth } },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      signUp: mocks.signUp,
      signInWithPassword: mocks.signIn,
      signOut: vi.fn(),
      mfa: { getAuthenticatorAssuranceLevel: mocks.aal, listFactors: mocks.factors },
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
import { Route } from "@/routes/auth";
const Page = Route.options.component;
function open() {
  if (!Page) throw new Error("Auth page missing");
  return render(<Page />);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.oauth.mockResolvedValue({ redirected: false });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.navigate.mockResolvedValue(undefined);
  mocks.aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
  mocks.factors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
});
afterEach(cleanup);
describe("OAuth handoff confirms actual account identity", () => {
  it("does not navigate to private projects when broker success did not install a session", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByText("Sign-in could not be confirmed. Please try again.");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("enters private projects only after revalidated identity", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/beta", replace: true }),
    );
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
  it("leaves full-page provider redirects to the broker without premature private navigation", async () => {
    mocks.oauth.mockResolvedValue({ redirected: true });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Lovable" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue with Lovable" })).toBeEnabled(),
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("optional two-step sign-in at sign-in", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "member-a" } }, error: null });
  });
  it("asks accounts with two-step on for their code before opening any page", async () => {
    // The stored session says nothing about factors; the fresh server list does.
    mocks.factors.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "verified" }], all: [] },
      error: null,
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("textbox", { name: "6-digit authenticator code" });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("does not stop accounts that never turned it on", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/beta", replace: true }),
    );
  });
  it("stays put with a retry when the check itself fails", async () => {
    mocks.aal.mockResolvedValue({ data: null, error: { message: "offline" } });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("button", { name: "Try again" });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("one account per identity", () => {
  it("a returning Google sign-in reuses the account and never signs up", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.oauth).toHaveBeenCalledWith("google", expect.anything());
  });
  it("a returning owner with two-step on is asked for the code, not shown a new-account flow", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
    mocks.factors.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "verified" }], all: [] },
      error: null,
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("heading", { name: "Enter your code" });
    expect(screen.queryByText(/Create your account/)).toBeNull();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("a sign-up with an email that already has an account signs nobody in and says no second account is made", async () => {
    // The provider answers an existing email with no session and no identities.
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "obfuscated", identities: [] }, session: null },
      error: null,
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@fixture.invalid" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: "a-long-password-123" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept private beta data storage" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /You are not signed in yet.*no second account is made/,
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.aal).not.toHaveBeenCalled();
  });
});
