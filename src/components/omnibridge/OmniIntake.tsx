import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, COMPANION_REQUIRED, INTAKE_KEY, MAX_FILES, MAX_FILE_BYTES, classify, importInto, loadIntake, recategorize, saveIntake, type Category, type IntakeProject } from "@/lib/omni-intake";
import { initialEngine, metadataChecks, noteProject, resume, rollback, stop, tick, type EngineState } from "@/lib/omni-enhance";
const ENGINE_KEY = "evolution.omni-enhance.v1";

async function hashFile(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function OmniIntake() {
  const [projects, setProjects] = useState<IntakeProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setProjects(loadIntake(localStorage.getItem(INTAKE_KEY))); setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem(INTAKE_KEY, saveIntake(projects)); }, [projects, loaded]);
  const [engine, setEngine] = useState<EngineState>(initialEngine);
  useEffect(() => { try { const v = localStorage.getItem(ENGINE_KEY); if (v) setEngine(JSON.parse(v)); } catch { /* keep default */ } }, []);
  useEffect(() => { if (loaded) localStorage.setItem(ENGINE_KEY, JSON.stringify(engine)); }, [engine, loaded]);
  useEffect(() => {
    if (!loaded) return;
    setEngine((s) => {
      let n = s;
      for (const p of projects) n = noteProject(n, p.id, `${p.category}|${p.files.map((f) => f.sha256).join(",")}`);
      const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
      return tick(n, (id) => metadataChecks(byId[id]?.files ?? [], byId[id]?.category ?? "Inbox"), new Date().toISOString());
    });
  }, [projects, loaded]);

  async function take(list: FileList | File[]) {
    const files = [...list].slice(0, MAX_FILES + 1);
    if (!files.length) return;
    const paths = files.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    const root = paths[0]!.includes("/") ? paths[0]!.split("/")[0]! : files[0]!.name;
    const incoming = await Promise.all(files.map(async (f, i) => ({ path: paths[i]!, bytes: f.size, sha256: f.size <= MAX_FILE_BYTES ? await hashFile(f) : "" })));
    const now = new Date().toISOString();
    setProjects((all) => {
      const existing = all.find((p) => p.name === root);
      const base = existing ?? { id: crypto.randomUUID(), name: root, category: classify(paths) as Category, source: "Browser upload (this browser only)", files: [], history: [] };
      const { project, report } = importInto(base, incoming, now);
      setMsg(`${root}: ${report.added} new, ${report.versioned} versioned, ${report.unchanged} unchanged, ${report.rejected.length} rejected${report.rejected.length ? ` (${report.rejected.map((r) => `${r.path}: ${r.reason}`).join("; ")})` : ""}.`);
      return existing ? all.map((p) => (p.id === base.id ? project : p)) : [project, ...all];
    });
  }

  return (
    <section className="mt-6 border border-border p-5">
      <h2 className="text-xl">0 · Project intake</h2>
      <p className="mt-2 text-xs text-warning">Local companion required for Desktop folders. This browser only records file names, sizes and fingerprints here — nothing is written to your Desktop, uploaded to the cloud or watched.</p>
      <ul className="mt-2 text-xs text-muted-foreground">{COMPANION_REQUIRED.map((c) => <li key={c}>✗ {c} — needs the Omni companion</li>)}</ul>
      <div
        role="region" aria-label="Drop files or folders"
        className="mt-4 border border-dashed border-gold/50 p-6 text-center text-xs"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }}
      >
        Drop files here · up to {MAX_FILES} files, {MAX_FILE_BYTES / 1e6} MB each
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <label className="cursor-pointer text-gold">Choose files<input aria-label="Choose files" type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} /></label>
          <label className="cursor-pointer text-gold">Choose folder<input aria-label="Choose folder" type="file" className="sr-only" {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} /></label>
        </div>
      </div>
      {msg && <p role="status" className="mt-3 text-xs text-gold-light">{msg}</p>}
      <ul className="mt-4 space-y-3 text-xs">{projects.map((p) => (
        <li key={p.id} className="border border-border/60 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <b>{p.name}</b>
            <select aria-label={`Category for ${p.name}`} className="exchange-select" value={p.category} onChange={(e) => setProjects((a) => a.map((x) => (x.id === p.id ? recategorize(x, e.target.value as Category, new Date().toISOString()) : x)))}>
              {["Inbox", ...CATEGORIES].map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className="text-muted-foreground">{p.files.length} file versions · planned path Omni Projects/{p.category}/{p.name}/Originals</span>
            <Button size="sm" variant="ghost" onClick={() => setProjects((a) => a.filter((x) => x.id !== p.id))}>Remove record</Button>
          </div>
          <ul className="mt-2 text-muted-foreground">{p.history.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </li>
      ))}</ul>
      <div className="mt-6 border-t border-gold/30 pt-4 text-xs">
        <h3 className="text-lg">Automatic enhancement · on by default</h3>
        <p className="mt-1 text-muted-foreground">Status: <b className="text-gold">{engine.stopped ? "stopped" : engine.queue.length ? "running" : "idle"}</b> · queue {engine.queue.length} · {engine.budgetPerTick} projects per pass. Runs only while this page is open; continuous background work needs the companion. Checks are file-list metadata only — nothing is rewritten, uploaded or sent to AI.</p>
        <div className="mt-2 flex gap-2">
          {engine.stopped
            ? <Button size="sm" variant="cosmic" onClick={() => setEngine((s) => resume(s, new Date().toISOString()))}>Resume</Button>
            : <Button size="sm" variant="ghost" onClick={() => setEngine((s) => stop(s, new Date().toISOString()))}>Emergency stop</Button>}
        </div>
        <ul className="mt-3 space-y-1">{engine.candidates.slice(-8).reverse().map((c) => {
          const name = projects.find((p) => p.id === c.projectId)?.name ?? "removed project";
          return <li key={c.id}><b className="uppercase text-gold">{c.state}</b> · {name} · {c.changes.join("; ") || "no gaps found"}
            {engine.accepted[c.projectId] && c.state === "promoted" && <Button size="sm" variant="ghost" onClick={() => setEngine((s) => rollback(s, c.projectId, new Date().toISOString()))}>Roll back</Button>}</li>;
        })}</ul>
      </div>
    </section>
  );
}
