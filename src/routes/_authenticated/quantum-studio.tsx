import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  SlidersHorizontal,
  Download,
  Trash2,
  RotateCcw,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import { betaQuery } from "@/lib/beta-query";
import { studioQuery } from "@/lib/quantum-query";
import { reserveStudioAsset, processStudioAsset, removeStudioAsset } from "@/lib/quantum.functions";
import { inspectWav, studioPath, STUDIO_BUCKET, MAX_MEDIA_BYTES } from "@/lib/quantum";
import { supabase } from "@/integrations/supabase/client";
import { QuantumPlanner } from "@/components/entertainment/QuantumPlanner";
import { ForgeWorkspace } from "@/components/entertainment/ForgeWorkspace";
import { forgeQuery } from "@/lib/forge-query";
import { Button } from "@/components/ui/button";
import { useGuardian } from "@/hooks/use-guardian";
import { readCreativePause } from "@/hooks/use-cartoon";
import { seo } from "@/lib/seo";
import studioArt from "@/assets/entertainment-studio.jpg";

export const Route = createFileRoute("/_authenticated/quantum-studio")({
  head: () =>
    seo(
      "Quantum Studio & OMNI FORGE · Private creation beta",
      "Private WAV gain and manually reviewed radio edits, measured output checks and editable safe Web Forge drafts. Separate version-bound owner export reviews; no FFmpeg, public deployment or domain changes.",
    ),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(betaQuery),
      context.queryClient.ensureQueryData(studioQuery),
      context.queryClient.ensureQueryData(forgeQuery),
    ]);
  },
  component: QuantumStudio,
});
function QuantumStudio() {
  const { data: beta } = useSuspenseQuery(betaQuery),
    { data: studio } = useSuspenseQuery(studioQuery),
    query = useQueryClient();
  const { store: guardian, ready: guardianReady } = useGuardian();
  const reserve = useServerFn(reserveStudioAsset),
    process = useServerFn(processStudioAsset),
    remove = useServerFn(removeStudioAsset);
  const [projectId, setProject] = useState(beta.projects[0]?.id ?? ""),
    [selected, setSelected] = useState(""),
    [gain, setGain] = useState(-3);
  const [rights, setRights] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [approve, setApprove] = useState(false),
    [exportApproval, setExportApproval] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [report, setReport] = useState<unknown>(null);
  const [beforeUrl, setBefore] = useState(""),
    [afterUrl, setAfter] = useState(""),
    [afterId, setAfterId] = useState("");
  const objectUrls = useRef<string[]>([]),
    generation = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const consent = rights && privacy,
    paused = !guardianReady || guardian.paused || studio.access?.paused;
  const allowed = !!studio.access?.studio_approved && !paused;
  const assets = studio.assets.filter((a) => a.project_id === projectId),
    original = assets.find((a) => a.id === selected && a.role === "original");
  const clearPreview = () => {
    generation.current++;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setBefore("");
    setAfter("");
    setAfterId("");
    setReport(null);
    setExportApproval(false);
    setApprove(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const refresh = async () => {
    await Promise.all([
      query.invalidateQueries({ queryKey: studioQuery.queryKey }),
      query.invalidateQueries({ queryKey: betaQuery.queryKey }),
    ]);
  };
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Media action failed. No success recorded.");
    } finally {
      await refresh().catch(() =>
        setNotice("Action completed or failed; refresh failed. Reload to inspect saved records."),
      );
      setBusy(false);
    }
  };
  const checkPause = () => {
    if (!allowed || readCreativePause())
      throw new Error("Account, Guardian or Nexus paused; processing blocked.");
  };
  const loadAudio = async (id: string, owner: string) => {
    const result = await supabase.storage.from(STUDIO_BUCKET).download(studioPath(owner, id));
    if (result.error || !result.data)
      throw new Error(
        "Audio unavailable. A reservation without a file can be removed and uploaded again.",
      );
    const bytes = new Uint8Array(await result.data.arrayBuffer());
    inspectWav(bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    objectUrls.current.push(url);
    return url;
  };
  const compare = async (asset: (typeof studio.assets)[number]) => {
    clearPreview();
    const current = generation.current;
    const source = asset.role === "original" ? asset : assets.find((a) => a.id === asset.source_id);
    if (!source) throw new Error("Original metadata missing.");
    if (source.id !== selected) {
      setRights(false);
      setPrivacy(false);
    }
    const url = await loadAudio(source.id, source.owner_id);
    if (current !== generation.current) {
      URL.revokeObjectURL(url);
      return;
    }
    setBefore(url);
    setSelected(source.id);
    if (asset.role === "enhanced") {
      const out = await loadAudio(asset.id, asset.owner_id);
      if (current !== generation.current) {
        URL.revokeObjectURL(out);
        return;
      }
      setAfter(out);
      setAfterId(asset.id);
      setReport({
        metrics: asset.metrics,
        sha256: asset.sha256,
        evidence: "Measured by this pipeline; not signed independent quality or rights proof.",
      });
    }
  };
  return (
    <main className="pb-16">
      <header className="relative min-h-64 overflow-hidden border-b border-gold/30">
        <img
          src={studioArt}
          alt="Fictional cosmic production studio, not a connected facility"
          className="absolute inset-0 h-full w-full object-cover object-right"
          width={1600}
          height={896}
        />
        <div className="open-call-shade absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 py-10 md:px-8">
          <p className="eyebrow">Entertainment Galaxy / private media beta</p>
          <h1 className="mt-4 text-3xl md:text-4xl">Quantum Studio</h1>
          <p className="mt-4 max-w-xl text-sm leading-7">
            One source. New possibilities. Your approval.
          </p>
          <p className="mt-3 max-w-xl text-xs leading-6 text-muted-foreground">
            Quantum is creative-production branding, not quantum computing.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="signal" size="sm">
              <Link to="/beta-omni">
                OMNI
                <ArrowUpRight size={14} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/beta">Your projects</Link>
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 pt-7 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <label className="block min-w-0 text-xs">
            Private project
            <select
              aria-label="Studio project"
              className="exchange-select mt-2 w-full max-w-sm"
              value={projectId}
              disabled={busy}
              onChange={(e) => {
                clearPreview();
                setProject(e.target.value);
                setSelected("");
                setRights(false);
                setPrivacy(false);
              }}
            >
              <option value="">Select your project</option>
              {beta.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-sm font-mono text-[10px] leading-6 text-warning">
            {studio.access?.studio_approved
              ? paused
                ? "PROCESSING PAUSED"
                : "APPROVED PRIVATE MEDIA BETA"
              : "MEDIA ACCESS AWAITS OWNER APPROVAL"}
            <br />
            {studio.assets.length} / 8 assets · 4 MiB each · 30 seconds
          </p>
        </div>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          REAL: private WAV storage and bounded level adjustment. 16-bit PCM · mono/stereo · 8–48
          kHz. No microphone, device scan, external editor, paid media provider or publication.
          Storage/hosting charges may apply; exact charge unavailable. No per-operation AI call.
        </p>
        {notice && (
          <p
            role="status"
            className="mt-5 break-words border-l border-warning pl-4 text-sm leading-7 text-warning"
          >
            {notice}
          </p>
        )}
        <section
          aria-label="Media permissions"
          className="mt-6 grid gap-3 border-y border-border py-5 text-xs leading-6 md:grid-cols-2"
        >
          <label className="flex items-start gap-3">
            <input
              aria-label="Media rights consent"
              type="checkbox"
              checked={rights}
              disabled={busy}
              onChange={(e) => {
                setRights(e.target.checked);
                setApprove(false);
                setExportApproval(false);
              }}
              className="mt-1"
            />
            I own or have permission to use this file, including its music, voices and likenesses.
            No unconsented impersonation or copyrighted character cloning.
          </label>
          <label className="flex items-start gap-3">
            <input
              aria-label="Private file permission"
              type="checkbox"
              checked={privacy}
              disabled={busy}
              onChange={(e) => {
                setPrivacy(e.target.checked);
                setApprove(false);
                setExportApproval(false);
              }}
              className="mt-1"
            />
            I authorize storage and processing of this selected file in my private account. No
            child/private third-party data. No model receives audio. Metadata is not a confidential
            scan or legal rights review.
          </label>
        </section>
        <div className="mt-7 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl">Source & versions</h2>
              <Button
                variant="signal"
                size="sm"
                disabled={!allowed || !projectId || !consent || busy || studio.assets.length >= 8}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={14} />
                Upload WAV
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".wav,audio/wav,audio/x-wav"
              className="hidden"
              aria-label="Upload private WAV"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void act(async () => {
                  checkPause();
                  if (!consent) throw new Error("File permissions required.");
                  if (file.size < 44 || file.size > MAX_MEDIA_BYTES)
                    throw new Error("Use a WAV file up to 4 MiB.");
                  inspectWav(new Uint8Array(await file.arrayBuffer()));
                  const saved = await reserve({
                    data: { projectId, bytes: file.size, consent: { rights: true, privacy: true } },
                  });
                  const uploaded = await supabase.storage
                    .from(STUDIO_BUCKET)
                    .upload(studioPath(saved.owner_id, saved.id), file, {
                      contentType: "audio/wav",
                      upsert: false,
                    });
                  if (uploaded.error) {
                    await remove({ data: { id: saved.id } });
                    throw new Error("Upload failed; original was not processed.");
                  }
                  setSelected(saved.id);
                  clearPreview();
                  setRights(false);
                  setPrivacy(false);
                  setNotice("Original saved privately. No enhancement has run.");
                });
              }}
            />
            {!assets.length && (
              <p className="mt-6 text-xs leading-6 text-muted-foreground">
                No files in this project. Original filenames are not stored.
              </p>
            )}
            <ul className="mt-5 space-y-4">
              {assets.map((a, i) => (
                <li key={a.id} className="border-t border-border pt-4">
                  <p className="text-xs text-gold-light">
                    {a.role === "original" ? "Original WAV" : `Enhanced WAV · ${a.gain_db} dB`} /{" "}
                    {assets.length - i}
                  </p>
                  <p className="mt-2 text-[10px] leading-6 text-muted-foreground">
                    {(a.byte_size / 1024).toFixed(1)} KiB ·{" "}
                    {new Date(a.created_at).toLocaleString()}
                    <br />
                    {a.role === "original"
                      ? "Unmodified source / private reservation"
                      : "Measured version / not publication approval"}
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void act(() => compare(a))}
                    >
                      {a.role === "original" ? "Inspect source" : "Compare version"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete this stored file"
                      aria-label={`Delete ${a.role} file ${assets.length - i}`}
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Delete this stored file permanently? Download first; deletion cannot be undone.",
                          )
                        )
                          return;
                        void act(async () => {
                          await remove({ data: { id: a.id } });
                          clearPreview();
                          if (selected === a.id) setSelected("");
                          setNotice(
                            "Stored file and its reservation deleted. Change metadata remains in private audit history.",
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
          </aside>
          <section
            className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
            aria-label="Audio enhancement"
          >
            <p className="eyebrow">Bounded PCM pipeline / v1</p>
            <h2 className="mt-3 text-2xl">Listen. Adjust. Compare.</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-xs text-muted-foreground">BEFORE / unchanged original</p>
                {beforeUrl ? (
                  <audio
                    controls
                    preload="metadata"
                    src={beforeUrl}
                    className="h-12 w-full"
                    aria-label="Original audio"
                  />
                ) : (
                  <div className="flex h-12 items-center border-b border-border text-xs text-muted-foreground">
                    Select “Inspect source”
                  </div>
                )}
              </div>
              <div>
                <p className="mb-3 text-xs text-muted-foreground">
                  AFTER / separate private version
                </p>
                {afterUrl ? (
                  <audio
                    controls
                    preload="metadata"
                    src={afterUrl}
                    className="h-12 w-full"
                    aria-label="Enhanced audio"
                  />
                ) : (
                  <div className="flex h-12 items-center border-b border-border text-xs text-muted-foreground">
                    No enhanced preview
                  </div>
                )}
              </div>
            </div>
            <label className="mt-6 block text-xs">
              Level adjustment: {gain} dB
              <input
                aria-label="Gain in decibels"
                type="range"
                min={-24}
                max={12}
                step={1}
                value={gain}
                disabled={busy}
                onChange={(e) => {
                  setGain(Number(e.target.value));
                  setApprove(false);
                }}
                className="mt-3 w-full accent-primary"
              />
            </label>
            <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
              Reads only the selected original. Writes a new WAV. Clipping transformations are
              rejected. Output removes embedded metadata. Sample peak/RMS are not true peak, LUFS,
              denoise, stem separation or professional mastering.
            </p>
            <label className="mt-4 flex items-start gap-3 text-xs leading-6">
              <input
                aria-label="Approve enhancement"
                type="checkbox"
                checked={approve}
                disabled={busy}
                onChange={(e) => setApprove(e.target.checked)}
                className="mt-1"
              />
              I approve this {gain} dB operation on the selected original. Originals will not be
              overwritten.
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="cosmic"
                disabled={
                  busy || !allowed || !consent || !approve || !original || studio.assets.length >= 8
                }
                onClick={() =>
                  void act(async () => {
                    checkPause();
                    if (!original) throw new Error("Select your original.");
                    const output = await process({
                      data: {
                        id: original.id,
                        gainDb: gain,
                        consent: { rights: true, privacy: true },
                        approve: true,
                      },
                    });
                    await compare(output.asset);
                    setNotice(
                      "Real enhancement saved. Duration, channels, sample rate and sample count preserved; compare before exporting.",
                    );
                  })
                }
              >
                <SlidersHorizontal size={14} />
                {busy ? "Working…" : "Create enhanced version"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy || !original}
                onClick={() =>
                  void act(async () => {
                    if (original) await compare(original);
                  })
                }
              >
                <RotateCcw size={14} />
                Return to original
              </Button>
            </div>
            {report !== null && (
              <details open className="mt-6 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm">Measured QA / version digest</summary>
                <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-6 text-muted-foreground">
                  {JSON.stringify(report, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = URL.createObjectURL(
                        new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
                      ),
                      a = document.createElement("a");
                    a.href = url;
                    a.download = "quantum-audio-qa.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={14} />
                  Download QA record
                </Button>
              </details>
            )}
            {(beforeUrl || afterUrl) && (
              <div className="mt-6 border-t border-border pt-4">
                <label className="flex items-start gap-3 text-xs leading-6">
                  <input
                    aria-label="Approve file export"
                    type="checkbox"
                    checked={exportApproval}
                    disabled={busy}
                    onChange={(e) => setExportApproval(e.target.checked)}
                    className="mt-1"
                  />
                  I reviewed this preview and authorize a private file download. No public sharing
                  or distribution is authorized.
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { url: beforeUrl, name: "Original", file: "quantum-original.wav" },
                    { url: afterUrl, name: "Enhanced", file: "quantum-enhanced.wav" },
                  ].map((v) => (
                    <Button
                      key={v.name}
                      variant="signal"
                      disabled={!v.url || !exportApproval || !consent || busy}
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = v.url;
                        a.download = v.file;
                        a.click();
                        setNotice(
                          `${v.name} file download requested. No publishing or provider action.`,
                        );
                      }}
                    >
                      <Download size={14} />
                      Download {v.name.toLowerCase()}
                    </Button>
                  ))}
                </div>
                {afterId && (
                  <p className="mt-3 text-[10px] leading-6 text-muted-foreground">
                    Enhanced preview belongs to a saved version, not the current slider setting.
                    Changing gain requires a fresh approval and new version.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
        <ForgeWorkspace
          key={`forge-${projectId}`}
          projectId={projectId}
          selected={selected}
          assets={assets}
          allowed={allowed}
          consent={consent}
          paused={!!paused}
        />
        <QuantumPlanner key={`planner-${projectId}`} projectId={projectId} consent={consent} paused={!!paused} />
        <section className="mt-10 border-t border-border pt-6">
          <p className="eyebrow">Existing shell / optional companion</p>
          <p className="mt-4 font-mono text-xs leading-7 text-warning">
            omni studio · evolution studio — PLANNED / NOT EXECUTABLE
          </p>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            No replacement terminal or installer. FFmpeg film/audio processing needs a supported
            authorized execution service or separately reviewed companion; it is not enabled here.
            Version recovery selects your preserved original, not a backup restore or signed audit.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link to="/launch-control">
                <Shield size={14} />
                Launch evidence
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/entertainment">
                Entertainment plans
                <ArrowUpRight size={14} />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
