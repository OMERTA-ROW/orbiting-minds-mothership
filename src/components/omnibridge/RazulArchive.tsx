import { useEffect, useState, type FormEvent } from "react";
import { Archive, Globe, Search, ShieldCheck } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import { LiveObservatory } from "@/components/razul/LiveObservatory";
import {
  RAZUL_STORE_KEY,
  appendEvent,
  applyRetention,
  buildGraph,
  emptyRazulStore,
  enrollProject,
  eventKinds,
  ingestFinding,
  loadRazulStore,
  razulConsumers,
  redactEvent,
  registerSource,
  retrieveEvents,
  saveRazulStore,
  verifyChain,
  type EventKind,
  type RazulConsumer,
  type RazulStore,
} from "@/lib/omni-razul";

const stamp = () => new Date().toISOString();
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const errorText = (error: unknown) =>
  error instanceof ZodError
    ? (error.issues[0]?.message ?? "Invalid record.")
    : error instanceof Error
      ? error.message
      : "Invalid record.";

/**
 * RAZUL — The Eternal Archivist. Local-first reference implementation:
 * append-only event history with integrity chain, redaction, retention,
 * per-project/per-consumer access segregation, knowledge graph and a
 * public-source intelligence registry. No server persistence, scheduled
 * discovery or private-data access is connected here.
 */
