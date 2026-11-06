import { describe, expect, it } from "vitest";
import { seo } from "@/lib/seo";
import { Route as HomeRoute } from "@/routes/index";
import { Route as BetaRoute } from "@/routes/_authenticated/beta";

type Head = { meta: Array<Record<string, string>>; links?: Array<Record<string, string>> };
const headOf = (route: { options: { head?: unknown } }) =>
  (route.options.head as (ctx: unknown) => Head)({});
const metaValue = (head: Head, key: string) =>
  head.meta.find((m) => m["name"] === key || m["property"] === key)?.["content"];

describe("Owner-approved search indexing", () => {
  it("permits indexing only when explicitly approved", () => {
    expect(metaValue(seo("a", "b", { indexable: true }), "robots")).toBe("index, follow");
  });

  it("keeps pages excluded by default", () => {
    expect(metaValue(seo("a", "b"), "robots")).toBe("noindex");
    expect(metaValue(seo("a", "b", { indexable: false }), "robots")).toBe("noindex");
  });

  it("homepage is indexable", () => {
    expect(metaValue(headOf(HomeRoute), "robots")).toBe("index, follow");
  });

  it("beta page stays excluded from search", () => {
    expect(metaValue(headOf(BetaRoute), "robots")).toBe("noindex");
  });
});

describe("Homepage social preview", () => {
  const head = headOf(HomeRoute);
  it("points canonical and og:url at the homepage", () => {
    expect(metaValue(head, "og:url")).toBe("https://evoomni.tech/");
    expect(head.links).toContainEqual({ rel: "canonical", href: "https://evoomni.tech/" });
  });
  it("uses the same absolute share image for Open Graph and X", () => {
    expect(metaValue(head, "og:image")).toBe("https://evoomni.tech/og-home.jpg");
    expect(metaValue(head, "twitter:image")).toBe("https://evoomni.tech/og-home.jpg");
    expect(metaValue(head, "twitter:card")).toBe("summary_large_image");
  });
});

import { searchPolicy } from "@/lib/search-policy";
import { Route as BetaOmniRoute } from "@/routes/_authenticated/beta-omni";
import { Route as QuantumRoute } from "@/routes/_authenticated/quantum-studio";
import { Route as KnowledgeRoute } from "@/routes/_authenticated/knowledge-brief";

describe("Search status panel policy matches page tags", () => {
  const heads: Record<string, Head> = {
    "/": headOf(HomeRoute),
    "/beta": headOf(BetaRoute),
    "/beta-omni": headOf(BetaOmniRoute),
    "/quantum-studio": headOf(QuantumRoute),
    "/knowledge-brief": headOf(KnowledgeRoute),
  };
  for (const entry of searchPolicy) {
    it(`${entry.path} matches its listed search status`, () => {
      expect(metaValue(heads[entry.path]!, "robots")).toBe(
        entry.indexable ? "index, follow" : "noindex",
      );
    });
  }
  it("only the homepage is indexable", () => {
    expect(searchPolicy.filter((entry) => entry.indexable).map((entry) => entry.path)).toEqual([
      "/",
    ]);
  });
});
