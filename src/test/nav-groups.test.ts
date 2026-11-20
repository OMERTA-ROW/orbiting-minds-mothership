import { describe, expect, it } from "vitest";
import { NAV_STATUS, navGroups, navItems } from "@/components/nav-groups";
import { retiredArea, retiredAreas, savedBrowserRecords } from "@/lib/retired-areas";

// Every page the old flat menu linked to is either in the menu or an honest "not connected" page.
const OLD_MENU = [
  "/",
  "/launch-control",
  "/beta",
  "/beta-omni",
  "/mothership",
  "/command-nexus",
  "/omnibridge",
  "/omni",
  "/omni-marketing",
  "/omni-gateway",
  "/omni-agents",
  "/omni-models",
  "/omni-api-keys",
  "/omni-terminal",
  "/omni-dock",
  "/activation-approvals",
  "/omni-razul",
  "/angel-tech",
  "/omni-rights",
  "/omni-legal",
  "/entertainment",
  "/cartoon-galaxy",
  "/pathway",
  "/code-exchange",
  "/code-vault",
  "/commons",
  "/pulse",
  "/challenges",
  "/open-call",
  "/embassy",
  "/agent-lounge",
  "/incident-archives",
  "/agent-debrief",
  "/guardian-incidents",
  "/report-incident",
  "/sdk",
  "/discovery",
  "/digital-twin",
  "/robotics",
  "/physical-safety",
  "/experiment-replay",
  "/approval-ledger",
  "/impact-scorecard",
  "/trust",
  "/marketplace",
  "/compute-grid",
  "/releases",
  "/care",
  "/updates",
  "/pilot",
  "/voice",
  "/care-agent",
  "/universe",
  "/platform",
  "/knowledge-fusion",
  "/guardian",
  "/devices",
  "/fleet",
  "/security-report",
  "/agents",
  "/sandbox",
  "/roadmap",
  "/partnerships",
  "/dashboard",
  "/arena",
  "/knowledge-brief",
];

describe("grouped navigation", () => {
  it("accounts for every page from the old menu", () => {
    const paths = new Set<string>(navItems.map((n) => n.to));
    expect(OLD_MENU.filter((p) => !paths.has(p) && !retiredArea(p))).toEqual([]);
  });
  it("lists each page once", () => {
    const all = navItems.map((n) => n.to);
    expect(new Set(all).size).toBe(all.length);
  });
  it("uses the requested main groups", () => {
    expect(navGroups.map((g) => g.label)).toEqual([
      "Projects",
      "Agents",
      "Mothership",
      "Approvals",
      "Connections",
      "Settings",
    ]);
  });
  it("marks owner-gated pages as owner only", () => {
    const status = Object.fromEntries(
      navGroups.flatMap((g) => g.items.map((i) => [i.to, i.status])),
    );
    for (const p of [
      "/omni-terminal",
      "/omni-dock",
      "/omni-api-keys",
      "/activation-approvals",
      "/members",
      "/treasury",
    ])
      expect(status[p]).toBe("owner");
  });
  it("never labels a blocked connection as working", () => {
    const status = Object.fromEntries(
      navGroups.flatMap((g) => g.items.map((i) => [i.to, i.status])),
    );
    expect(status["/platform"]).toBe("off");
  });
  it("has no demo badge", () => {
    expect(Object.keys(NAV_STATUS)).not.toContain("demo");
  });
});

import { memberErrorMessage, splitInvitations } from "@/lib/invitations";

describe("demo mode is removed", () => {
  it("former demo pages and their detail pages show a not-connected entry", () => {
    for (const p of ["/omni", "/dashboard", "/arena", "/robotics/abc", "/join", "/omni-models"])
      expect(retiredArea(p)).toBeDefined();
  });
  it("working pages are never treated as retired", () => {
    for (const p of [
      "/",
      "/beta",
      "/beta-omni",
      "/members",
      "/omni-terminal",
      "/omni-dock",
      "/omni-api-keys",
      "/activation-approvals",
      "/treasury",
      "/account-security",
      "/invite",
    ])
      expect(retiredArea(p)).toBeUndefined();
  });
  it("menu and search list no retired page", () => {
    expect(navItems.filter((n) => retiredArea(n.to))).toEqual([]);
  });
  it("every 'use instead' link points to a working menu page or sign-in", () => {
    const paths = new Set<string>([...navItems.map((n) => n.to), "/auth"]);
    for (const a of retiredAreas) if ("instead" in a) expect(paths.has(a.instead.to)).toBe(true);
  });
  it("saved browser records exclude sign-in data", () => {
    const data: Record<string, string> = {
      "evolution.razul.v1": "{}",
      "evo.pending-invite": "x",
      "omni.signin-return": "/",
      "sb-abc-auth-token": "secret",
      "evolution-password-recovery": "1",
    };
    const keys = Object.keys(data);
    const storage = {
      length: keys.length,
      key: (i: number) => keys[i] ?? null,
      getItem: (k: string) => data[k] ?? null,
    };
    expect(Object.keys(savedBrowserRecords(storage))).toEqual(["evolution.razul.v1"]);
  });
});

describe("invitation lists", () => {
  const base = {
    expires_at: "2030-01-01T00:00:00Z",
    revoked_at: null,
    accepted_at: null,
    declined_at: null,
  };
  it("revoked, declined, used and expired invitations leave the active list", () => {
    const now = new Date("2029-01-01T00:00:00Z");
    const { active, history } = splitInvitations(
      [
        { ...base },
        { ...base, revoked_at: "x" },
        { ...base, declined_at: "x" },
        { ...base, accepted_at: "x" },
        { ...base, expires_at: "2028-01-01T00:00:00Z" },
      ],
      now,
    );
    expect(active.length).toBe(1);
    expect(history.map((h) => h.status)).toEqual(["revoked", "declined", "used", "expired"]);
  });
  it("explains a revoke that lost the race to acceptance", () => {
    expect(memberErrorMessage("Invitation already accepted; remove the member instead")).toBe(
      "This invitation was already accepted. Remove the member instead if needed.",
    );
  });
  it("explains a repeated removal", () => {
    expect(memberErrorMessage("Not a member (already removed)")).toBe(
      "This person was already removed.",
    );
  });
});
