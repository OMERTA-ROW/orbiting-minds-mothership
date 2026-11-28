import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({
  search: { repoProvider: "forgejo", repoName: "omniblock/first", repoPage: 1 },
  read: vi.fn(),
  inventory: vi.fn(),
  diagnosis: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  getRouteApi: () => ({ useSearch: () => seam.search }),
  useNavigate: () => seam.navigate,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-account", () => ({
  useAccount: () => ({ ready: true, user: { id: "test-owner" } }),
}));
vi.mock("@/lib/repository-features.functions", () => ({
  readRepositoryFeatures: seam.read,
  readFeatureInventory: seam.inventory,
  readAccessDiagnosis: seam.diagnosis,
}));
import { RepositoryFeatures } from "./RepositoryFeatures";

beforeEach(() => {
  vi.clearAllMocks();
  seam.search = { repoProvider: "forgejo", repoName: "omniblock/first", repoPage: 1 };
  seam.inventory.mockResolvedValue({
    state: "connected",
    checkedAt: "2026-11-28T09:00:00Z",
    truncated: false,
    repos: [
      { id: 1, name: "omniblock/first", private: true },
      { id: 2, name: "omniblock/second", private: true },
    ],
  });
  seam.diagnosis.mockResolvedValue({
    assurance: "aal2",
    owner: true,
    forgejoRoutes: ["branches", "tags"],
    writes: "Unavailable",
  });
  seam.read.mockImplementation(async ({ data }: { data: { repo: string } }) => ({
    state: "read",
    rows: [
      {
        id: data.repo,
        name: data.repo + " record",
        status: "Not reported",
        updated: "Not reported",
      },
    ],
    hasNext: false,
    checkedAt: "2026-11-28T09:00:00Z",
  }));
});
afterEach(cleanup);

describe("Repository feature UI — synthetic auth and gateway fixtures, not live evidence", () => {
  function mount(feature: "branches" | "tags" = "branches") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = () => (
      <QueryClientProvider client={client}>
        <RepositoryFeatures feature={feature} />
      </QueryClientProvider>
    );
    const rendered = render(view());
    return { ...rendered, update: () => rendered.rerender(view()) };
  }
  it("automatically reads the selected authorized repository without a read click", async () => {
    mount();
    await waitFor(() =>
      expect(seam.read).toHaveBeenCalledWith({
        data: {
          repo: "omniblock/first",
          provider: "forgejo",
          feature: "branches",
          page: 1,
          search: "",
        },
      }),
    );
    expect(await screen.findByText("omniblock/first record")).toBeInTheDocument();
  });
  it("switches query identity and removes previous repository records", async () => {
    const view = mount();
    await screen.findByText("omniblock/first record");
    act(() => {
      seam.search.repoName = "omniblock/second";
      view.update();
    });
    expect(await screen.findByText("omniblock/second record")).toBeInTheDocument();
    expect(screen.queryByText("omniblock/first record")).not.toBeInTheDocument();
  });
  it("reads the selected page for Tags and refuses a repository absent from inventory", async () => {
    seam.search.repoPage = 2;
    const view = mount("tags");
    await waitFor(() =>
      expect(seam.read).toHaveBeenCalledWith({
        data: {
          repo: "omniblock/first",
          provider: "forgejo",
          feature: "tags",
          page: 2,
          search: "",
        },
      }),
    );
    seam.read.mockClear();
    act(() => {
      seam.search.repoName = "omniblock/not-authorized";
      view.update();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("not in the current authorized");
    expect(seam.read).not.toHaveBeenCalled();
  });
});
