import { describe, expect, it } from "vitest";
import { CORE } from "./core";
import { IMPLEMENTATIONS, type ImplementationId } from "./impl";
import {
  ancestors,
  compare,
  exampleProblem,
  packageProblem,
  relationProblem,
  search,
  validateLibrary,
} from "./model";

const cites = new Map(CORE.citations.map((c) => [c.id, c]));
const modern = CORE.examples.filter((e) => e.runnable === "local_test");

describe("curated core", () => {
  it("is internally consistent: every record cited, every claim backed", () => {
    expect(validateLibrary(CORE)).toEqual([]);
  });
  it("stores no code for link-only licenses and never runs historical code locally", () => {
    for (const e of CORE.examples) {
      if (e.license !== "project-owned") expect(e.code).toBeNull();
      if (e.role === "historical") expect(e.runnable).not.toBe("local_test");
    }
  });
});

describe("evidence rules", () => {
  it("refuses an uncited derivation claim", () => {
    expect(
      relationProblem(
        {
          from: "python",
          to: "c",
          relation: "derived_from",
          confidence: "documented",
          statement: "made-up claim here",
          citations: [],
        },
        cites,
      ),
    ).toContain("citation");
  });
  it("refuses dressing a similarity up as ancestry", () => {
    expect(
      relationProblem(
        {
          from: "python",
          to: "c",
          relation: "derived_from",
          confidence: "conceptual",
          statement: "they look alike a bit",
          citations: ["python-faq"],
        },
        cites,
      ),
    ).toContain("conceptually similar");
    expect(
      relationProblem(
        {
          from: "a1",
          to: "b1",
          relation: "conceptually_similar",
          confidence: "documented",
          statement: "they look alike a bit",
          citations: [],
        },
        cites,
      ),
    ).toContain("never a derivation");
  });
  it("needs a primary source or standard for documented claims", () => {
    expect(
      relationProblem(
        {
          from: "crc-32",
          to: "c",
          relation: "derived_from",
          confidence: "documented",
          statement: "secondary source only",
          citations: ["reveng-crc32"],
        },
        cites,
      ),
    ).toContain("primary");
  });
  it("keeps code under other licenses link-only", () => {
    expect(exampleProblem({ ...CORE.examples[2]!, license: "GPL-3.0-only" })).toContain(
      "link-only",
    );
  });
});

describe("search and lineage", () => {
  it("finds by capability, kind and era", () => {
    expect(
      search(CORE, { capability: "error-detection" })
        .map((e) => e.id)
        .sort(),
    ).toEqual(["crc-32", "internet-checksum"]);
    expect(search(CORE, { kind: "language", eraTo: 1960 }).map((e) => e.id)).toEqual([
      "fortran",
      "algol-60",
    ]);
    expect(search(CORE, { text: "BCPL" }).map((e) => e.id)).toContain("bcpl");
  });
  it("proven ancestry follows only documented derivations", () => {
    expect(ancestors(CORE, "cpp", true).map((a) => a.id)).toEqual(["c", "b", "bcpl"]);
    expect(ancestors(CORE, "cpp", false).map((a) => a.id)).toContain("simula");
    expect(ancestors(CORE, "internet-checksum", false)).toEqual([]); // similarity is not ancestry
    expect(ancestors(CORE, "python", true)).toEqual([]); // attributed influence is not proven ancestry
  });
});

describe("comparison tests (modern code written in this repository only)", () => {
  it.each(modern.map((e) => [e.id, e] as const))(
    "%s passes every vector for its record",
    (_id, ex) => {
      const r = compare(
        ex.entry,
        ex.implementation!,
        IMPLEMENTATIONS[ex.implementation as ImplementationId],
        CORE.vectors,
      );
      expect(r.total).toBeGreaterThan(0);
      expect(r.failures).toEqual([]);
    },
  );
  it("the stored code text behaves exactly like the compiled implementation", () => {
    for (const ex of modern) {
      const name = ex.implementation!;
      const fromText = new Function(`${ex.code}\nreturn ${name};`)() as (s: string) => string;
      const inputs = CORE.vectors.filter((v) => v.entry === ex.entry).map((v) => v.input);
      for (const i of inputs)
        expect(fromText(i)).toBe(IMPLEMENTATIONS[name as ImplementationId](i));
    }
  });
  it("matches the platform's own Base64 on varied input", () => {
    for (const s of ["", "a", "héllo wörld", "€𝄞", "x".repeat(97)])
      expect(IMPLEMENTATIONS.base64Encode(s)).toBe(Buffer.from(s, "utf8").toString("base64"));
  });
  it("catches a deliberately wrong implementation", () => {
    const r = compare("crc-32", "broken", (s) => IMPLEMENTATIONS.crc32(s + " "), CORE.vectors);
    expect(r.failures.length).toBeGreaterThan(0);
  });
  it("RFC 1071 checksum is the complement of the published sum", () => {
    expect(IMPLEMENTATIONS.internetChecksum("00 01 f2 03 f4 f5 f6 f7")).toBe("220d");
  });
});

describe("Jackboy packaging eligibility (held; nothing is sent)", () => {
  const ex = (id: string) => CORE.examples.find((e) => e.id === id)!;
  const run = (id: string) =>
    compare(
      ex(id).entry,
      id,
      IMPLEMENTATIONS[ex(id).implementation as ImplementationId],
      CORE.vectors,
    );
  it("allows a repository-owned component that passes published vectors", () => {
    expect(packageProblem(CORE, ex("base64-ts"), run("base64-ts"))).toBeNull();
  });
  it("refuses a component with only self-derived vectors", () => {
    expect(packageProblem(CORE, ex("gcd-ts"), run("gcd-ts"))).toContain("published");
  });
  it("refuses historical or link-only material", () => {
    expect(
      packageProblem(CORE, ex("rfc1071-c"), {
        entry: "internet-checksum",
        implementation: "x",
        passed: 1,
        total: 1,
        failures: [],
      }),
    ).not.toBeNull();
  });
});
