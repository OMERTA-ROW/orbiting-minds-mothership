import { describe, expect, it } from "vitest";
import { NAV_STATUS, advancedItems, navGroups, navItems } from "@/components/nav-groups";

// Every page the old flat menu linked to must stay reachable after simplification.
const OLD_MENU = [
  "/", "/launch-control", "/beta", "/beta-omni", "/mothership", "/command-nexus", "/omnibridge", "/omni",
  "/omni-marketing", "/omni-gateway", "/omni-agents", "/omni-models", "/omni-api-keys", "/omni-terminal",
  "/omni-dock", "/activation-approvals", "/omni-razul", "/angel-tech", "/omni-rights", "/omni-legal",
  "/entertainment", "/cartoon-galaxy", "/pathway", "/code-exchange", "/code-vault", "/commons", "/pulse",
  "/challenges", "/open-call", "/embassy", "/agent-lounge", "/incident-archives", "/agent-debrief",
  "/guardian-incidents", "/report-incident", "/sdk", "/discovery", "/digital-twin", "/robotics",
  "/physical-safety", "/experiment-replay", "/approval-ledger", "/impact-scorecard", "/trust", "/marketplace",
  "/compute-grid", "/releases", "/care", "/updates", "/pilot", "/voice", "/care-agent", "/universe",
  "/platform", "/knowledge-fusion", "/guardian", "/devices", "/fleet", "/security-report", "/agents",
  "/sandbox", "/roadmap", "/partnerships", "/dashboard", "/arena", "/knowledge-brief",
];

describe("grouped navigation", () => {
  it("keeps every page from the old menu reachable", () => {
    const paths = new Set(navItems.map((n) => n.to));
    expect(OLD_MENU.filter((p) => !paths.has(p as never))).toEqual([]);
  });
  it("lists each page once", () => {
    const all = navItems.map((n) => n.to);
    expect(new Set(all).size).toBe(all.length);
  });
  it("uses the requested main groups", () => {
    expect(navGroups.map((g) => g.label)).toEqual(["Projects", "Agents", "Approvals", "Connections", "Settings"]);
  });
  it("marks owner-gated pages as owner only", () => {
    const status = Object.fromEntries(navGroups.flatMap((g) => g.items.map((i) => [i.to, i.status])));
    for (const p of ["/omni-terminal", "/omni-dock", "/omni-api-keys", "/activation-approvals", "/members"])
      expect(status[p]).toBe("owner");
  });
  it("never labels a blocked connection as working", () => {
    const status = Object.fromEntries(navGroups.flatMap((g) => g.items.map((i) => [i.to, i.status])));
    expect(status["/omni-gateway"]).toBe("off");
    expect(status["/platform"]).toBe("off");
  });
  it("keeps demo labels on advanced demo pages", () => {
    expect(advancedItems.find((i) => i.to === "/dashboard")?.label).toBe("Demo Dashboard");
    expect(NAV_STATUS.demo.help).toBe("Simulated example. Nothing real happens.");
  });
});
