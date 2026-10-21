import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Radio,
  Globe2,
  Plus,
  X,
  Download,
  Save,
  Check,
  RotateCcw,
  ArrowUpRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { forgeQuery } from "@/lib/forge-query";
import { studioQuery } from "@/lib/quantum-query";
import { betaQuery } from "@/lib/beta-query";
import {
  createRadioVersion,
  saveForgeWeb,
  reviewForgeVersion,
  revokeForgeReview,
  deleteForgeVersion,
  getForgeExport,
} from "@/lib/forge.functions";
import {
  defaultRadioSettings,
  initialWebContent,
  radioSettings,
  webContent,
  webDiff,
  forgeDigest,
  type RadioSettings,
  type WebContent,
} from "@/lib/forge";
import { renderForgeWeb, checkForgeWeb } from "@/lib/forge-web";
import { inspectWav, STUDIO_BUCKET, studioPath } from "@/lib/quantum";
import { readCreativePause } from "@/hooks/use-cartoon";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

type Asset = Database["public"]["Tables"]["studio_assets"]["Row"];
export function ForgeWorkspace({
  projectId,
  selected,
  assets,
  allowed,
  consent,
  paused,
}: {
  projectId: string;
  selected: string;
  assets: Asset[];
  allowed: boolean;
  consent: boolean;
  paused: boolean;
}) {
  const { data } = useSuspenseQuery(forgeQuery),
    query = useQueryClient();
  const radio = useServerFn(createRadioVersion),
    saveWeb = useServerFn(saveForgeWeb),
    review = useServerFn(reviewForgeVersion),
    revoke = useServerFn(revokeForgeReview),
    remove = useServerFn(deleteForgeVersion),
    exportVersion = useServerFn(getForgeExport);
  const [tab, setTab] = useState<"radio" | "web">("radio"),
    [settings, setSettings] = useState<RadioSettings>(defaultRadioSettings),
    [web, setWeb] = useState<WebContent>(initialWebContent);
  const [cue, setCue] = useState({
      start: 0,
      end: 0.1,
      action: "silence" as "silence" | "tone" | "cut",
    }),
    [cueReview, setCueReview] = useState(false),
    [processApproval, setProcessApproval] = useState(false),
    [exportConsent, setExportConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [activeId, setActive] = useState(""),
    [before, setBefore] = useState(""),
    [after, setAfter] = useState("");
  const urls = useRef<string[]>([]),
    epoch = useRef(0);
  const versions = data.versions.filter((v) => v.project_id === projectId),
    active = versions.find((v) => v.id === activeId);
  const reviewed =
    !!active && data.reviews.some((r) => r.version_id === active.id && r.sha256 === active.sha256);
  const original = assets.find(
    (a) => a.id === selected && a.role === "original" && a.project_id === projectId,
  );
  const html = (() => {
    try {
      return renderForgeWeb(web);
    } catch {
      return "<!doctype html><html><body><p>Complete the required draft fields to preview.</p></body></html>";
    }
  })();
  const changed =
    active?.kind === "web" &&
    JSON.stringify(web) !== JSON.stringify(webContent.parse(active.content));
  const previous =
    active?.kind === "web"
      ? versions.find((v) => v.kind === "web" && v.revision < active.revision)
      : versions.find((v) => v.kind === "web");
  const diff = webDiff(previous ? webContent.parse(previous.content) : null, web);
  const clearAudio = () => {
    epoch.current++;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setBefore("");
    setAfter("");
  };
  useEffect(
    () => () => {
      epoch.current++;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  useEffect(() => {
    setProcessApproval(false);
    setExportConsent(false);
    setCueReview(false);
  }, [selected, consent, allowed]);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Forge action failed; no completed output claimed.",
      );
    } finally {
      await Promise.all([
        query.invalidateQueries({ queryKey: forgeQuery.queryKey }),
        query.invalidateQueries({ queryKey: studioQuery.queryKey }),
        query.invalidateQueries({ queryKey: betaQuery.queryKey }),
      ]).catch(() => setNotice("Refresh failed. Reload before relying on saved state."));
      setBusy(false);
    }
  };
  const gate = () => {
    if (!allowed || !consent || paused || readCreativePause())
      throw new Error("Current file permissions and unpaused approved media account required.");
  };
  const blob = async (id: string, expectedSha?: string) => {
    const asset = assets.find((a) => a.id === id);
    if (!asset) throw new Error("Linked media removed or unavailable; reload the library.");
    const result = await supabase.storage
      .from(STUDIO_BUCKET)
      .download(studioPath(asset.owner_id, id));
    if (result.error || !result.data || result.data.size !== asset.byte_size)
      throw new Error("Private media unavailable or size mismatch.");
    const bytes = new Uint8Array(await result.data.arrayBuffer());
    inspectWav(bytes);
    if (expectedSha && (await forgeDigest(bytes)) !== expectedSha)
      throw new Error("Saved digest differs from these bytes. Export blocked.");
    return new Blob([bytes], { type: "audio/wav" });
  };
  const loadVersion = async (version: (typeof data.versions)[number]) => {
    clearAudio();
    setActive(version.id);
    setTab(version.kind === "web" ? "web" : "radio");
    setExportConsent(false);
    setProcessApproval(false);
    if (version.kind === "web") {
      setWeb(webContent.parse(version.content));
      return;
    }
    setSettings(radioSettings.parse(version.content));
    const generation = epoch.current;
    if (!version.source_id || !version.output_id) throw new Error("Media lineage unavailable.");
    const sourceBlob = await blob(version.source_id),
      outputBlob = await blob(version.output_id, version.sha256);
    if (generation !== epoch.current) return;
    const a = URL.createObjectURL(sourceBlob),
      b = URL.createObjectURL(outputBlob);
    urls.current.push(a, b);
    setBefore(a);
    setAfter(b);
  };
  const editSettings = (value: RadioSettings) => {
    setSettings(value);
    setProcessApproval(false);
    setExportConsent(false);
  };
  const editWeb = (value: WebContent) => {
    setWeb(value);
    setExportConsent(false);
  };
  const download = (contents: Blob, name: string) => {
    const url = URL.createObjectURL(contents),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section aria-label="OMNI FORGE" className="mt-12 border-t border-gold/40 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Quantum Studio / cross-media engine</p>
          <h2 className="mt-3 text-3xl">OMNI FORGE</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            One project. Every version remains yours.
          </p>
        </div>
        <Button asChild variant="signal" size="sm">
          <Link
            to="/beta-omni"
            search={{
              studioProject: projectId,
              studioGoal: `@omni Propose a rights-cleared ${tab === "radio" ? settings.label : web.category + " website"} workflow for this project. Do not execute or publish. Text draft only.`,
            }}
          >
            Ask OMNI
            <ArrowUpRight size={14} />
          </Link>
        </Button>
      </header>
      <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
        <Button
          variant={tab === "radio" ? "signal" : "ghost"}
          aria-pressed={tab === "radio"}
          disabled={busy}
          onClick={() => {
            setTab("radio");
            setExportConsent(false);
          }}
        >
          <Radio size={16} />
          Radio Lab
        </Button>
        <Button
          variant={tab === "web" ? "signal" : "ghost"}
          aria-pressed={tab === "web"}
          disabled={busy}
          onClick={() => {
            setTab("web");
            setExportConsent(false);
          }}
        >
          <Globe2 size={16} />
          Web Forge
        </Button>
        <p className="basis-full text-[11px] leading-6 text-muted-foreground">
          Shared private WAV library · separate saved outputs and digest-bound owner reviews · costs
          UNKNOWN · no new subscription or external publishing.
        </p>
      </div>
      {notice && (
        <p role="status" className="mt-4 break-words text-sm leading-7 text-warning">
          {notice}
        </p>
      )}
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0">
          {tab === "radio" ? (
            <section aria-label="Radio edit controls">
              <p className="font-mono text-[10px] text-gold-light">
                REAL PCM EDITS / NOT FFMPEG OR BROADCAST CERTIFICATION
              </p>
              <h3 className="mt-3 text-xl">Review the cue. Preserve the source.</h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Source:{" "}
                {original
                  ? `selected original · ${(original.byte_size / 1024).toFixed(1)} KiB`
                  : "Select Inspect source in the shared library above."}{" "}
                Manual timestamps only; no transcription or profanity detection. Jingles/podcasts
                edit supplied recordings, not generated voices.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs">
                  Version label
                  <select
                    aria-label="Radio version label"
                    className="exchange-select mt-2 w-full"
                    value={settings.label}
                    disabled={busy}
                    onChange={(e) =>
                      editSettings({ ...settings, label: e.target.value as RadioSettings["label"] })
                    }
                  >
                    {[
                      "Clean edit",
                      "Explicit source",
                      "Radio short",
                      "Instrumental source",
                      "Jingle / podcast",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Channel format
                  <select
                    aria-label="Radio channel format"
                    className="exchange-select mt-2 w-full"
                    value={settings.channels}
                    disabled={busy}
                    onChange={(e) =>
                      editSettings({
                        ...settings,
                        channels: e.target.value as RadioSettings["channels"],
                      })
                    }
                  >
                    <option value="keep">Preserve source</option>
                    <option value="mono">Mono downmix</option>
                  </select>
                </label>
              </div>
              {settings.label === "Instrumental source" && (
                <label className="mt-4 flex gap-2 text-xs leading-6">
                  <input
                    type="checkbox"
                    aria-label="Actual instrumental source"
                    checked={settings.instrumentalSource}
                    disabled={busy}
                    onChange={(e) =>
                      editSettings({ ...settings, instrumentalSource: e.target.checked })
                    }
                  />
                  My selected file is already an authorized instrumental. No vocal separation or
                  stem generation is available.
                </label>
              )}
              <fieldset className="mt-5 border-y border-border py-4">
                <legend className="text-xs">Manual cue proposal / seconds</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className="text-xs">
                    Start
                    <input
                      aria-label="Cue start seconds"
                      type="number"
                      min={0}
                      max={30}
                      step={0.001}
                      value={cue.start}
                      disabled={busy}
                      onChange={(e) => {
                        setCue({ ...cue, start: Number(e.target.value) });
                        setCueReview(false);
                      }}
                      className="exchange-select mt-2 w-full"
                    />
                  </label>
                  <label className="text-xs">
                    End
                    <input
                      aria-label="Cue end seconds"
                      type="number"
                      min={0}
                      max={30}
                      step={0.001}
                      value={cue.end}
                      disabled={busy}
                      onChange={(e) => {
                        setCue({ ...cue, end: Number(e.target.value) });
                        setCueReview(false);
                      }}
                      className="exchange-select mt-2 w-full"
                    />
                  </label>
                  <label className="col-span-2 text-xs sm:col-span-1">
                    Replacement
                    <select
                      aria-label="Cue replacement"
                      value={cue.action}
                      disabled={busy}
                      onChange={(e) => {
                        setCue({ ...cue, action: e.target.value as typeof cue.action });
                        setCueReview(false);
                      }}
                      className="exchange-select mt-2 w-full"
                    >
                      <option value="silence">Silence</option>
                      <option value="tone">1 kHz tone</option>
                      <option value="cut">Cut / crossfade</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 flex gap-2 text-xs leading-6">
                  <input
                    type="checkbox"
                    aria-label="Manually reviewed cue"
                    checked={cueReview}
                    disabled={busy}
                    onChange={(e) => setCueReview(e.target.checked)}
                  />
                  I listened to and manually reviewed this exact interval.
                </label>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="ghost"
                  disabled={
                    busy ||
                    !cueReview ||
                    settings.cues.length >= 12 ||
                    settings.label === "Explicit source"
                  }
                  onClick={() => {
                    try {
                      const next = radioSettings.parse({
                        ...settings,
                        cues: [...settings.cues, { ...cue, reviewed: true }],
                      });
                      editSettings(next);
                      setCueReview(false);
                      setNotice("");
                    } catch {
                      setNotice("Enter an end after the start, within 0–30 seconds.");
                    }
                  }}
                >
                  <Plus size={14} />
                  Add reviewed cue
                </Button>
              </fieldset>
              <ul className="mt-3 space-y-2">
                {settings.cues.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 border-b border-border py-2 font-mono text-[11px]"
                  >
                    <span>
                      {c.start.toFixed(3)} → {c.end.toFixed(3)}s · {c.action}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove radio cue ${i + 1}`}
                      disabled={busy}
                      onClick={() =>
                        editSettings({
                          ...settings,
                          cues: settings.cues.filter((_, index) => index !== i),
                        })
                      }
                    >
                      <X size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <label className="text-xs">
                  Fade / overlap (ms)
                  <input
                    aria-label="Radio fade milliseconds"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.fadeMs}
                    disabled={busy}
                    onChange={(e) => editSettings({ ...settings, fadeMs: Number(e.target.value) })}
                    className="exchange-select mt-2 w-full"
                  />
                </label>
                <label className="text-xs">
                  Station max seconds
                  <input
                    aria-label="Station duration limit"
                    type="number"
                    min={0.01}
                    max={30}
                    step={0.01}
                    value={settings.maxSeconds}
                    disabled={busy}
                    onChange={(e) =>
                      editSettings({ ...settings, maxSeconds: Number(e.target.value) })
                    }
                    className="exchange-select mt-2 w-full"
                  />
                </label>
                <label className="text-xs">
                  Sample peak ceiling (dBFS)
                  <input
                    aria-label="Station sample peak limit"
                    type="number"
                    min={-24}
                    max={0}
                    step={0.1}
                    value={settings.maxSamplePeakDb}
                    disabled={busy}
                    onChange={(e) =>
                      editSettings({ ...settings, maxSamplePeakDb: Number(e.target.value) })
                    }
                    className="exchange-select mt-2 w-full"
                  />
                </label>
              </div>
              <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
                Station limits are your declarations, not universal standards. Cut crossfades
                shorten the overlap too; no beat preservation claim. LUFS/true peak, codec
                conversion, long programmes and independent broadcast QA await an approved
                processor.
              </p>
              <label className="mt-5 flex gap-2 text-xs leading-6">
                <input
                  aria-label="Approve radio processing"
                  type="checkbox"
                  checked={processApproval}
                  disabled={busy}
                  onChange={(e) => setProcessApproval(e.target.checked)}
                />
                I authorize these settings and reviewed cues on the selected original; write a new
                private WAV.
              </label>
              <Button
                className="mt-4"
                variant="cosmic"
                disabled={busy || !original || !allowed || !consent || !processApproval}
                onClick={() =>
                  void act(async () => {
                    gate();
                    if (!original) throw new Error("Select original.");
                    const result = await radio({
                      data: {
                        id: original.id,
                        settings,
                        consent: { rights: true, privacy: true },
                        approve: true,
                      },
                    });
                    setActive(result.id);
                    setProcessApproval(false);
                    setExportConsent(false);
                    clearAudio();
                    setNotice(
                      "Radio output saved privately. Load its version below for measured before/after review. No public release.",
                    );
                  })
                }
              >
                <Radio size={14} />
                {busy ? "Working…" : "Create radio version"}
              </Button>
              {(before || after) && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">BEFORE / original</p>
                    <audio
                      src={before}
                      controls
                      preload="metadata"
                      aria-label="Forge original audio"
                      className="h-12 w-full"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      AFTER / saved radio version
                    </p>
                    <audio
                      src={after}
                      controls
                      preload="metadata"
                      aria-label="Forge edited audio"
                      className="h-12 w-full"
                    />
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section aria-label="Web draft editor">
              <p className="font-mono text-[10px] text-gold-light">
                REAL STATIC WEBSITE DRAFT / NO BUILDER CONNECTED
              </p>
              <h3 className="mt-3 text-xl">Shape the release’s home.</h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Editable one-page artist/show/book/cartoon site. Only declared brand copy and a
                private audio reference; no imported images, contact delivery, script execution,
                hosting or domain linking.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["brand", "Brand / project name"],
                    ["headline", "Release headline"],
                    ["cta", "Story link label"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-xs">
                    {label}
                    <input
                      aria-label={`Web ${key}`}
                      value={web[key]}
                      maxLength={key === "brand" ? 100 : key === "headline" ? 140 : 60}
                      disabled={busy}
                      onChange={(e) => editWeb({ ...web, [key]: e.target.value })}
                      className="exchange-select mt-2 w-full"
                    />
                  </label>
                ))}
                <label className="text-xs">
                  Site category
                  <select
                    aria-label="Web category"
                    value={web.category}
                    disabled={busy}
                    onChange={(e) =>
                      editWeb({ ...web, category: e.target.value as WebContent["category"] })
                    }
                    className="exchange-select mt-2 w-full"
                  >
                    {["Artist", "Show", "Book", "Original cartoon"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              {(
                [
                  ["description", "Search / sharing description", 300],
                  ["about", "Story / brand copy", 1500],
                  ["credits", "Creator / rights credits", 500],
                ] as const
              ).map(([key, label, max]) => (
                <label key={key} className="mt-4 block text-xs">
                  {label}
                  <textarea
                    aria-label={`Web ${key}`}
                    value={web[key]}
                    maxLength={max}
                    disabled={busy}
                    onChange={(e) => editWeb({ ...web, [key]: e.target.value })}
                    className="exchange-select mt-2 min-h-20 w-full"
                  />
                </label>
              ))}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-xs">
                  Palette
                  <select
                    aria-label="Web palette"
                    value={web.theme}
                    disabled={busy}
                    onChange={(e) =>
                      editWeb({ ...web, theme: e.target.value as WebContent["theme"] })
                    }
                    className="exchange-select mt-2 w-full"
                  >
                    <option value="gold">Mothership gold</option>
                    <option value="forest">Botanical silver</option>
                    <option value="rose">Rose / charcoal</option>
                  </select>
                </label>
                <label className="text-xs">
                  Shared library / audio reference
                  <select
                    aria-label="Web shared audio"
                    value={web.audioAssetId ?? ""}
                    disabled={busy}
                    onChange={(e) => editWeb({ ...web, audioAssetId: e.target.value || null })}
                    className="exchange-select mt-2 w-full"
                  >
                    <option value="">No attached reference</option>
                    {assets
                      .filter((a) => a.project_id === projectId)
                      .map((a, i) => (
                        <option key={a.id} value={a.id}>
                          {a.role === "original" ? "Original" : "Enhanced / radio"} WAV {i + 1}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="signal"
                  disabled={busy || !allowed || !consent || !projectId}
                  onClick={() =>
                    void act(async () => {
                      gate();
                      const result = await saveWeb({
                        data: { projectId, content: web, consent: { rights: true, privacy: true } },
                      });
                      setActive(result.id);
                      setExportConsent(false);
                      setNotice(
                        "Private web draft version saved. Review its preview, diff and checks before export. No deployment.",
                      );
                    })
                  }
                >
                  <Save size={14} />
                  Save new web version
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || active?.kind !== "web"}
                  onClick={() => {
                    if (active?.kind === "web") {
                      setWeb(webContent.parse(active.content));
                      setExportConsent(false);
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  Restore saved draft
                </Button>
              </div>
              <div className="mt-6 overflow-hidden rounded-sm border border-border">
                <iframe
                  title="Web Forge preview"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={html}
                  className="h-[580px] w-full bg-background"
                />
              </div>
              <p className="mt-3 text-xs text-warning">
                {changed
                  ? "MODIFIED DRAFT / saved approval does not cover these changes"
                  : "PREVIEW ONLY / no deployment, private audio or external requests"}
              </p>
              <details className="mt-4 border-t border-border pt-4">
                <summary className="cursor-pointer text-xs">
                  Field diff / prior saved revision
                </summary>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-6 text-muted-foreground">
                  {JSON.stringify(diff, null, 2)}
                </pre>
              </details>
              <details className="mt-4 border-t border-border pt-4">
                <summary className="cursor-pointer text-xs">
                  Static document checks / not independent accessibility certification
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-all text-[10px] leading-6 text-muted-foreground">
                  {(() => {
                    try {
                      return JSON.stringify(checkForgeWeb(web), null, 2);
                    } catch {
                      return "Complete the required draft fields.";
                    }
                  })()}
                </pre>
              </details>
            </section>
          )}
        </div>
        <aside className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <h3 className="text-lg">Version checkpoints</h3>
          <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
            Saved outputs, not an automatic task queue. Each new version needs its own owner review.
            Storage/hosting costs unknown; no model calls or paid processor fees recorded. Owner
            review is not a security restriction on your existing private-library access.
          </p>
          <ul className="mt-4 space-y-4">
            {versions.map((v) => (
              <li key={v.id} className="border-t border-border pt-3">
                <p className="text-xs text-gold-light">
                  {v.kind === "radio" ? "Radio" : "Web"} · revision {v.revision}
                </p>
                <p className="mt-2 font-mono text-[10px] leading-6 text-muted-foreground">
                  OUTPUT SAVED
                  <br />
                  {data.reviews.some((r) => r.version_id === v.id)
                    ? "OWNER EXPORT REVIEW RECORDED"
                    : "AWAITING OWNER REVIEW"}
                  <br />
                  Cost: {v.cost_status}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant={activeId === v.id ? "signal" : "ghost"}
                    disabled={busy}
                    onClick={() => void act(() => loadVersion(v))}
                  >
                    Load version
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${v.kind} version ${v.revision}`}
                    title="Delete checkpoint; media retained"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this checkpoint and review? Its audio files remain in your private library.",
                        )
                      )
                        void act(async () => {
                          await remove({ data: { id: v.id } });
                          if (activeId === v.id) {
                            setActive("");
                            clearAudio();
                            setExportConsent(false);
                          }
                          setNotice(
                            "Checkpoint deleted; media retained. Delete unwanted audio separately.",
                          );
                        });
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!versions.length && (
            <p className="mt-5 text-xs text-muted-foreground">No Forge outputs in this project.</p>
          )}
          {active && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs text-gold-light">
                Selected {active.kind} / {active.revision}
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs">Measured checks & digest</summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-6 text-muted-foreground">
                  {JSON.stringify(
                    {
                      sha256: active.sha256,
                      processor: active.processor,
                      evidence: active.evidence,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <label className="mt-4 flex items-start gap-2 text-xs leading-6">
                <input
                  aria-label="Review Forge export"
                  type="checkbox"
                  checked={exportConsent}
                  disabled={busy || !!changed}
                  onChange={(e) => setExportConsent(e.target.checked)}
                />
                I reviewed this exact saved version and approve private export. Rights remain my
                declaration; no publication permission.
              </label>
              <div className="mt-3 space-y-2">
                {!reviewed ? (
                  <Button
                    variant="signal"
                    size="sm"
                    disabled={busy || !exportConsent || !consent || !allowed || !!changed}
                    onClick={() =>
                      void act(async () => {
                        gate();
                        await review({
                          data: {
                            id: active.id,
                            consent: { rights: true, privacy: true },
                            approve: true,
                          },
                        });
                        setNotice(
                          "Owner export review recorded for this exact digest. No deployment authority.",
                        );
                      })
                    }
                  >
                    <Check size={14} />
                    Record owner review
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await revoke({ data: { id: active.id } });
                        setExportConsent(false);
                        setNotice("Export review withdrawn.");
                      })
                    }
                  >
                    Withdraw review
                  </Button>
                )}
                <Button
                  variant="cosmic"
                  size="sm"
                  disabled={
                    busy || !reviewed || !exportConsent || !consent || !allowed || !!changed
                  }
                  onClick={() =>
                    void act(async () => {
                      gate();
                      const currentExport = await exportVersion({ data: { id: active.id } });
                      if (currentExport.version.sha256 !== active.sha256)
                        throw new Error("Saved version changed. Reload and review again.");
                      if (active.kind === "radio") {
                        if (!active.output_id) throw new Error("Output missing.");
                        download(
                          await blob(active.output_id, active.sha256),
                          `forge-radio-v${active.revision}.wav`,
                        );
                      } else {
                        const content = webContent.parse(active.content),
                          document = renderForgeWeb(content);
                        if (
                          (await forgeDigest(new TextEncoder().encode(document))) !== active.sha256
                        )
                          throw new Error(
                            "Renderer changed; save and review a fresh version before export.",
                          );
                        download(
                          new Blob([document], { type: "text/html" }),
                          `forge-web-v${active.revision}.html`,
                        );
                      }
                      download(
                        new Blob(
                          [
                            JSON.stringify(
                              {
                                mode: "PRIVATE EXPORT / NOT PUBLISHED",
                                version: active,
                                review: currentExport.review,
                                signature: null,
                                costs: "UNKNOWN",
                                externalDelivery: "NOT RUN",
                              },
                              null,
                              2,
                            ),
                          ],
                          { type: "application/json" },
                        ),
                        `forge-${active.kind}-v${active.revision}-manifest.json`,
                      );
                      setNotice(
                        "Reviewed export requested with manifest. No domain, hosting or public release changed.",
                      );
                    })
                  }
                >
                  <Download size={14} />
                  Export saved {active.kind}
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
      <footer className="mt-8 border-t border-border pt-5 text-[11px] leading-7 text-muted-foreground">
        <p>
          FFmpeg, LUFS/true-peak analysis and full media production: NOT CONNECTED. Web
          builder/GitHub/staging: NOT CONNECTED. Video assets, trailers, cartoon production and
          multi-page sites remain plans; no fabricated outputs. A private web draft may reference a
          shared audio version, but never embeds its private URL.
        </p>
        <p className="mt-3 font-mono text-warning">
          omni forge · omni forge radio · omni forge web — PLANNED / NOT EXECUTABLE
        </p>
      </footer>
    </section>
  );
}
