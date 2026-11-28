import { z } from "zod";

export type AuditRead = (path: string) => Promise<{ status: number; body: unknown }>;
const namePart = /^[A-Za-z0-9_.-]+$/;
const sha = z.string().regex(/^[a-f0-9]{40,64}$/i);
const repository = z.object({
  full_name: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
  original_url: z.string().optional(),
});
const branch = z.object({
  name: z.string(),
  commit: z.object({ sha: sha.optional(), id: sha.optional() }),
});
const tag = z.object({
  name: z.string(),
  commit: z.object({ sha: sha.optional(), id: sha.optional() }),
});
export type RepoEvidence = {
  name: string;
  defaultBranch: string;
  private: boolean;
  head: string | null;
  branches: Record<string, string>;
  tags: Record<string, string>;
  errors: string[];
  sourceRepository?: string | null;
};
export type IntegrityRow = {
  forgejo: string;
  upstream: string | null;
  status: "equal" | "discrepant" | "unverified" | "missing_upstream" | "ambiguous_mapping";
  discrepancies: string[];
  local: RepoEvidence | null;
  remote: RepoEvidence | null;
};
export type IntegrityAudit = {
  checkedAt: string;
  completedAt: string;
  expectedMirrors: number;
  forgejoCount: number;
  upstreamCount: number;
  complete: boolean;
  rows: IntegrityRow[];
  upstreamWithoutMirror: string[];
  errors: string[];
  syncEvidence: "host_check_required";
  recoveryEvidence: "isolated_restore_required";
};
function safeName(name: string) {
  const parts = name.split("/");
  return parts.length === 2 && parts.every((p) => namePart.test(p) && p !== "." && p !== "..");
}
function errorCode(error: unknown) {
  return error instanceof Error && /^HTTP \d{3}$/.test(error.message)
    ? error.message.replace(" ", "_")
    : "invalid_or_incomplete_reply";
}
function sourceRepository(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const name = u.pathname.replace(/^\//, "").replace(/\.git$/, "");
    return u.protocol === "https:" &&
      u.hostname === "github.com" &&
      !u.port &&
      !u.search &&
      !u.hash &&
      safeName(name) &&
      name.toLowerCase().startsWith("omerta-row/")
      ? name
      : null;
  } catch {
    return null;
  }
}
async function list(read: AuditRead, path: string, size: number) {
  const items: unknown[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await read(`${path}?page=${page}&${size === 100 ? "per_page" : "limit"}=${size}`);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    if (!Array.isArray(r.body)) throw new Error("invalid_shape");
    items.push(...r.body);
    if (r.body.length < size) return items;
  }
  throw new Error("pagination_incomplete");
}
async function evidence(
  read: AuditRead,
  name: string,
  provider: "forgejo" | "github",
): Promise<RepoEvidence> {
  if (!safeName(name)) throw new Error("invalid_mapping");
  const prefix = provider === "forgejo" ? "/api/v1/repos/" : "/repos/";
  const path = prefix + name.split("/").map(encodeURIComponent).join("/");
  const result = await read(path);
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
  const meta = repository.parse(result.body);
  const e: RepoEvidence = {
    name,
    defaultBranch: meta.default_branch,
    private: meta.private,
    head: null,
    branches: {},
    tags: {},
    errors: [],
    sourceRepository: provider === "forgejo" ? sourceRepository(meta.original_url) : null,
  };
  for (const kind of ["branches", "tags"] as const) {
    try {
      const refs = await list(read, `${path}/${kind}`, provider === "github" ? 100 : 50);
      for (const item of refs) {
        const ref = (kind === "branches" ? branch : tag).parse(item);
        const id = ref.commit.sha ?? ref.commit.id;
        if (!id) throw new Error("missing_sha");
        // Do not accept arbitrary provider names into returned evidence.
        if (!/^[A-Za-z0-9_./-]{1,255}$/.test(ref.name)) throw new Error("invalid_ref_name");
        Object.defineProperty(e[kind], ref.name, {
          value: id.toLowerCase(),
          enumerable: true,
          configurable: true,
        });
      }
    } catch (error) {
      e.errors.push(`${kind}_unverified`);
      e.errors.push(`${kind}:${errorCode(error)}`);
    }
  }
  e.head = e.branches[e.defaultBranch] ?? null;
  if (!e.head) e.errors.push("default_head_unverified");
  return e;
}
export function compareEvidence(local: RepoEvidence, remote: RepoEvidence): string[] {
  const findings: string[] = [];
  if (local.defaultBranch !== remote.defaultBranch) findings.push("default_branch_differs");
  if (!local.private) findings.push("forgejo_not_private");
  if (local.head && remote.head && local.head !== remote.head)
    findings.push("default_head_differs_staleness_unproven");
  for (const kind of ["branches", "tags"] as const) {
    if (local.errors.includes(`${kind}_unverified`) || remote.errors.includes(`${kind}_unverified`))
      continue;
    for (const key of new Set([...Object.keys(local[kind]), ...Object.keys(remote[kind])])) {
      if (!Object.hasOwn(local[kind], key)) findings.push(`${kind}:${key}:missing_forgejo`);
      else if (!Object.hasOwn(remote[kind], key)) findings.push(`${kind}:${key}:missing_upstream`);
      else if (local[kind][key] !== remote[kind][key]) findings.push(`${kind}:${key}:sha_differs`);
    }
  }
  return findings;
}
export async function auditMirrors(
  forgejoRead: AuditRead,
  githubRead: AuditRead,
  now = () => new Date().toISOString(),
): Promise<IntegrityAudit> {
  const audit: IntegrityAudit = {
    checkedAt: now(),
    completedAt: "",
    expectedMirrors: 38,
    forgejoCount: 0,
    upstreamCount: 0,
    complete: false,
    rows: [],
    upstreamWithoutMirror: [],
    errors: [],
    syncEvidence: "host_check_required",
    recoveryEvidence: "isolated_restore_required",
  };
  let local: z.infer<typeof repository>[];
  let upstream: z.infer<typeof repository>[];
  try {
    local = z.array(repository).parse(await list(forgejoRead, "/api/v1/user/repos", 50));
  } catch (error) {
    audit.errors.push("forgejo_inventory_unverified");
    audit.errors.push(errorCode(error));
    audit.completedAt = now();
    return audit;
  }
  local = [...new Map(local.map((r) => [r.full_name.toLowerCase(), r])).values()];
  audit.forgejoCount = local.length;
  try {
    upstream = z.array(repository).parse(await list(githubRead, "/orgs/OMERTA-ROW/repos", 100));
  } catch (error) {
    audit.errors.push("github_inventory_unverified");
    audit.errors.push(errorCode(error));
    audit.completedAt = now();
    return audit;
  }
  audit.upstreamCount = upstream.length;
  if (local.length !== 38) audit.errors.push("expected_38_mirrors_count_differs");
  const mapped = new Set<string>();
  // Sequential batches bound concurrency; no autonomous retries or write calls.
  for (let offset = 0; offset < local.length; offset += 4) {
    const rows = await Promise.all(
      local.slice(offset, offset + 4).map(async (r) => {
        const matches = upstream.filter(
          (u) =>
            u.full_name.toLowerCase() === `omerta-row/${r.full_name.split("/")[1]?.toLowerCase()}`,
        );
        const match = matches[0];
        const row: IntegrityRow = {
          forgejo: safeName(r.full_name) ? r.full_name : "invalid_repository_name",
          upstream: null,
          status: "unverified",
          discrepancies: [],
          local: null,
          remote: null,
        };
        if (matches.length > 1) {
          row.status = "ambiguous_mapping";
          return row;
        }
        if (!match) {
          row.status = "missing_upstream";
          return row;
        }
        if (!safeName(match.full_name) || !safeName(r.full_name)) {
          row.discrepancies.push("invalid_mapping");
          return row;
        }
        row.upstream = match.full_name;
        mapped.add(match.full_name.toLowerCase());
        try {
          row.local = await evidence(forgejoRead, r.full_name, "forgejo");
        } catch (error) {
          row.discrepancies.push("forgejo_read_unverified");
          row.discrepancies.push(`forgejo:${errorCode(error)}`);
        }
        try {
          row.remote = await evidence(githubRead, match.full_name, "github");
        } catch (error) {
          row.discrepancies.push("upstream_read_unverified");
          row.discrepancies.push(`github:${errorCode(error)}`);
        }
        if (row.local && row.remote) {
          if (row.local.sourceRepository?.toLowerCase() !== match.full_name.toLowerCase()) {
            row.local.errors.push(
              row.local.sourceRepository
                ? "source_mapping_differs"
                : "source_mapping_unverified_name_candidate_only",
            );
          }
          row.discrepancies.push(
            ...compareEvidence(row.local, row.remote),
            ...row.local.errors.map((e) => `forgejo:${e}`),
            ...row.remote.errors.map((e) => `github:${e}`),
          );
          row.status =
            row.local.errors.length || row.remote.errors.length
              ? "unverified"
              : row.discrepancies.length
                ? "discrepant"
                : "equal";
        }
        return row;
      }),
    );
    audit.rows.push(...rows);
  }
  audit.rows.sort((a, b) => a.forgejo.localeCompare(b.forgejo));
  audit.upstreamWithoutMirror = upstream
    .filter((r) => !mapped.has(r.full_name.toLowerCase()) && safeName(r.full_name))
    .map((r) => r.full_name)
    .sort();
  audit.complete =
    !audit.errors.length &&
    audit.rows.length === 38 &&
    audit.rows.every((r) => r.status === "equal");
  audit.completedAt = now();
  return audit;
}
