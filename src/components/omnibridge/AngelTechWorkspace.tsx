import { useEffect, useState, type FormEvent } from "react";
import { Download, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import {
  ANGEL_TECH_STORE_KEY,
  compatibilityOptions,
  coordinationLanes,
  createInsight,
  createProspect,
  draftCampaign,
  invitationBlockers,
  loadAngelTechStore,
  permissionOptions,
  prepareInvitation,
  readinessSummary,
  revokeProspect,
  saveAngelTechStore,
  type AngelTechStore,
  type CompatibilityOption,
  type HumanApprovalState,
  type PermissionOption,
  type Prospect,
} from "@/lib/omni-angel-tech";
import { SabrinaDirector } from "./SabrinaDirector";

const emptyStore: AngelTechStore = { insights: [], prospects: [], drafts: [] };
const stamp = () => new Date().toISOString();
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const checked = (form: FormData, key: string) => form.get(key) === "on";
const list = <T extends string>(form: FormData, key: string) => form.getAll(key).map(String) as T[];
const errorText = (error: unknown) =>
  error instanceof ZodError
    ? (error.issues[0]?.message ?? "Invalid record.")
    : error instanceof Error
      ? error.message
      : "Invalid record.";

export function AngelTechWorkspace() {
  const [store, setStore] = useState<AngelTechStore>(emptyStore);
  const [selectedInsightId, setSelectedInsightId] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStore(loadAngelTechStore(localStorage.getItem(ANGEL_TECH_STORE_KEY)));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(ANGEL_TECH_STORE_KEY, saveAngelTechStore(store));
  }, [loaded, store]);

  const selectedInsight =
    store.insights.find((insight) => insight.id === selectedInsightId) ?? store.insights[0];
  const summary = readinessSummary(store.prospects);

  function saveInsight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const insight = createInsight(
        {
          audience: text(form, "audience"),
          trend: text(form, "trend"),
          invention: text(form, "invention"),
          evidence: text(form, "evidence"),
          confidence: Number(text(form, "confidence") || 0),
          usesPrivateContext: checked(form, "usesPrivateContext"),
          privateAuthorization: checked(form, "privateAuthorization"),
        },
        crypto.randomUUID(),
        stamp(),
      );
      setStore((current) => ({ ...current, insights: [insight, ...current.insights] }));
      setSelectedInsightId(insight.id);
      setNotice("Sabrina intelligence note saved locally. No trend service or model was queried.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  function saveProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const prospect = createProspect(
        {
          name: text(form, "name"),
          organization: text(form, "organization"),
          focus: text(form, "focus"),
          source: text(form, "source"),
          perspective: text(form, "perspective"),
          compatibility: list<CompatibilityOption>(form, "compatibility"),
          permissions: list<PermissionOption>(form, "permissions"),
          ownerAuthorization: checked(form, "ownerAuthorization"),
          humanApproval: text(form, "humanApproval") as HumanApprovalState,
        },
        crypto.randomUUID(),
        stamp(),
      );
      setStore((current) => ({ ...current, prospects: [prospect, ...current.prospects] }));
      setNotice(
        "Prospective partner recorded locally. No discovery crawl, contact or connection occurred.",
      );
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  function updateProspect(id: string, updater: (prospect: Prospect) => Prospect) {
    setStore((current) => ({
      ...current,
      prospects: current.prospects.map((prospect) =>
        prospect.id === id && prospect.status !== "revoked" ? updater(prospect) : prospect,
      ),
    }));
  }

  function makeDraft() {
    if (!selectedInsight) {
      setNotice("Save an intelligence note before drafting a campaign.");
      return;
    }
    const draft = draftCampaign(selectedInsight, crypto.randomUUID(), stamp());
    setStore((current) => ({ ...current, drafts: [draft, ...current.drafts] }));
    setNotice("Campaign draft created for review only. Nothing was published, sent or scheduled.");
  }

  function exportRecords() {
    const blob = new Blob([saveAngelTechStore(store)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `angel-tech-sabrina-local-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-[1500px] px-5 pb-24 pt-8 md:px-10">
      <header className="relative overflow-hidden border-b border-gold/30 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="eyebrow">Angel Tech / dedicated ambassador</span>
          <DemoBadge label="CONCEPT · NO OUTREACH CONNECTED" />
          <DemoBadge label="LOCAL BROWSER RECORDS" />
        </div>
        <h1 className="mt-5 max-w-4xl text-5xl leading-tight">Sabrina for Angel Tech</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          Sabrina is a concept-stage marketing intelligence and authorized AI outreach ambassador.
          She studies owner-entered audience and trend notes, drafts campaigns, connects invention
          context with relevant audiences, and prepares partnership records for Jackboy, OMNI and
          JAX review.
        </p>
        <p className="mt-4 max-w-3xl border-l border-warning pl-4 text-xs leading-6 text-warning">
          No autonomous agent, trend crawler, email/social account, API, MCP server or private data
          source is connected. Every workflow below is concept/demo until the owner supplies
          verified account permissions, official credentials and explicit human approval.
        </p>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Sabrina readiness">
        <div className="glass p-5">
          <Sparkles className="text-gold" size={20} />
          <h2 className="mt-4 text-xl">Functional now</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Local intelligence notes, campaign drafts, prospect registry, perspective and
            compatibility records, permission review, human-approval gates, revocation and JSON
            export.
          </p>
        </div>
        <div className="glass p-5">
          <ShieldCheck className="text-gold" size={20} />
          <h2 className="mt-4 text-xl">Still pending</h2>
          <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
            {summary.pending.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
        <div className="glass p-5">
          <UserCheck className="text-gold" size={20} />
          <h2 className="mt-4 text-xl">Partnership status</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            {summary.total} local prospects · {summary.approved} owner/human approved ·{" "}
            {summary.drafted} local drafts · {summary.connected} connected.
          </p>
          <Button
            variant="signal"
            size="sm"
            className="mt-4"
            onClick={exportRecords}
            disabled={!store.insights.length && !store.prospects.length && !store.drafts.length}
          >
            <Download size={14} /> Export local records
          </Button>
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

      <div className="mt-8 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="border border-border p-5" aria-labelledby="sabrina-intel">
          <h2 id="sabrina-intel" className="text-2xl">
            1 · Sabrina intelligence note
          </h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Enter audience and trend evidence manually. Public references stay owner-entered;
            private context requires an explicit authorization checkbox.
          </p>
          <form className="mt-5 space-y-4" onSubmit={saveInsight}>
            <label className="block text-xs">
              Audience
              <input
                required
                name="audience"
                className="exchange-select mt-1 w-full"
                placeholder="Independent AI research groups"
              />
            </label>
            <label className="block text-xs">
              Trend observed
              <textarea
                required
                name="trend"
                minLength={10}
                className="exchange-select mt-1 min-h-24 w-full"
                placeholder="What changed, who it affects, and why it matters…"
              />
            </label>
            <label className="block text-xs">
              Angel Tech invention or offer
              <input
                required
                name="invention"
                className="exchange-select mt-1 w-full"
                placeholder="Consent-first agent partnership kit"
              />
            </label>
            <label className="block text-xs">
              Evidence / source note
              <textarea
                required
                name="evidence"
                minLength={10}
                className="exchange-select mt-1 min-h-20 w-full"
                placeholder="Owner-entered source or observation; no automatic fetch."
              />
            </label>
            <label className="block text-xs">
              Confidence (0–100)
              <input
                required
                name="confidence"
                type="number"
                min="0"
                max="100"
                defaultValue="50"
                className="exchange-select mt-1 w-full"
              />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input name="usesPrivateContext" type="checkbox" /> This note uses private context.
            </label>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input name="privateAuthorization" type="checkbox" /> I explicitly authorize Sabrina
              to use that private context locally.
            </label>
            <Button type="submit" variant="cosmic">
              Save intelligence note
            </Button>
          </form>
        </section>

        <section className="border border-border p-5" aria-labelledby="campaign-drafts">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="campaign-drafts" className="text-2xl">
                2 · Campaign drafting
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Drafts are review artifacts only; no channel is connected.
              </p>
            </div>
            <Button variant="signal" size="sm" onClick={makeDraft} disabled={!selectedInsight}>
              Draft from selected note
            </Button>
          </div>
          {store.insights.length > 0 && (
            <label className="mt-5 block text-xs">
              Selected intelligence note
              <select
                className="exchange-select mt-1 w-full"
                value={selectedInsight?.id ?? ""}
                onChange={(event) => setSelectedInsightId(event.target.value)}
              >
                {store.insights.map((insight) => (
                  <option key={insight.id} value={insight.id}>
                    {insight.invention} · {insight.audience} · {insight.confidence}%
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {store.drafts.length === 0 ? (
              <p className="text-xs leading-6 text-muted-foreground">No campaign drafts yet.</p>
            ) : (
              store.drafts.map((draft) => (
                <article key={draft.id} className="border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg text-gold-light">{draft.title}</h3>
                    <DemoBadge label="DRAFT ONLY" />
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                    {draft.body}
                  </pre>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-8 border border-border p-5" aria-labelledby="partner-registry">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="partner-registry" className="text-2xl">
              3 · Agent-partnership workspace
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
              Manually record prospective consenting AI agents or research groups, their
              perspective, invitation status, API/MCP compatibility, requested permissions and human
              approval. Discovery and delivery are not automated.
            </p>
          </div>
          <DemoBadge label="NO UNSOLICITED CONTACT" />
        </div>

        <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={saveProspect}>
          <label className="block text-xs">
            Agent or group name
            <input required name="name" className="exchange-select mt-1 w-full" />
          </label>
          <label className="block text-xs">
            Organization
            <input required name="organization" className="exchange-select mt-1 w-full" />
          </label>
          <label className="block text-xs">
            Relevant focus
            <textarea
              required
              name="focus"
              minLength={10}
              className="exchange-select mt-1 min-h-20 w-full"
            />
          </label>
          <label className="block text-xs">
            Source / provenance note
            <input
              required
              name="source"
              className="exchange-select mt-1 w-full"
              placeholder="Owner-entered public reference or prior introduction"
            />
          </label>
          <label className="block text-xs lg:col-span-2">
            Recorded perspective
            <textarea
              required
              name="perspective"
              minLength={10}
              className="exchange-select mt-1 min-h-24 w-full"
              placeholder="What this agent or group appears to value, based only on the source note…"
            />
          </label>
          <fieldset className="border border-border/70 p-4">
            <legend className="px-2 text-xs text-gold-light">Compatibility evidence</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {compatibilityOptions.map((option) => (
                <label key={option} className="flex gap-2 text-xs">
                  <input type="checkbox" name="compatibility" value={option} />
                  {option.replaceAll("-", " ")}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="border border-border/70 p-4">
            <legend className="px-2 text-xs text-gold-light">Requested future permissions</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissionOptions.map((option) => (
                <label key={option} className="flex gap-2 text-xs">
                  <input type="checkbox" name="permissions" value={option} />
                  {option.replaceAll("-", " ")}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-xs leading-5">
            <input name="ownerAuthorization" type="checkbox" /> Owner authorizes local preparation
            for this prospect.
          </label>
          <label className="block text-xs">
            Human approval
            <select
              name="humanApproval"
              defaultValue="not-reviewed"
              className="exchange-select mt-1 w-full"
            >
              <option value="not-reviewed">Not reviewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <div className="lg:col-span-2">
            <Button type="submit" variant="cosmic">
              Record prospect
            </Button>
          </div>
        </form>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {store.prospects.length === 0 ? (
            <p className="text-xs leading-6 text-muted-foreground">
              No prospective partners recorded.
            </p>
          ) : (
            store.prospects.map((prospect) => {
              const blockers = invitationBlockers(prospect);
              return (
                <article key={prospect.id} className="border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl text-gold-light">{prospect.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {prospect.organization} · {prospect.status.replaceAll("-", " ")} · consent{" "}
                        {prospect.consent.replaceAll("-", " ")}
                      </p>
                    </div>
                    <DemoBadge label={prospect.status === "revoked" ? "REVOKED" : "LOCAL RECORD"} />
                  </div>
                  <p className="mt-4 text-xs leading-6 text-muted-foreground">{prospect.focus}</p>
                  <p className="mt-3 text-xs leading-6">
                    <span className="text-gold">Perspective:</span> {prospect.perspective}
                  </p>
                  <p className="mt-3 text-xs leading-6">
                    <span className="text-gold">Source:</span> {prospect.source}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {prospect.compatibility.map((item) => (
                      <span
                        key={item}
                        className="border border-border px-2 py-1 font-mono text-[9px] uppercase text-muted-foreground"
                      >
                        {item.replaceAll("-", " ")}
                      </span>
                    ))}
                    {prospect.permissions.map((item) => (
                      <span
                        key={item}
                        className="border border-gold/30 px-2 py-1 font-mono text-[9px] uppercase text-gold-light"
                      >
                        {item.replaceAll("-", " ")}
                      </span>
                    ))}
                  </div>
                  {prospect.status !== "revoked" && (
                    <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                      <label className="flex items-start gap-2 text-xs leading-5">
                        <input
                          type="checkbox"
                          checked={prospect.ownerAuthorization}
                          onChange={(event) =>
                            updateProspect(prospect.id, (current) => ({
                              ...current,
                              ownerAuthorization: event.target.checked,
                              status: "identified",
                              updatedAt: stamp(),
                            }))
                          }
                        />
                        Owner authorization
                      </label>
                      <label className="block text-xs">
                        Human approval
                        <select
                          className="exchange-select mt-1 w-full"
                          value={prospect.humanApproval}
                          onChange={(event) =>
                            updateProspect(prospect.id, (current) => ({
                              ...current,
                              humanApproval: event.target.value as HumanApprovalState,
                              status: "identified",
                              updatedAt: stamp(),
                            }))
                          }
                        >
                          <option value="not-reviewed">Not reviewed</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {blockers.length > 0 && prospect.status !== "revoked" && (
                    <ul className="mt-4 space-y-1 text-xs leading-5 text-warning">
                      {blockers.map((blocker) => (
                        <li key={blocker}>Blocked: {blocker}</li>
                      ))}
                    </ul>
                  )}
                  {prospect.invitationDraft && (
                    <pre className="mt-4 whitespace-pre-wrap border border-gold/25 bg-accent/10 p-3 text-xs leading-6 text-muted-foreground">
                      {prospect.invitationDraft}
                    </pre>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="signal"
                      disabled={prospect.status === "revoked"}
                      onClick={() => {
                        const result = prepareInvitation(prospect, stamp());
                        updateProspect(prospect.id, () => result.prospect);
                        setNotice(
                          result.blockers.length
                            ? result.blockers.join(" ")
                            : "Local invitation draft prepared. Delivery remains blocked until a verified consenting channel is authorized.",
                        );
                      }}
                    >
                      Prepare invitation draft
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={prospect.status === "revoked"}
                      onClick={() => {
                        setStore((current) => ({
                          ...current,
                          prospects: current.prospects.map((item) =>
                            item.id === prospect.id ? revokeProspect(item, stamp()) : item,
                          ),
                        }));
                        setNotice("Prospect revoked locally. No external state changed.");
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                  <ul className="mt-4 space-y-1 border-t border-border pt-3 text-[10px] leading-5 text-muted-foreground">
                    {prospect.history.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </article>
              );
            })
          )}
        </div>
      </section>

      <SabrinaDirector insights={store.insights} prospects={store.prospects} drafts={store.drafts} />

      <section className="mt-8 border border-border p-5" aria-labelledby="coordination">
        <h2 id="coordination" className="text-2xl">
          8 · Coordination concept
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {coordinationLanes.map((lane) => (
            <article key={lane.name} className="glass p-4">
              <h3 className="text-lg text-gold-light">{lane.name}</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {lane.role} · {lane.status}
              </p>
              <p className="mt-3 text-xs leading-6 text-warning">{lane.boundary}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
