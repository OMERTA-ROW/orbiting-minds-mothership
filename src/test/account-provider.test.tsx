import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
  invalidate: vi.fn(),
  queries: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: mocks.getUser, onAuthStateChange: mocks.subscribe } },
}));
const router = { invalidate: mocks.invalidate, navigate: mocks.navigate };
const query = { cancelQueries: mocks.cancel, clear: mocks.clear, invalidateQueries: mocks.queries };
vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => query }));
import { AccountProvider, useAccount } from "@/hooks/use-account";
import { RECOVERY_HINT_KEY } from "@/lib/account-recovery";
let notify: (event: AuthChangeEvent, session: Session | null) => void;
const user = (id: string): User => ({
  id,
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-10-22",
});
const session = (id: string): Session => ({
  user: user(id),
  access_token: "synthetic-access",
  refresh_token: "synthetic-refresh",
  expires_in: 3600,
  token_type: "bearer",
});
const result = (id: string | null) => ({ data: { user: id ? user(id) : null }, error: null });
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  mocks.getUser.mockResolvedValue(result(null));
  mocks.cancel.mockResolvedValue(undefined);
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.queries.mockResolvedValue(undefined);
  mocks.navigate.mockResolvedValue(undefined);
  mocks.subscribe.mockImplementation((fn) => {
    notify = fn;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
describe("one account subscriber preserves identity and recovery transitions", () => {
  it("validates recovery identity before exposing the recovery form and clears it on completion", async () => {
    const h = renderHook(useAccount, { wrapper: AccountProvider });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    mocks.getUser.mockResolvedValue(result("owner-a"));
    act(() => notify("PASSWORD_RECOVERY", session("owner-a")));
    await waitFor(() => expect(h.result.current.recoveryUserId).toBe("owner-a"));
    expect(h.result.current.user?.id).toBe("owner-a");
    act(() => h.result.current.finishRecovery());
    act(() => notify("USER_UPDATED", session("owner-a")));
    await waitFor(() => expect(mocks.queries).toHaveBeenCalled());
    expect(h.result.current.recoveryUserId).toBeNull();
    expect(sessionStorage.getItem(RECOVERY_HINT_KEY)).toBeNull();
  });
  it("does not revalidate or invalidate private queries for same-user token refresh", async () => {
    mocks.getUser.mockResolvedValue(result("owner-a"));
    const h = renderHook(useAccount, { wrapper: AccountProvider });
    await waitFor(() => expect(h.result.current.user?.id).toBe("owner-a"));
    const checks = mocks.getUser.mock.calls.length;
    act(() => notify("TOKEN_REFRESHED", session("owner-a")));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getUser).toHaveBeenCalledTimes(checks);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.queries).not.toHaveBeenCalled();
  });
  it("recovers validated identity after an unavailable initial check and successful renewal", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("network unavailable"));
    const h = renderHook(useAccount, { wrapper: AccountProvider });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    expect(h.result.current.user).toBeNull();
    mocks.getUser.mockResolvedValue(result("owner-a"));
    act(() => notify("TOKEN_REFRESHED", session("owner-a")));
    await waitFor(() => expect(h.result.current.user?.id).toBe("owner-a"));
  });
  it("never restores an old identity when sign-out arrives during query cancellation", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.getUser.mockResolvedValue(result("owner-a"));
    mocks.cancel.mockReturnValueOnce(pending);
    const h = renderHook(useAccount, { wrapper: AccountProvider });
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
    act(() => notify("SIGNED_OUT", null));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }),
    );
    await act(async () => release());
    expect(h.result.current.user).toBeNull();
    expect(h.result.current.ready).toBe(true);
    expect(mocks.queries).not.toHaveBeenCalled();
  });
  it("handles a recovery event with blocked session storage using validated in-memory identity", async () => {
    const h = renderHook(useAccount, { wrapper: AccountProvider });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mocks.getUser.mockResolvedValue(result("owner-a"));
    act(() => notify("PASSWORD_RECOVERY", session("owner-a")));
    await waitFor(() => expect(h.result.current.recoveryUserId).toBe("owner-a"));
  });
});