export function RazulArchive() {
  const [store, setStore] = useState<RazulStore>(emptyRazulStore);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [consumer, setConsumer] = useState<RazulConsumer>("jackboy");
  const [searchText, setSearchText] = useState("");
  const [searchKind, setSearchKind] = useState<"" | EventKind>("");

  useEffect(() => {
    setStore(loadRazulStore(localStorage.getItem(RAZUL_STORE_KEY)));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(RAZUL_STORE_KEY, saveRazulStore(store));
  }, [loaded, store]);

  const firstProject = store.enrollments.find((e) => e.active);
  const chain = verifyChain(store.events);
  const graph = buildGraph(store.enrollments, store.events);
  const retrieval = firstProject
    ? retrieveEvents(store.events, store.grants, {
        consumer,
        projectId: firstProject.id,
        ...(searchKind ? { kind: searchKind } : {}),
        ...(searchText ? { text: searchText } : {}),
      })
    : { allowed: false as const, events: [], denial: "Enroll a project first." };

  function saveEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const enrollment = enrollProject(
        {
          projectName: text(form, "projectName"),
          tags: text(form, "tags").split(",").map((t) => t.trim()).filter(Boolean),
          dependencies: text(form, "dependencies").split(",").map((d) => d.trim()).filter(Boolean),
          retentionDays: Number(text(form, "retentionDays") || 90),
          ownerConsent: true,
        },
        crypto.randomUUID(),
        stamp(),
      );
      setStore((current) => ({ ...current, enrollments: [...current.enrollments, enrollment] }));
      setNotice("Project enrolled with owner consent. RAZUL records only enrolled, opted-in projects.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const entry = appendEvent(
        store.events,
        store.enrollments,
        {
          projectId: text(form, "projectId"),
          actor: text(form, "actor"),
          kind: text(form, "kind"),
          summary: text(form, "summary"),
          provenance: text(form, "provenance"),
        },
        crypto.randomUUID(),
        stamp(),
      );
      setStore((current) => ({ ...current, events: [...current.events, entry] }));
      setNotice("Event appended to the tamper-evident history. It cannot be edited; use redaction for privacy.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  function toggleGrant(target: RazulConsumer) {
    if (!firstProject) return;
    setStore((current) => {
      const existing = current.grants.some(
        (g) => g.projectId === firstProject.id && g.consumer === target,
      );
      return {
        ...current,
        grants: existing
          ? current.grants.filter((g) => !(g.projectId === firstProject.id && g.consumer === target))
          : [...current.grants, { projectId: firstProject.id, consumer: target, grantedAt: stamp() }],
      };
    });
    setNotice(`Access grant for ${target} toggled. Retrieval is denied without an explicit grant.`);
  }

  function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const source = registerSource(
        {
          name: text(form, "name"),
          url: text(form, "url"),
          kind: text(form, "sourceKind"),
          termsNote: text(form, "termsNote"),
          respectsRobots: true,
          ownerApproved: true,
        },
        crypto.randomUUID(),
        stamp(),
      );
      setStore((current) => ({ ...current, sources: [...current.sources, source] }));
      setNotice("Source registered with robots/terms attestation. Scheduled fetching is not connected here.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  function saveFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = ingestFinding(
        store.findings,
        store.sources,
        store.enrollments,
        store.grants,
        {
          sourceId: text(form, "sourceId"),
          title: text(form, "title"),
          url: text(form, "findingUrl"),
          summary: text(form, "findingSummary"),
          category: text(form, "category"),
        },
        crypto.randomUUID(),
        stamp(),
      );
      if (result.error) {
        setNotice(result.error);
        return;
      }
      if (result.duplicate) {
        setNotice("Duplicate URL from the same source; ignored.");
        return;
      }
      setStore((current) => ({
        ...current,
        findings: result.updated
          ? current.findings.map((f) => (f.id === result.updated!.id ? result.updated! : f))
          : [...current.findings, result.finding!],
      }));
      setNotice(
        result.updated
          ? "Finding corroborated by a second source; relevance raised."
          : "Finding recorded, scored and routed to granted consumers only.",
      );
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] px-5 pb-24 pt-8 md:px-10">
      <header className="relative overflow-hidden border-b border-gold/30 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="eyebrow">OMNI Mothership / cross-project intelligence</span>
          <DemoBadge label="LOCAL REFERENCE · NO SERVER PERSISTENCE" />
          <DemoBadge label="NO PRIVATE COMMS · NO SECRETS" />
        </div>
        <h1 className="mt-5 max-w-4xl text-5xl leading-tight">RA'SUL (Razul) · The Eternal Archivist</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          RA'SUL is the central cross-project intelligence and coordination agent within OMNI Mothership.
          This local archive keeps timestamped, append-only, tamper-evident history for enrolled owner-controlled
          projects: events, agent reports, test results, code-change metadata, approvals, incidents
          and outcomes — with provenance, search, retention, redaction and per-consumer access
          segregation for Jackboy, OMNI, Guardian, Sabrina and JAX.
        </p>
        <p className="mt-4 max-w-3xl border-l border-warning pl-4 text-xs leading-6 text-warning">
          This project-history archive is a local reference, not a private server audit.
          The separate public-feed observatory uses existing authenticated research services and
          stored source timestamps; specialized research workers, resident watchers and approved
          task execution remain proposed. Guardian enforcement and owner activation are required
          before rollout. Source policies, permissions and rate limits apply. RA'SUL never monitors
          the entire internet or accesses private communications or secrets.
        </p>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="RAZUL status">
        <div className="glass p-5">
          <Archive className="text-gold" size={20} />
          <h2 className="mt-4 text-xl">Archive integrity</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            {store.events.length} events · chain {chain.ok ? "verified" : `BROKEN at ${chain.brokenAt}`} ·{" "}
            {store.enrollments.filter((e) => e.active).length} enrolled projects.
          </p>
        </div>
        <div className="glass p-5">
          <ShieldCheck className="text-gold" size={20} />
          <h2 className="mt-4 text-xl">Access segregation</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            {store.grants.length} active grants. Retrieval is denied by default; the owner grants
            each consumer per project.
          </p>
        </div>
        <div className="glass p-5">
          <Globe className="text-gold" size={20} />
          <h2 className="mt-4 text-xl">Public intelligence</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            {store.sources.length} approved sources · {store.findings.length} findings. Allowlisted
            RSS/API sources only, with attribution, dedupe and corroboration.
          </p>
        </div>
      </section>

      {notice && (
        <p
          role="status"
          className="mt-6 border border-gold/30 bg-accent/20 px-4 py-3 text-xs leading-6 text-gold-light"
        >
          {notice}
        </p>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="border border-border p-5" aria-labelledby="razul-enroll">
          <h2 id="razul-enroll" className="text-2xl">
            1 · Project enrollment (opt-in)
          </h2>
          <form className="mt-5 space-y-4" onSubmit={saveEnrollment}>
            <label className="block text-xs">
              Project name
              <input required name="projectName" className="exchange-select mt-1 w-full" />
            </label>
            <label className="block text-xs">
              Relevance tags (comma-separated)
              <input required name="tags" className="exchange-select mt-1 w-full" placeholder="mcp, agent, coding" />
            </label>
            <label className="block text-xs">
              Dependencies (comma-separated)
              <input name="dependencies" className="exchange-select mt-1 w-full" placeholder="TanStack Start, Go" />
            </label>
            <label className="block text-xs">
              Retention (days, 7–365)
              <input required name="retentionDays" type="number" min="7" max="365" defaultValue="90" className="exchange-select mt-1 w-full" />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input required type="checkbox" /> I am the owner and consent to RAZUL recording this
              project's events locally.
            </label>
            <Button type="submit" variant="cosmic">
              Enroll project
            </Button>
          </form>
          {store.enrollments.length > 0 && (
            <ul className="mt-5 space-y-2 text-xs leading-6 text-muted-foreground">
              {store.enrollments.map((e) => (
                <li key={e.id} className="border border-border/70 p-3">
                  <span className="text-gold-light">{e.projectName}</span> · tags: {e.tags.join(", ")} ·
                  retention {e.retentionDays}d
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-border p-5" aria-labelledby="razul-events">
          <h2 id="razul-events" className="text-2xl">
            2 · Append event
          </h2>
          <form className="mt-5 space-y-4" onSubmit={saveEvent}>
            <label className="block text-xs">
              Project
              <select name="projectId" className="exchange-select mt-1 w-full">
                {store.enrollments.filter((e) => e.active).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.projectName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-xs">
                Actor (agent or human)
                <input required name="actor" className="exchange-select mt-1 w-full" placeholder="Jackboy" />
              </label>
              <label className="block text-xs">
                Kind
                <select name="kind" className="exchange-select mt-1 w-full">
                  {eventKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs">
              Summary
              <textarea required name="summary" minLength={5} className="exchange-select mt-1 min-h-20 w-full" />
            </label>
            <label className="block text-xs">
              Provenance (where this record came from)
              <input required name="provenance" className="exchange-select mt-1 w-full" />
            </label>
            <Button type="submit" variant="cosmic" disabled={!firstProject}>
              Append to history
            </Button>
          </form>
          <ul className="mt-5 space-y-2 text-xs leading-6 text-muted-foreground">
            {store.events.slice(-6).reverse().map((event) => (
              <li key={event.id} className="border border-border/70 p-3">
                <span className="font-mono text-[10px] uppercase text-gold">{event.kind}</span> ·{" "}
                {event.actor} · {event.at.slice(0, 19)}Z
                <p className="mt-1">{event.summary}</p>
                {!event.redacted && !event.tombstoned && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      setStore((current) => ({
                        ...current,
                        events: redactEvent(current.events, event.id, "Owner redaction via RAZUL panel"),
                      }));
                      setNotice("Event content redacted; the chain entry and reason remain.");
                    }}
                  >
                    Redact
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {store.events.length > 0 && (
            <Button
              size="sm"
              variant="signal"
              className="mt-4"
              onClick={() => {
                setStore((current) => ({
                  ...current,
                  events: applyRetention(current.events, current.enrollments, new Date()),
                }));
                setNotice("Retention applied; expired content tombstoned, chain preserved.");
              }}
            >
              Apply retention now
            </Button>
          )}
        </section>
      </div>

      <section className="mt-8 border border-border p-5" aria-labelledby="razul-retrieval">
        <h2 id="razul-retrieval" className="text-2xl">
          3 · Retrieval API (per-consumer grants)
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {razulConsumers.map((name) => {
            const granted =
              firstProject &&
              store.grants.some((g) => g.projectId === firstProject.id && g.consumer === name);
            return (
              <Button key={name} size="sm" variant={granted ? "cosmic" : "ghost"} onClick={() => toggleGrant(name)}>
                {name} {granted ? "· granted" : "· denied"}
              </Button>
            );
          })}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block text-xs">
            Retrieve as
            <select
              className="exchange-select mt-1 w-full"
              value={consumer}
              onChange={(event) => setConsumer(event.target.value as RazulConsumer)}
            >
              {razulConsumers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Kind filter
            <select
              className="exchange-select mt-1 w-full"
              value={searchKind}
              onChange={(event) => setSearchKind(event.target.value as "" | EventKind)}
            >
              <option value="">All kinds</option>
              {eventKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Text search
            <input
              className="exchange-select mt-1 w-full"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="timeout, release, approval…"
            />
          </label>
        </div>
        <div className="mt-5">
          {!retrieval.allowed ? (
            <p className="border border-warning/50 bg-accent/10 px-4 py-3 text-xs leading-6 text-warning">
              {retrieval.denial}
            </p>
          ) : retrieval.events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events match.</p>
          ) : (
            <ul className="space-y-2 text-xs leading-6 text-muted-foreground">
              {retrieval.events.map((event) => (
                <li key={event.id} className="border border-border/70 p-3">
                  <span className="font-mono text-[10px] uppercase text-gold">{event.kind}</span> ·{" "}
                  {event.actor} · {event.at.slice(0, 19)}Z — {event.summary}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-5 text-xs leading-6 text-muted-foreground">
          Knowledge graph: {graph.nodes.length} nodes ({graph.nodes.filter((n) => n.type === "project").length} projects,{" "}
          {graph.nodes.filter((n) => n.type === "agent").length} agents,{" "}
          {graph.nodes.filter((n) => n.type === "dependency").length} dependencies) · {graph.edges.length} relations.
        </p>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="border border-border p-5" aria-labelledby="razul-sources">
          <div className="flex items-center justify-between gap-3">
            <h2 id="razul-sources" className="text-2xl">
              4 · Public sources
            </h2>
            <DemoBadge label="ALLOWLIST ONLY" />
          </div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Register allowlisted RSS/API/public-page sources. Registration requires robots/terms
            attestation and owner approval; scheduled fetching stays with the existing knowledge
            collector and is not duplicated here.
          </p>
          <form className="mt-5 space-y-4" onSubmit={saveSource}>
            <label className="block text-xs">
              Source name
              <input required name="name" className="exchange-select mt-1 w-full" />
            </label>
            <label className="block text-xs">
              HTTPS URL
              <input required name="url" type="url" className="exchange-select mt-1 w-full" placeholder="https://example.com/feed.xml" />
            </label>
            <label className="block text-xs">
              Kind
              <select name="sourceKind" className="exchange-select mt-1 w-full">
                <option value="rss">RSS</option>
                <option value="api">API</option>
                <option value="public-page">Public page</option>
              </select>
            </label>
            <label className="block text-xs">
              Terms / attribution note
              <textarea required name="termsNote" minLength={10} className="exchange-select mt-1 min-h-16 w-full" />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input required type="checkbox" /> This source is public, respects robots.txt and site
              terms, is rate-limited, and I approve it as owner.
            </label>
            <Button type="submit" variant="cosmic">
              Register source
            </Button>
          </form>
          <ul className="mt-5 space-y-2 text-xs leading-6 text-muted-foreground">
            {store.sources.map((source) => (
              <li key={source.id} className="border border-border/70 p-3">
                <span className="text-gold-light">{source.name}</span> · {source.kind} · {source.url}
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border p-5" aria-labelledby="razul-findings">
          <h2 id="razul-findings" className="text-2xl">
            5 · Findings & routing
          </h2>
          <form className="mt-5 space-y-4" onSubmit={saveFinding}>
            <label className="block text-xs">
              Source
              <select name="sourceId" className="exchange-select mt-1 w-full">
                {store.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Title
              <input required name="title" minLength={5} className="exchange-select mt-1 w-full" />
            </label>
            <label className="block text-xs">
              URL
              <input required name="findingUrl" type="url" className="exchange-select mt-1 w-full" />
            </label>
            <label className="block text-xs">
              Summary
              <textarea required name="findingSummary" minLength={10} className="exchange-select mt-1 min-h-16 w-full" />
            </label>
            <label className="block text-xs">
              Category
              <select name="category" className="exchange-select mt-1 w-full">
                <option value="ai-model">AI model</option>
                <option value="coding-tool">Coding tool</option>
                <option value="api">API</option>
                <option value="vulnerability">Vulnerability</option>
                <option value="development">Development</option>
              </select>
            </label>
            <Button type="submit" variant="cosmic" disabled={!store.sources.length}>
              Record finding
            </Button>
          </form>
          <ul className="mt-5 space-y-2 text-xs leading-6 text-muted-foreground">
            {store.findings.map((finding) => (
              <li key={finding.id} className="border border-border/70 p-3">
                <span className="text-gold-light">{finding.title}</span> · relevance {finding.relevance}/100 ·
                corroborations {finding.corroborations}
                <p className="mt-1">
                  Routed to: {finding.routedTo.length ? finding.routedTo.join(", ") : "no granted consumers"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mx-auto mt-8 w-full max-w-6xl px-6 pb-16">
        <LiveObservatory />
      </div>
    </main>
  );
}
