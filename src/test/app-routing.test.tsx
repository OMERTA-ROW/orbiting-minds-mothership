import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    "/mothership", "/universe", "/platform", "/knowledge-fusion", "/guardian",
    "/robotics", "/open-call", "/incident-archives", "/agent-debrief",
    "/physical-safety", "/experiment-replay", "/approval-ledger", "/impact-scorecard",
    "/code-vault", "/agent-lounge",
    "/command-nexus", "/omnibridge", "/entertainment",
    "/agents", "/sandbox", "/roadmap", "/partnerships", "/dashboard", "/join", "/pathway", "/code-exchange", "/commons", "/pulse",
    "/challenges", "/embassy", "/sdk", "/discovery", "/digital-twin", "/trust", "/marketplace", "/compute-grid", "/releases", "/care", "/updates", "/pilot", "/voice", "/care-agent", "/devices", "/fleet", "/security-report",
  ])("preserves the existing %s page", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes(path);
    expect(matches.at(-1)?.routeId).toBe(path);
  });
  it("opens a contribution detail independently of the feed", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/code-exchange/sandbox-transfer").at(-1)?.routeId).toBe("/code-exchange_/$id");
  });
  it.each([["/challenges/challenge-focus", "/challenges_/$id"], ["/capsules/local-example", "/capsules_/$id"]])("matches Genesis detail %s independently", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(routeId);
  });
  it("matches robotics detail without nesting it in the catalog", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/robotics/rover-safe-stop").at(-1)?.routeId).toBe("/robotics_/$id");
  });
  it("matches an incident case file without nesting it in the archive", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/incident-archives/empty-list-encore").at(-1)?.routeId).toBe("/incident-archives_/$id");
  });
});
