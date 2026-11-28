import { describe, expect, it } from "vitest";
import { auditMirrors, compareEvidence, type AuditRead, type RepoEvidence } from "./forgejo-audit";
const id = "a".repeat(40),
  other = "b".repeat(40);
const e = (): RepoEvidence => ({
  name: "o/r",
  defaultBranch: "main",
  private: true,
  head: id,
  branches: { main: id },
  tags: { v1: id },
  errors: [],
});
const read =
  (provider: "forgejo" | "github", change?: string): AuditRead =>
  async (path) => {
    if (path.startsWith("/api/v1/user/repos") || path.startsWith("/orgs/"))
      return {
        status: 200,
        body: Array.from({ length: 38 }, (_, i) => ({
          full_name: `${provider === "github" ? "OMERTA-ROW" : "local"}/r${i}`,
          default_branch: "main",
          private: true,
        })),
      };
    if (path.includes("/branches"))
      return { status: 200, body: [{ name: "main", commit: { sha: change ?? id } }] };
    if (path.includes("/tags")) return { status: 200, body: [{ name: "v1", commit: { sha: id } }] };
    return {
      status: 200,
      body: {
        full_name: "local/r",
        default_branch: "main",
        private: true,
        original_url: `https://github.com/OMERTA-ROW/${path.split("/").pop()}.git`,
      },
    };
  };
describe("read-only mirror integrity logic (synthetic fixtures)", () => {
  it("compares all 38 mapped mirrors and refs", async () => {
    const r = await auditMirrors(read("forgejo"), read("github"));
    expect(r.rows.length).toBe(38);
    expect(r.complete).toBe(true);
    expect(r.rows.every((x) => x.status === "equal")).toBe(true);
    expect(r.syncEvidence).toBe("host_check_required");
    expect(r.recoveryEvidence).toBe("isolated_restore_required");
  });
  it("reports default head divergence without claiming ancestry or stale age", async () => {
    const r = await auditMirrors(read("forgejo"), read("github", other));
    expect(r.complete).toBe(false);
    expect(r.rows[0]?.discrepancies).toContain("default_head_differs_staleness_unproven");
  });
  it("detects missing branch and tag refs", () => {
    const r = e();
    r.branches = {};
    r.tags = { v2: other };
    expect(compareEvidence(e(), r)).toContain("branches:main:missing_upstream");
    expect(compareEvidence(e(), r)).toContain("tags:v2:missing_forgejo");
  });
  it("detects default branch and privacy discrepancies", () => {
    const r = e();
    r.defaultBranch = "develop";
    expect(compareEvidence({ ...e(), private: false }, r)).toContain("forgejo_not_private");
    expect(compareEvidence(e(), r)).toContain("default_branch_differs");
  });
  it("does not report incomplete ref reads as equality", async () => {
    const good = read("forgejo");
    const f: AuditRead = async (p) =>
      p.includes("/branches") ? { status: 403, body: null } : good(p);
    const r = await auditMirrors(f, read("github"));
    expect(r.rows[0]?.status).toBe("unverified");
    expect(r.complete).toBe(false);
  });
  it("fails closed on inventory denial and redacts provider bodies", async () => {
    const r = await auditMirrors(async () => ({ status: 403, body: "sensitive" }), read("github"));
    expect(r.errors).toEqual(["forgejo_inventory_unverified", "HTTP_403"]);
    expect(JSON.stringify(r)).not.toContain("sensitive");
  });
  it("reports absent upstream mapping", async () => {
    const r = await auditMirrors(read("forgejo"), async () => ({ status: 200, body: [] }));
    expect(r.rows[0]?.status).toBe("missing_upstream");
    expect(r.complete).toBe(false);
  });
  it("rejects malformed inventory instead of inventing rows", async () => {
    const r = await auditMirrors(read("forgejo"), async () => ({
      status: 200,
      body: { message: "secret" },
    }));
    expect(r.errors).toContain("github_inventory_unverified");
    expect(r.rows).toEqual([]);
  });
  it("bounds pagination and refuses truncated inventory", async () => {
    let count = 0;
    const r = await auditMirrors(async () => {
      count++;
      return {
        status: 200,
        body: Array.from({ length: 50 }, () => ({
          full_name: "o/r",
          default_branch: "main",
          private: true,
        })),
      };
    }, read("github"));
    expect(count).toBe(20);
    expect(r.complete).toBe(false);
  });
  it("does not fetch unsafe mapped names", async () => {
    let detail = 0;
    const f: AuditRead = async (p) => {
      if (p.includes("/user/repos"))
        return {
          status: 200,
          body: [{ full_name: "bad/../r", default_branch: "main", private: true }],
        };
      detail++;
      return { status: 200, body: null };
    };
    const r = await auditMirrors(f, read("github"));
    expect(detail).toBe(0);
    expect(r.complete).toBe(false);
  });
  it("does not treat a name candidate as verified source mapping", async () => {
    const good = read("forgejo");
    const f: AuditRead = async (path) => {
      const reply = await good(path);
      if (!path.includes("?") && !path.endsWith("branches") && !path.endsWith("tags"))
        return {
          status: 200,
          body: { full_name: "local/r", default_branch: "main", private: true },
        };
      return reply;
    };
    const r = await auditMirrors(f, read("github"));
    expect(r.complete).toBe(false);
    expect(r.rows[0]?.discrepancies).toContain(
      "forgejo:source_mapping_unverified_name_candidate_only",
    );
  });
});
