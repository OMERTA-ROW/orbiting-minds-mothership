import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Download,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { readForgejoRepos } from "@/lib/forgejo.functions";
import { FORGEJO_READ_SCOPES } from "@/lib/forgejo";
import { readForgejoIntegrity } from "@/lib/forgejo-audit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConsolePanel, EmptyState, MetricCard, StateLine } from "./console/ConsolePrimitives";
import { consoleDate, filterForgejoRepos } from "./console/console-utils";

export function ForgejoRepos() {
  const read = useServerFn(readForgejoRepos);
  const q = useQuery({ queryKey: ["forgejo-repos"], queryFn: () => read(), retry: false });
  const r = q.data;
  const auditRead = useServerFn(readForgejoIntegrity);
  const [auditResult, setAuditResult] = useState<Awaited<ReturnType<typeof auditRead>> | null>(
    null,
  );
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState(false);
  const [search, setSearch] = useState("");
  const auditPending = useRef(false);
  const repos = r?.state === "connected" ? r.repos : [];
  const filtered = filterForgejoRepos(repos, search);
  const privateCount = repos.filter((repo) => repo.private).length;
  const mirrorCount = repos.filter((repo) => repo.sync.kind === "mirror").length;
  const branchCount = repos.filter((repo) => Boolean(repo.branch)).length;

  async function runAudit() {
    if (auditPending.current) return;
    auditPending.current = true;
    setAuditing(true);
    setAuditError(false);
    setAuditResult(null);
    try {
      setAuditResult(await auditRead());
    } catch {
      setAuditError(true);
    } finally {
      auditPending.current = false;
      setAuditing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">OMNI Block · read-only development</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Developer Center
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Real Forgejo mirror metadata and owner-controlled project records. GitHub OMERTA-ROW
            remains upstream; repository writes stay disabled.
          </p>
        </div>
        <Button variant="signal" disabled={q.isFetching} onClick={() => void q.refetch()}>
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} />{" "}
          {q.isFetching ? "Checking…" : "Refresh repositories"}
        </Button>
      </header>

      <nav
        aria-label="Developer workspace views"
        className="flex flex-wrap gap-1 rounded-xl border border-gold/15 bg-console-panel/75 p-1.5"
      >
        {[
          { label: "Overview", to: "/repositories" },
          { label: "Pull Requests", to: "/pull-requests" },
          { label: "Actions", to: "/actions" },
          { label: "Projects", to: "/projects" },
          { label: "Settings", to: "/settings" },
        ].map((tab) => (
          <Button
            key={tab.to}
            asChild
            variant={tab.to === "/repositories" ? "secondary" : "ghost"}
            size="sm"
            className={tab.to === "/repositories" ? "text-gold-light" : "text-muted-foreground"}
          >
            <Link to={tab.to} aria-current={tab.to === "/repositories" ? "page" : undefined}>
              {tab.label}
            </Link>
          </Button>
        ))}
      </nav>

      <section aria-label="Repository metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Repositories"
          value={r?.state === "connected" ? String(repos.length) : "Not verified"}
          note="Unique records returned by the gateway"
          icon={FolderGit2}
        />
        <MetricCard
          label="Private"
          value={r?.state === "connected" ? String(privateCount) : "Not verified"}
          note="Privacy reported by Forgejo"
          icon={LockKeyhole}
        />
        <MetricCard
          label="Default branches"
          value={r?.state === "connected" ? String(branchCount) : "Not verified"}
          note="Repositories reporting a default branch"
          icon={GitBranch}
        />
        <MetricCard
          label="Mirror metadata"
          value={r?.state === "connected" ? String(mirrorCount) : "Not verified"}
          note="Metadata only; hourly timer evidence remains separate"
          icon={RefreshCw}
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ConsolePanel
          title="Repositories"
          description={
            r?.state === "connected"
              ? `${repos.length} real repositories · checked ${consoleDate(r.checkedAt)}${r.truncated ? " · list cut at 1,000" : ""}`
              : "Read-only Evolution Git gateway"
          }
          action={
            <div className="relative min-w-0 sm:w-72">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, branch or privacy"
                aria-label="Search repositories"
                className="h-9 border-gold/20 bg-console-deep/60 pl-9 text-xs"
              />
            </div>
          }
        >
          {q.isError && (
            <p role="alert" className="text-sm text-destructive">
              Could not reach the server. Try Refresh.
            </p>
          )}
          {r?.state === "denied" && (
            <EmptyState>Owner sign-in with two-step verification is required.</EmptyState>
          )}
          {r?.state === "not_configured" && (
            <EmptyState>
              Not connected. Missing settings: {r.missing.join(", ")}. Add them in Project Settings
              → Secrets after the private gateway is set up.
            </EmptyState>
          )}
          {r?.state === "invalid_origin" && (
            <EmptyState>
              Not connected. FORGEJO_BASE_URL must be exactly https://git-api.evoomni.tech with no
              extra path, port, query or credentials.
            </EmptyState>
          )}
          {r?.state === "unreachable" && <EmptyState>Not connected: {r.message}</EmptyState>}
          {q.isPending && <EmptyState>Checking the private repository gateway…</EmptyState>}
          {r?.state === "connected" && repos.length === 0 && (
            <EmptyState>The gateway answered, but this token sees no repositories.</EmptyState>
          )}
          {r?.state === "connected" && repos.length > 0 && filtered.length === 0 && (
            <EmptyState>No repositories match “{search}”.</EmptyState>
          )}
          {filtered.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gold/15">
              <table className="w-full min-w-[790px] text-left text-xs">
                <thead className="bg-console-raised/80 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Privacy
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Branch
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Sync
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Last update
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((repo) => (
                    <tr
                      key={repo.id}
                      className="border-t border-gold/10 transition-colors hover:bg-console-raised/45"
                    >
                      <td className="max-w-72 break-words px-4 py-3 font-medium text-foreground">
                        {repo.name}
                        {repo.empty ? " (empty)" : ""}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {repo.private ? "Private" : "Public"}
                      </td>
                      <td className="px-3 py-3 text-gold-light">{repo.branch || "Not reported"}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {repo.sync.kind === "mirror"
                          ? `Mirror · ${consoleDate(repo.sync.at)}`
                          : "Sync not reported"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {consoleDate(repo.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
            Agent read access:{" "}
            {FORGEJO_READ_SCOPES.map((scope) => `${scope.agent} not granted`).join(" · ")}.
          </p>
        </ConsolePanel>

        <div className="grid gap-5 md:grid-cols-3 xl:grid-cols-1">
          <ConsolePanel title="System Status" description="Current gateway response only.">
            <StateLine
              label="Gateway"
              value={
                r?.state === "connected"
                  ? "Connected · read only"
                  : q.isPending
                    ? "Checking"
                    : "Not connected / not verified"
              }
            />
            <StateLine label="Repository writes" value="Disabled" />
            <StateLine label="Agent grants" value="Not granted" />
            <StateLine label="Execution" value="Not connected" />
          </ConsolePanel>
          <ConsolePanel title="Recent Pull Requests" description="No review provider is connected.">
            <EmptyState>Not connected. No pull request records are available.</EmptyState>
            <Button asChild variant="ghost" size="sm" className="mt-3 px-0 text-gold-light">
              <Link to="/pull-requests">Open pull request status</Link>
            </Button>
          </ConsolePanel>
          <ConsolePanel title="Recent Activity" description="Latest repository update timestamps.">
            {repos.length ? (
              <ul>
                {[...repos]
                  .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
                  .slice(0, 4)
                  .map((repo) => (
                    <li key={repo.id} className="border-b border-border py-2.5 last:border-0">
                      <p className="break-words text-xs text-foreground">{repo.name}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {consoleDate(repo.updatedAt)}
                      </p>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState>No repository activity verified.</EmptyState>
            )}
          </ConsolePanel>
        </div>
      </div>

      <ConsolePanel
        title="Upstream Integrity"
        description="Manual read-only comparison; this never triggers sync or changes a schedule."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="signal"
            disabled={auditing || r?.state !== "connected"}
            onClick={() => void runAudit()}
          >
            <ShieldCheck /> {auditing ? "Comparing repositories…" : "Audit upstream integrity"}
          </Button>
          {r?.state !== "connected" && (
            <span className="text-xs text-muted-foreground">
              Connect the gateway before auditing.
            </span>
          )}
        </div>
        {auditError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Audit could not finish. No sync was triggered.
          </p>
        )}
        {auditResult?.state === "denied" && (
          <p className="mt-3 text-sm">Owner two-step sign-in is required.</p>
        )}
        {auditResult?.state === "audited" && (
          <div className="mt-5 space-y-4 text-sm">
            <p>
              {auditResult.audit.forgejoCount} Forgejo repositories ·{" "}
              {auditResult.audit.upstreamCount} visible upstream repositories ·{" "}
              {consoleDate(auditResult.audit.checkedAt)}
            </p>
            <p className="text-muted-foreground">
              {auditResult.audit.complete
                ? "Repository refs match at this check."
                : "Integrity not fully verified."}{" "}
              Hourly timer: host evidence required. Recovery: isolated restore evidence required.
              Phase 3 remains gated.
            </p>
            {auditResult.audit.errors.map((error) => (
              <p key={error} className="text-destructive">
                {error}
              </p>
            ))}
            <div className="overflow-x-auto rounded-xl border border-gold/15">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-console-raised/80">
                  <tr>
                    <th className="px-3 py-3">Forgejo / upstream</th>
                    <th className="px-3 py-3">Result</th>
                    <th className="px-3 py-3">Default heads / findings</th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.audit.rows.map((row) => (
                    <tr key={row.forgejo} className="border-t border-gold/10 align-top">
                      <td className="break-words px-3 py-3">
                        {row.forgejo}
                        <br />
                        <span className="text-muted-foreground">
                          {row.upstream ?? "No unique mapping"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gold-light">{row.status}</td>
                      <td className="break-all px-3 py-3 text-muted-foreground">
                        {row.local?.head ?? "Unverified"}
                        <br />
                        {row.remote?.head ?? "Unverified"}
                        <br />
                        {row.discrepancies.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer text-gold-light">
                Upstream repositories without a mapped mirror (
                {auditResult.audit.upstreamWithoutMirror.length})
              </summary>
              <p className="mt-2">
                These are outside the matched set; this does not prove they were selected for
                mirroring.
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {auditResult.audit.upstreamWithoutMirror.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </details>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(auditResult.audit, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "evolution-integrity-audit.json";
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download /> Download audit evidence
            </Button>
          </div>
        )}
      </ConsolePanel>

      <ConsolePanel
        title="Quick Actions"
        description="Existing owner destinations and explicit blockers."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="signal">
            <Link to="/projects">
              <FolderGit2 /> Manage projects
            </Link>
          </Button>
          <Button asChild variant="signal">
            <Link to="/actions">
              <Activity /> Review Actions status
            </Link>
          </Button>
          <Button asChild variant="signal">
            <Link to="/account-security">
              <ShieldCheck /> Account security
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled
            title="Repository creation and writes are not connected."
          >
            <LockKeyhole /> Create repository unavailable
          </Button>
        </div>
      </ConsolePanel>
    </div>
  );
}
