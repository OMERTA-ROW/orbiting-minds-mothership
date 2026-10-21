import { useEffect, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Gamepad2,
  Mic2,
  Network,
  Save,
  Download,
  RotateCcw,
  ShieldCheck,
  Ban,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { creatorForgeQuery } from "@/lib/forge-distro-query";
import { saveCreatorCanon, saveDistroDraft, actOnDistro } from "@/lib/forge-distro.functions";
import {
  initialCanon,
  initialRelease,
  branches,
  branchPlan,
  canonSchema,
  releaseSchema,
  releaseChannels,
  channelEvidence,
  canonicalJson,
  type Canon,
  type ReleaseDraft,
} from "@/lib/forge-universe";
import { readCreativePause } from "@/hooks/use-cartoon";
import type { Database } from "@/integrations/supabase/types";

type Asset = Database["public"]["Tables"]["studio_assets"]["Row"];
const control = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
export function CreatorDistro({
  projectId,
  assets,
  allowed,
  consent,
}: {
  projectId: string;
  assets: Asset[];
  allowed: boolean;
  consent: boolean;
}) {
  const { data } = useSuspenseQuery(creatorForgeQuery),
    query = useQueryClient();
  const saveCanon = useServerFn(saveCreatorCanon),
    saveRelease = useServerFn(saveDistroDraft),
    transition = useServerFn(actOnDistro);
  const [tab, setTab] = useState<"canon" | "distro">("canon"),
    [canon, setCanon] = useState<Canon>(initialCanon),
    [draft, setDraft] = useState<ReleaseDraft>(initialRelease);
  const [activeId, setActive] = useState(""),
    [approval, setApproval] = useState(false),
    [ownsSite, setOwnsSite] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const versions = data.versions.filter((v) => v.project_id === projectId),
    canons = versions.filter((v) => v.kind === "canon"),
    releases = versions.filter((v) => v.kind === "release");
  const active = versions.find((v) => v.id === activeId),
    kind = tab === "canon" ? "canon" : "release";
  const content = tab === "canon" ? canon : draft;
  const unchanged =
    !!active && active.kind === kind && canonicalJson(active.content) === canonicalJson(content);
  const valid =
    tab === "canon" ? canonSchema.safeParse(canon).success : releaseSchema.safeParse(draft).success;
  const ready = allowed && consent && !!projectId;
  useEffect(() => {
    setApproval(false);
    setOwnsSite(false);
  }, [allowed, consent]);
  const patchCanon = (value: Partial<Canon>) => {
    setCanon((v) => ({ ...v, ...value }));
    setApproval(false);
  };
  const patchDraft = (value: Partial<ReleaseDraft>) => {
    setDraft((v) => ({ ...v, ...value }));
    setApproval(false);
  };
  const act = async (fn: () => Promise<void>, withdrawal = false) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      if (!withdrawal && (!ready || readCreativePause()))
        throw new Error("Current account, consent or local planning pause blocks this action.");
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Release action failed; no delivery recorded.");
    } finally {
      await query
        .invalidateQueries({ queryKey: creatorForgeQuery.queryKey })
        .catch(() => setNotice("Refresh failed; reload to inspect saved release state."));
      setBusy(false);
    }
  };
  const load = (v: (typeof versions)[number]) => {
    setTab(v.kind === "canon" ? "canon" : "distro");
    setActive(v.id);
    setApproval(false);
    setOwnsSite(false);
    if (v.kind === "canon") setCanon(canonSchema.parse(v.content));
    else setDraft(releaseSchema.parse(v.content));
  };
  const plans = (() => {
    try {
      return branchPlan(canon);
    } catch {
      return [];
    }
  })();
  const evidence = channelEvidence(draft.channel);
  return (
    <section
      aria-label="Creator Universe and Distro"
      className="mt-12 min-w-0 scroll-mt-24 border-t border-border pt-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">OMNI FORGE / Creator Universe</p>
          <h2 className="mt-3 text-2xl">One canon. Many creations.</h2>
        </div>
        <span className="font-mono text-xs text-warning">PRIVATE BETA · MANUAL EXPORT</span>
      </div>
      <div className="my-6 flex flex-wrap gap-2" role="tablist" aria-label="Creator workspace">
        <Button
          role="tab"
          aria-selected={tab === "canon"}
          variant={tab === "canon" ? "signal" : "ghost"}
          onClick={() => {
            setTab("canon");
            setApproval(false);
          }}
        >
          <Network size={16} />
          Genesis Mode
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "distro"}
          variant={tab === "distro" ? "signal" : "ghost"}
          onClick={() => {
            setTab("distro");
            setApproval(false);
          }}
        >
          <Download size={16} />
          OMNI FORGE DISTRO
        </Button>
      </div>
      {notice && (
        <p
          role="status"
          className="mb-6 break-words border-l-2 border-gold pl-4 text-sm text-gold-light"
        >
          {notice}
        </p>
      )}
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
        <div className="min-w-0">
          {tab === "canon" ? (
            <div className="space-y-4">
              <label className="block text-xs text-muted-foreground">
                Universe name
                <Input
                  aria-label="Universe name"
                  value={canon.name}
                  maxLength={100}
                  onChange={(e) => patchCanon({ name: e.target.value })}
                  className="mt-2"
                />
              </label>
              {(
                [
                  ["premise", "Original premise"],
                  ["characters", "Character canon"],
                  ["rules", "Continuity rules"],
                  ["provenance", "Rights provenance"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-muted-foreground">
                  {label}
                  <Textarea
                    aria-label={label}
                    value={canon[key]}
                    maxLength={key === "characters" || key === "rules" ? 2000 : 1500}
                    onChange={(e) => patchCanon({ [key]: e.target.value })}
                    className="mt-2 min-h-24"
                  />
                </label>
              ))}
              <fieldset>
                <legend className="text-xs text-muted-foreground">Creation branches</legend>
                <div className="mt-3 flex flex-wrap gap-4">
                  {branches.map((b) => (
                    <label key={b} className="flex items-center gap-2 text-sm capitalize">
                      <input
                        type="checkbox"
                        checked={canon.branches.includes(b)}
                        onChange={(e) =>
                          patchCanon({
                            branches: e.target.checked
                              ? [...canon.branches, b]
                              : canon.branches.filter((v) => v !== b),
                          })
                        }
                      />
                      {b}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                disabled={!ready || !valid || busy}
                onClick={() =>
                  void act(async () => {
                    const v = await saveCanon({
                      data: { projectId, content: canon, consent: { rights: true, privacy: true } },
                    });
                    setActive(v.id);
                    setNotice(
                      "New private canon version saved. Branches remain plans, not executed assets.",
                    );
                  })
                }
              >
                <Save size={16} />
                Save canon version
              </Button>
              <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                {plans.map((p) => (
                  <div key={p.kind} className="min-w-0 border-l border-border pl-4">
                    <h3 className="text-sm capitalize">
                      {p.kind === "podcast" ? (
                        <Mic2 className="mb-2 text-gold" size={18} />
                      ) : p.kind === "game" ? (
                        <Gamepad2 className="mb-2 text-gold" size={18} />
                      ) : (
                        <BookOpen className="mb-2 text-gold" size={18} />
                      )}
                      {p.kind === "podcast"
                        ? "Podcast Forge"
                        : p.kind === "game"
                          ? "Game Forge"
                          : p.kind}
                    </h3>
                    <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
                      {p.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <p className="mt-3 font-mono text-[10px] text-warning">
                      PLAN / NO RECORDING, TRANSCRIPT OR BUILD
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-xs text-muted-foreground">
                Release channel
                <select
                  aria-label="Release channel"
                  className={`${control} mt-2`}
                  value={draft.channel}
                  onChange={(e) =>
                    patchDraft({ channel: e.target.value as ReleaseDraft["channel"] })
                  }
                >
                  {releaseChannels.map((c) => (
                    <option key={c} value={c}>
                      {c === "rss" ? "Podcast RSS / manual owned-site bundle" : c.replace("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <p className="font-mono text-xs leading-6 text-warning">
                {evidence.connection} · {evidence.capability}
                <br />
                {evidence.providerCost} · AUTOPUBLISH OFF
              </p>
              {(
                [
                  ["title", "Release title"],
                  ["description", "Release description / show notes"],
                  ["credits", "Creator credits"],
                  ["license", "Release license and rights"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-muted-foreground">
                  {label}
                  <Textarea
                    aria-label={label}
                    value={draft[key]}
                    maxLength={
                      key === "description"
                        ? 3000
                        : key === "credits"
                          ? 1500
                          : key === "title"
                            ? 140
                            : 500
                    }
                    onChange={(e) => patchDraft({ [key]: e.target.value })}
                    className="mt-2"
                  />
                </label>
              ))}
              <label className="block text-xs text-muted-foreground">
                Shared canon
                <select
                  aria-label="Shared canon"
                  value={draft.canonId ?? ""}
                  className={`${control} mt-2`}
                  onChange={(e) => patchDraft({ canonId: e.target.value || null })}
                >
                  <option value="">No canon attached</option>
                  {canons.map((v) => (
                    <option key={v.id} value={v.id}>
                      {canonSchema.parse(v.content).name} · version {v.revision}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Private WAV output
                <select
                  aria-label="Distro private WAV"
                  value={draft.assetId ?? ""}
                  className={`${control} mt-2`}
                  onChange={(e) => patchDraft({ assetId: e.target.value || null })}
                >
                  <option value="">Select hashed WAV</option>
                  {assets
                    .filter((v) => v.sha256)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.role} · {v.byte_size} bytes · {v.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Owned-site directory (declaration, not verified)
                <Input
                  aria-label="Owned-site directory"
                  value={draft.siteUrl}
                  placeholder="https://your-owned-site.net/podcast"
                  maxLength={500}
                  onChange={(e) => {
                    patchDraft({ siteUrl: e.target.value });
                    setOwnsSite(false);
                  }}
                  className="mt-2"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Target date — intention only, no scheduled delivery
                <Input
                  aria-label="Target release date"
                  type="datetime-local"
                  value={draft.targetDate ? draft.targetDate.slice(0, 16) : ""}
                  onChange={(e) =>
                    patchDraft({ targetDate: e.target.value ? `${e.target.value}:00.000Z` : "" })
                  }
                  className="mt-2"
                />
                <span className="mt-1 block">UTC</span>
              </label>
              <label className="flex items-start gap-3 text-xs">
                <input
                  type="checkbox"
                  checked={draft.explicit}
                  onChange={(e) => patchDraft({ explicit: e.target.checked })}
                />
                Explicit content declaration
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!ready || !valid || busy}
                  onClick={() =>
                    void act(async () => {
                      const v = await saveRelease({
                        data: {
                          projectId,
                          content: draft,
                          consent: { rights: true, privacy: true },
                        },
                      });
                      setActive(v.id);
                      setApproval(false);
                      setNotice(
                        "Release saved as DRAFT. No upload, schedule or platform delivery.",
                      );
                    })
                  }
                >
                  <Save size={16} />
                  Save release draft
                </Button>
                {active?.kind === "release" && (
                  <Button variant="ghost" onClick={() => load(active)} disabled={busy}>
                    <RotateCcw size={16} />
                    Restore saved release
                  </Button>
                )}
              </div>
              {active?.kind === "release" && (
                <div className="space-y-4 border-t border-border pt-5">
                  <p className="font-mono text-xs text-gold-light">
                    {active.state} · exact version {active.revision}
                  </p>
                  <label className="flex items-start gap-3 text-xs">
                    <input
                      aria-label="Approve Distro export"
                      type="checkbox"
                      checked={approval}
                      onChange={(e) => setApproval(e.target.checked)}
                    />
                    I reviewed this exact draft, its credits, license, voice/likeness and privacy;
                    approve manual export only.
                  </label>
                  {draft.channel === "rss" && (
                    <label className="flex items-start gap-3 text-xs">
                      <input
                        aria-label="Confirm owned site"
                        type="checkbox"
                        checked={ownsSite}
                        onChange={(e) => setOwnsSite(e.target.checked)}
                      />
                      I control the declared site and will upload and verify public files myself.
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={
                        !ready ||
                        !unchanged ||
                        !approval ||
                        busy ||
                        active.state !== "DRAFT" ||
                        (draft.channel === "rss" && !ownsSite)
                      }
                      onClick={() =>
                        void act(async () => {
                          await transition({
                            data: {
                              id: active.id,
                              action: "review",
                              consent: { rights: true, privacy: true },
                              approve: true,
                              ownedSite: ownsSite,
                            },
                          });
                          setNotice(
                            "Exact draft reviewed for manual export. Publishing remains unavailable.",
                          );
                        })
                      }
                    >
                      <ShieldCheck size={16} />
                      Review release
                    </Button>
                    <Button
                      variant="signal"
                      disabled={
                        !ready ||
                        !unchanged ||
                        !approval ||
                        busy ||
                        !["REVIEWED", "BUNDLE_PREPARED"].includes(active.state) ||
                        (draft.channel === "rss" && !ownsSite)
                      }
                      onClick={() =>
                        void act(async () => {
                          const r = await transition({
                            data: {
                              id: active.id,
                              action: "prepare",
                              consent: { rights: true, privacy: true },
                              approve: true,
                              ownedSite: ownsSite,
                            },
                          });
                          if (!r.archive) throw new Error("No bundle returned.");
                          if (readCreativePause())
                            throw new Error("Planning paused; download cancelled.");
                          const bytes = Uint8Array.from(atob(r.archive), (c) => c.charCodeAt(0));
                          const url = URL.createObjectURL(
                            new Blob([bytes], { type: "application/zip" }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = r.filename;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                          setNotice(
                            "Manual bundle prepared; download requested. NOT UPLOADED — no receipt or public URL confirmed.",
                          );
                        })
                      }
                    >
                      <Download size={16} />
                      Prepare manual bundle
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || active.state === "REVOKED"}
                      onClick={() =>
                        void act(async () => {
                          await transition({ data: { id: active.id, action: "revoke" } });
                          setApproval(false);
                          setNotice(
                            "Future bundle preparation revoked. Already downloaded copies cannot be recalled.",
                          );
                        }, true)
                      }
                    >
                      <Ban size={16} />
                      Revoke release
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs leading-6 text-muted-foreground">
                RSS includes the exact private WAV you approve. Other channels export metadata/canon
                only. Captions, artwork, transcripts, clips, RSS hosting, platform receipts, retries
                and timed autopublishing are not connected. WAV acceptance varies by platform.
              </p>
            </div>
          )}
        </div>
        <aside className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="eyebrow">{tab === "canon" ? "Saved canon" : "Release console"}</p>
          <div className="mt-5 space-y-3">
            {(tab === "canon" ? canons : releases).length === 0 && (
              <p className="text-xs text-muted-foreground">
                No saved {tab === "canon" ? "canon" : "releases"} in this project.
              </p>
            )}
            {(tab === "canon" ? canons : releases).map((v) => (
              <article key={v.id} className="min-w-0 border-b border-border pb-4">
                <h3 className="break-words text-sm">
                  {v.kind === "canon"
                    ? canonSchema.parse(v.content).name
                    : releaseSchema.parse(v.content).title}
                </h3>
                <p className="mt-2 font-mono text-[10px] text-warning">
                  Version {v.revision} · {v.state}
                  {v.kind === "release" ? " · NOT DELIVERED" : " · PLAN ONLY"}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => load(v)}
                  disabled={busy}
                >
                  Load {v.kind === "canon" ? "canon" : "release"}
                </Button>
              </article>
            ))}
          </div>
          {tab === "distro" && (
            <>
              <p className="eyebrow mt-8">Private version audit</p>
              <ol className="mt-4 space-y-3 text-xs text-muted-foreground">
                {data.audit
                  .filter((e) => versions.some((v) => v.id === e.record_id))
                  .slice(0, 12)
                  .map((e) => (
                    <li key={e.id}>
                      <span className="text-gold-light">{e.action}</span> ·{" "}
                      {new Date(e.occurred_at).toUTCString()}
                      <br />
                      Saved-record change, not a platform receipt
                    </li>
                  ))}
              </ol>
            </>
          )}
          <Button asChild variant="ghost" className="mt-6">
            <Link
              to="/beta-omni"
              search={{
                studioProject: projectId || undefined,
                studioGoal: `Propose a rights-cleared ${tab === "canon" ? canon.name : draft.title} production plan. No files, publishing or tool access granted.`,
              }}
            >
              Ask OMNI
              <ArrowUpRight size={14} />
            </Link>
          </Button>
          <p className="mt-5 font-mono text-[10px] leading-6 text-warning">
            NATIVE FORGE COMMANDS: PLANNED
            <br />
            NO CONNECTED DISTRIBUTION ADAPTERS
          </p>
        </aside>
      </div>
    </section>
  );
}
