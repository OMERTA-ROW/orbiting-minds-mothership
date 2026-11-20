/**
 * Site-wide link and destination contract: every internal link in the source resolves to a real
 * route file, the menu lists no retired area, there are no placeholder links, and every
 * hard-coded own/partner origin is one of the registered destinations. Jackboy, runner and
 * executor hosts come only from server settings, never from source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { navItems } from "@/components/nav-groups";
import { retiredArea } from "@/lib/retired-areas";
import { SITE_URL } from "@/lib/seo";
import { DELEGATION_CLIENT } from "@/lib/omni-delegation";
import { DOCK_BROWSER_ORIGINS } from "@/lib/omni-dock";
import { LIVE_ORIGIN } from "@/lib/approval-flow-build";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "test" ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name) && !p.includes("routeTree")
      ? [p]
      : [];
  });
}
const SOURCES = files("src").filter((f) => !f.startsWith(join("src", "integrations")));
const read = (f: string) => readFileSync(f, "utf8");

const ROUTES = new Set(
  files(join("src", "routes")).flatMap((f) => {
    const m = /createFileRoute\(\s*["']([^"']+)["']/.exec(read(f));
    return m?.[1] ? [m[1].replace("/_authenticated", "").replace(/\/$/, "") || "/"] : [];
  }),
);
const PATTERNS = [...ROUTES].map(
  (r) => new RegExp(`^${r.replace(/\$[A-Za-z_]+/g, "[^/]+").replace(/\/\$$/, "/.*")}$`),
);
const resolves = (path: string) => {
  const p = path.split(/[?#]/)[0]!.replace(/\/$/, "") || "/";
  return ROUTES.has(p) || PATTERNS.some((re) => re.test(p));
};
const STATIC = new Set(["/favicon.svg", "/og-home.jpg", "/robots.txt"]);

describe("internal links", () => {
  it("finds the site's route files", () => {
    expect(ROUTES.has("/")).toBe(true);
    expect(ROUTES.has("/omni-authorize")).toBe(true);
    expect(ROUTES.has("/api/omni/manifest")).toBe(true);
  });

  it("every internal link in the source opens a real page", () => {
    const broken: string[] = [];
    const LINK = /(?:\bto|href|redirectTo)\s*[:=]\s*\{?\s*["'`](\/[^"'`$\s{]*)["'`]/g;
    for (const f of SOURCES) {
      const s = read(f);
      for (const m of s.matchAll(LINK)) {
        const path = m[1]!;
        if (path.startsWith("//") || STATIC.has(path)) continue;
        if (!resolves(path)) broken.push(`${f}: ${path}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("every menu item opens a working page, never a retired one", () => {
    for (const item of navItems) {
      expect(resolves(item.to), item.to).toBe(true);
      expect(retiredArea(item.to), item.to).toBeUndefined();
    }
  });

  it("there are no placeholder links or do-nothing click handlers", () => {
    const bad: string[] = [];
    const PLACEHOLDER =
      /href=\{?["']#["']|href=["']javascript:|onClick=\{\s*\(\)\s*=>\s*(\{\s*\}|undefined|null)\s*\}/g;
    for (const f of SOURCES)
      for (const m of read(f).matchAll(PLACEHOLDER)) bad.push(`${f}: ${m[0]}`);
    expect(bad).toEqual([]);
  });
});

describe("registered destinations", () => {
  it("evoomni.tech is the canonical site", () => {
    expect(SITE_URL).toBe("https://evoomni.tech");
    expect(LIVE_ORIGIN).toBe("https://evoomni.tech");
  });

  it("OMNI web is the production origin with the exact /mothership/callback", () => {
    expect(DELEGATION_CLIENT.origin).toBe("https://omni-orbit-command-companion.lovable.app");
    expect(DELEGATION_CLIENT.redirectUri).toBe(
      "https://omni-orbit-command-companion.lovable.app/mothership/callback",
    );
  });

  it("only Honeycomb Terminal's published and preview sites may call the Docking Bay", () => {
    expect([...DOCK_BROWSER_ORIGINS]).toEqual([
      "https://honeycomb-terminal-companion.lovable.app",
      "https://id-preview--f5dd4092-07a4-4e53-bf40-35c167b9eaac.lovable.app",
    ]);
  });

  it("no unregistered Lovable-hosted origin is written into the source", () => {
    const allowed = new Set([
      "https://orbiting-minds-mothership.lovable.app",
      "https://id-preview--f02f1b04-6f4d-4d33-bd52-d2d44971db21.lovable.app",
      "https://omni-orbit-command-companion.lovable.app",
      "https://honeycomb-terminal-companion.lovable.app",
      "https://id-preview--f5dd4092-07a4-4e53-bf40-35c167b9eaac.lovable.app",
    ]);
    const found = new Set<string>();
    for (const f of SOURCES)
      for (const m of read(f).matchAll(/https:\/\/[a-z0-9-]+(?:--[a-z0-9-]+)?\.lovable\.app/g))
        found.add(m[0]);
    expect([...found].filter((o) => !allowed.has(o))).toEqual([]);
  });

  it("Jackboy, runner and executor hosts are never hard-coded", () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      const s = read(f);
      if (
        /https?:\/\/(?:[a-z0-9-]*jackboy[a-z0-9-]*\.[a-z.]+|[a-z0-9.-]+\.up\.railway\.app|[a-z0-9.-]+\.vultr(?:usercontent)?\.com|\d{1,3}(?:\.\d{1,3}){3})/i.test(
          s,
        )
      )
        hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});
