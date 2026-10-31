import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Eye, RefreshCw, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/hooks/use-account";
import { getRazulEye } from "@/lib/razul-eye.functions";
import type { EyeSnapshot } from "@/lib/razul-eye";
import { sourceCheckState } from "@/lib/razul-controls";
import { OwnerControls } from "./OwnerControls";

function time(value: string | null) {
  return value ?? "Not recorded";
}
export function AllSeeingEye() {
  const { user, ready } = useAccount();
  const read = useServerFn(getRazulEye);
  const [snapshot, setSnapshot] = useState<EyeSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [findingSearch, setFindingSearch] = useState("");
  const [evidence, setEvidence] = useState("all");
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current += 1;
    },
    [],
  );
  async function refresh() {
    const current = ++revision.current;
    setBusy(true);
    setSnapshot(null);
    setNotice("");
    try {
      const result = await read();
      if (revision.current === current) setSnapshot(result);
    } catch (e) {
      if (revision.current === current)
        setNotice(
          e instanceof Error ? e.message : "Owner infrastructure access could not be verified.",
        );
    } finally {
      if (revision.current === current) setBusy(false);
    }
  }
  const history =
    snapshot?.history.filter((r) =>
      `${r.kind} ${r.label} ${r.at}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <section
      aria-labelledby="all-seeing-eye-title"
      className="mx-auto max-w-[1500px] border-y border-border px-5 py-8 md:px-10"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Razul Central Intelligence / RA'SUL private observatory</p>
          <h2 id="all-seeing-eye-title" className="mt-3 flex items-center gap-3 text-3xl">
            <Eye size={26} className="shrink-0 text-primary" />
            All-Seeing Eye
          </h2>
        </div>
        {user && (
          <Button variant="outline" disabled={busy || !ready} onClick={() => void refresh()}>
            <RefreshCw size={14} />
            {busy ? "Checking owner access…" : "Inspect owner records"}
          </Button>
        )}
      </header>
      <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground">
        Razul's historical intelligence layer for OMNI and Evolution. Recorded infrastructure only:
        permitted sources, ingestion jobs, scoped machine reports, queues and chronological history.
        All-Seeing Eye is a name, not unrestricted visibility or entire-internet surveillance.
      </p>
      {!snapshot && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-l border-primary pl-4 text-sm text-muted-foreground">
          <LockKeyhole size={18} className="shrink-0" />
          Verified owner role, confirmed email and strong MFA required. No infrastructure records
          are loaded before authorization.
          {!user && ready && (
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Owner sign in</Link>
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-warning">
          {notice}
        </p>
      )}
      {snapshot && (
        <>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            Snapshot read (UTC): {snapshot.readAt}. Bounded recent records, not complete coverage.
            Refresh is read-only; it starts no monitoring or jobs.
          </p>
          <Tabs defaultValue="jobs" className="mt-5">
            <TabsList
              aria-label="All-Seeing Eye records"
              className="h-auto max-w-full flex-wrap justify-start"
            >
              <TabsTrigger value="jobs">Jobs &amp; queues</TabsTrigger>
              <TabsTrigger value="sources">Sources &amp; findings</TabsTrigger>
              <TabsTrigger value="agents">Watchers &amp; projects</TabsTrigger>
              <TabsTrigger value="history">Chronology</TabsTrigger>
              <TabsTrigger value="controls">Owner controls</TabsTrigger>
            </TabsList>
            <TabsContent value="jobs" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Recorded pause: {time(snapshot.state?.paused_at ?? null)} · lease until:{" "}
                {time(snapshot.state?.lease_until ?? null)} · retention:{" "}
                {snapshot.state ? `${snapshot.state.retention_days} days` : "Not recorded"}. A lease
                is not proof of worker health.
              </p>
              <h3 className="text-lg">Ingestion runs</h3>
              {!snapshot.runs.length && (
                <p className="text-sm text-muted-foreground">
                  No recent runs returned. Activity unknown.
                </p>
              )}
              <ul className="divide-y divide-border">
                {snapshot.runs.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    <strong>{r.status}</strong> · started {r.started_at} · finished{" "}
                    {time(r.finished_at)}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.fetched} fetched · {r.inserted} stored · {r.alerts} recorded alerts
                    </p>
                  </li>
                ))}
              </ul>
              <h3 className="text-lg">Dispatch queue</h3>
              {!snapshot.queue.length && (
                <p className="text-sm text-muted-foreground">
                  No queue entries returned; no execution inferred.
                </p>
              )}
              <ul className="divide-y divide-border">
                {snapshot.queue.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    {r.scout_type} · {r.status} · Guardian: {r.guardian_status}
                    <p className="text-xs text-muted-foreground">
                      Updated {r.updated_at}. A queue record is not approval or execution evidence.
                    </p>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="sources" className="space-y-4">
              <p className="text-sm text-warning">
                Source checks are receipts, not continuous-monitoring proof. Checks before receipt
                recording remain unknown; recent means within 24 hours. HTML scraping and continuous
                API workers are not connected.
              </p>
              <ul className="divide-y divide-border">
                {snapshot.sources.map((r) => {
                  const check = snapshot.checks?.find((c) => c.source_id === r.id);
                  return (
                    <li key={r.id} className="py-3 text-sm">
                      <strong>{r.name}</strong> · {r.kind} / {r.category} ·{" "}
                      {r.active ? "enabled in registry" : "disabled"}
                      <p className="text-xs text-muted-foreground">
                        Registered {r.added_at} · last checked: {check?.checked_at ?? "unknown"} ·{" "}
                        {sourceCheckState(check, snapshot.readAt)}
                        {check?.error_code ? ` · ${check.error_code}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <h3 className="text-lg">Sourced findings</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Search findings
                  <input
                    className="exchange-select mt-2 w-full"
                    value={findingSearch}
                    maxLength={160}
                    onChange={(e) => setFindingSearch(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Evidence class
                  <select
                    className="exchange-select mt-2 w-full"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                  >
                    <option value="all">All classes</option>
                    {[...new Set(snapshot.findings.map((f) => f.evidence_class))].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!snapshot.findings.length && (
                <p className="text-sm text-muted-foreground">No findings returned.</p>
              )}
              <ul className="divide-y divide-border">
                {snapshot.findings
                  .filter(
                    (r) =>
                      (evidence === "all" || r.evidence_class === evidence) &&
                      `${r.title} ${r.source_name} ${r.category ?? ""} ${r.topic ?? ""}`
                        .toLowerCase()
                        .includes(findingSearch.toLowerCase()),
                  )
                  .map((r) => (
                    <li key={r.id} className="py-3 text-sm">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.source_name} · {r.evidence_class} · revision {r.revision ?? "unknown"} ·
                        collected {r.collected_at} · published {time(r.published_at)}
                      </p>
                    </li>
                  ))}
              </ul>
            </TabsContent>
            <TabsContent value="agents" className="space-y-4">
              <p className="text-sm text-warning">
                Sentinels are scoped machine identities, not proof resident watchers or specialist
                research agents are running. Passport status is a declaration, not measured project
                health.
              </p>
              <h3 className="text-lg">Registered Sentinel metadata</h3>
              {!snapshot.sentinels.length && (
                <p className="text-sm text-muted-foreground">No Sentinel records returned.</p>
              )}
              <ul className="divide-y divide-border">
                {snapshot.sentinels.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    {r.name} · {r.status}
                    <p className="text-xs text-muted-foreground">
                      Scopes: {r.scopes.join(", ")} · expires {r.expires_at} · last report{" "}
                      {time(r.last_seen_at)}
                    </p>
                  </li>
                ))}
              </ul>
              <h3 className="text-lg">Project Passport declarations</h3>
              {!snapshot.projects.length && (
                <p className="text-sm text-muted-foreground">No Passport declarations returned.</p>
              )}
              <ul className="divide-y divide-border">
                {snapshot.projects.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    {r.project} · {r.resident_agent} · v{r.version} · declared {r.status}
                    <p className="text-xs text-muted-foreground">Updated {r.updated_at}</p>
                  </li>
                ))}
              </ul>
              <h3 className="text-lg">Research subscriptions</h3>
              <ul className="divide-y divide-border">
                {snapshot.feeds.map((r) => (
                  <li key={r.agent} className="py-3 text-sm">
                    {r.agent} · {r.alerts_enabled ? "alerts configured" : "alerts off"} · relevance
                    ≥ {r.min_relevance}
                    <p className="text-xs text-muted-foreground">
                      {r.categories.join(", ") || "No categories"} · configuration does not prove
                      delivery
                    </p>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="history">
              <label className="block text-sm">
                Search chronological metadata
                <input
                  className="exchange-select mt-2 w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={160}
                />
              </label>
              <p className="mt-3 text-xs text-muted-foreground">
                Newest first, up to 100 entries. Metadata only; no payloads, credentials or
                submitted task text. Not an immutable trusted audit.
              </p>
              {!history.length && (
                <p className="mt-4 text-sm text-muted-foreground">No matching history returned.</p>
              )}
              <ol className="mt-4 divide-y divide-border">
                {history.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    <time className="font-mono text-xs text-muted-foreground">{r.at}</time>
                    <p>
                      {r.kind} · {r.label}
                    </p>
                  </li>
                ))}
              </ol>
            </TabsContent>
            <TabsContent value="controls">
              <OwnerControls key={snapshot.readAt} snapshot={snapshot} refresh={refresh} />
            </TabsContent>
          </Tabs>
        </>
      )}
      <p className="mt-5 max-w-4xl text-xs leading-6 text-warning">
        Implemented, owner acceptance pending: source receipts, saved pause/feed
        retention/subscription controls and control-change metadata. Planned: continuous monitoring,
        resident watcher lifecycle, private correction/version workflows and trusted audit. Existing
        local archive remains separate. Site policies, scoped revocable identities and Guardian
        remain required; no new source or job is activated here.
      </p>
    </section>
  );
}
