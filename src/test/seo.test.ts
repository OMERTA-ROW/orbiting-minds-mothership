import { describe, expect, it } from "vitest";
import { seo } from "@/lib/seo";

const indexingPolicy = (options?: { indexable?: boolean }) =>
  seo("Evolution page", "Evolution description", options).meta.find((entry) => entry.name === "robots")?.content;

describe("Owner-approved search indexing", () => {
  it("permits indexing only when explicitly approved", () => {
    expect(indexingPolicy({ indexable: true })).toBe("index, follow");
  });

  it("keeps private and beta pages excluded by default", () => {
    expect(indexingPolicy()).toBe("noindex");
    expect(indexingPolicy({ indexable: false })).toBe("noindex");
  });
});