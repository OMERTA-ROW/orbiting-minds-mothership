import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import {
  ACCEPTED_TYPES, ADAPTERS, MAX_BRIEF_BYTES, PLANNED_TYPES, STORE_KEY, bookPreferences, cancelJobs, cloneCampaign,
  compareStrategies, draftAssets, intakeFile, loadStore, planJobs, revokeChannel, routeScore, saveStore, selectRoute,
  understand, validateCampaign, type Campaign,
} from "@/lib/omni-marketing";

const stamp = () => new Date().toISOString();

export function OmniMarketing() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setCampaigns(loadStore(localStorage.getItem(STORE_KEY))); setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem(STORE_KEY, saveStore(campaigns)); }, [campaigns, loaded]);
  const active = campaigns.find((c) => c.id === activeId) ?? campaigns[0];
  const update = (fn: (c: Campaign) => Campaign) => active && setCampaigns((all) => all.map((c) => (c.id === active.id ? fn(c) : c)));

  async function onFile(file: File) {
    setError("");
    const r = await intakeFile(file.name, file.size, file.size <= MAX_BRIEF_BYTES ? await file.text() : "");
    if (!r.ok) return setError(r.error);
    const u = understand(r.text);
    const routes = compareStrategies(u.market, u.missing.length);
    const sel = selectRoute(routes);
    const title = u.facts.find((f) => f.key === "title")?.value ?? file.name;
    const now = stamp();
    const c: Campaign = {
      id: crypto.randomUUID(), createdAt: now, source: { name: r.name, bytes: r.bytes, digest: r.digest, flags: r.flags },
      original: r.text, market: u.market, facts: u.facts, missing: u.missing, privateRestriction: u.privateRestriction,
      routes, selected: sel.id, assets: draftAssets(title, u.market, sel, bookPreferences(r.text)),
      policy: { enabled: false, channels: [], visibility: "private", dailySpendCap: 0, totalSpendCap: 0, discountFloorPct: 10, startUtc: "", endUtc: "" },
      jobs: [], log: [`${now} intake ${r.name} (${r.bytes} bytes)`],
    };
    setCampaigns((a) => [c, ...a]); setActiveId(c.id);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-8 md:px-8">
      <header className="border-b border-gold/30 pb-6">
        <div className="flex flex-wrap items-center gap-3"><span className="eyebrow">OMNI / project-to-market</span><DemoBadge label="LOCAL · NO PROVIDERS CONNECTED" /></div>
        <h1 className="mt-4 text-4xl">OMNI Marketing</h1>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-warning">Campaigns are saved in this browser only. Scores are planning heuristics, not market research. No publishing account is connected, so nothing is posted, sent or spent; jobs stay blocked with the exact requirement.</p>
      </header>

      <section className="mt-6 border border-border p-5">
        <h2 className="text-xl">1 · Upload a brief</h2>
        <p className="mt-2 text-xs text-muted-foreground">Accepted now: {ACCEPTED_TYPES.join(", ")} up to {MAX_BRIEF_BYTES / 1000} KB. Planned: {PLANNED_TYPES.join(", ")}. Content is never executed.</p>
        <input aria-label="Upload brief" type="file" accept={ACCEPTED_TYPES.join(",")} className="mt-3 text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
        {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
        {campaigns.length > 0 && (
          <select aria-label="Campaign" className="exchange-select mt-3" value={active?.id} onChange={(e) => setActiveId(e.target.value)}>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.source.name} · {c.market}</option>)}
          </select>
        )}
      </section>

      {active && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="border border-border p-5">
            <h2 className="text-xl">2 · Understanding</h2>
            <p className="mt-2 text-xs">Market: <b className="text-gold">{active.market}</b> · Source SHA-256 {active.source.digest.slice(0, 12)}…</p>
            {active.privateRestriction && <p className="mt-2 text-xs text-warning">Brief marks this project private; public execution is refused.</p>}
            {active.source.flags.map((f) => <p key={f} className="mt-2 text-xs text-warning">{f}</p>)}
            <ul className="mt-3 space-y-1 text-xs">{active.facts.map((f) => <li key={f.key}><b>{f.key}</b>: {f.value} <span className="text-muted-foreground">— “{f.evidence}”</span></li>)}</ul>
            {active.missing.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Missing: {active.missing.join(", ")}</p>}
          </section>

          <section className="border border-border p-5">
            <h2 className="text-xl">3 · Strategy comparison</h2>
            <ul className="mt-3 space-y-2 text-xs">{active.routes.map((r) => (
              <li key={r.id}><label className="flex gap-2"><input type="radio" name="route" checked={active.selected === r.id} onChange={() => update((c) => ({ ...c, selected: r.id, assets: draftAssets(c.facts.find((f) => f.key === "title")?.value ?? c.source.name, c.market, r, bookPreferences(c.original)), log: [...c.log, `${stamp()} route → ${r.name}`] }))} />
                <span><b>{r.name}</b> · score {routeScore(r)} · cost {r.cost} · speed {r.speed} · uncertainty {r.uncertainty}</span></label></li>
            ))}</ul>
          </section>

          <section className="border border-border p-5 lg:col-span-2">
            <h2 className="text-xl">4 · Draft assets</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">{active.assets.map((a, i) => (
              <div key={i} className="border border-border/60 p-3"><p className="text-xs text-gold">{a.title} · v{a.version}</p><pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{a.body}</pre></div>
            ))}</div>
          </section>

          <section className="border border-border p-5">
            <h2 className="text-xl">5 · Validation</h2>
            <ul className="mt-3 space-y-1 text-xs">{validateCampaign(active).map((v) => <li key={v.check} className={v.ok ? "text-gold-light" : "text-warning"}>{v.ok ? "✓" : "✗"} {v.check} — {v.detail}</li>)}</ul>
          </section>

          <section className="border border-border p-5">
            <h2 className="text-xl">6 · Execution policy</h2>
            <p className="mt-2 text-xs text-muted-foreground">Spend ceilings are fixed at 0 in this build.</p>
            <div className="mt-3 space-y-2 text-xs">{ADAPTERS.map((a) => (
              <label key={a.id} className="flex gap-2"><input type="checkbox" checked={active.policy.channels.includes(a.id)} onChange={(e) => update((c) => e.target.checked ? { ...c, policy: { ...c.policy, channels: [...c.policy.channels, a.id] } } : { ...c, ...revokeChannel(c.policy, c.jobs, a.id, stamp()) })} />{a.name} · not connected</label>
            ))}</div>
            <label className="mt-3 flex gap-2 text-xs"><input type="checkbox" checked={active.policy.visibility === "public"} onChange={(e) => update((c) => ({ ...c, policy: { ...c.policy, visibility: e.target.checked ? "public" : "private" } }))} />Public visibility</label>
            <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={active.policy.enabled} onChange={(e) => update((c) => ({ ...c, policy: { ...c.policy, enabled: e.target.checked } }))} />Enable policy</label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="cosmic" onClick={() => { const r = planJobs(active.id, active.policy, active.jobs, active.privateRestriction, stamp()); setError(r.error ?? ""); update((c) => ({ ...c, jobs: r.jobs, log: [...c.log, `${stamp()} run requested${r.error ? `: ${r.error}` : ""}`] })); }}>Run within policy</Button>
              <Button size="sm" variant="ghost" onClick={() => update((c) => ({ ...c, jobs: cancelJobs(c.jobs, stamp()), log: [...c.log, `${stamp()} cancel all`] }))}>Cancel jobs</Button>
              <Button size="sm" variant="ghost" onClick={() => { const c = cloneCampaign(active, crypto.randomUUID(), stamp()); setCampaigns((a) => [c, ...a]); setActiveId(c.id); }}>Clone structure</Button>
            </div>
          </section>

          <section className="border border-border p-5 lg:col-span-2">
            <h2 className="text-xl">7 · Jobs & history</h2>
            {active.jobs.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No jobs yet.</p> : (
              <ul className="mt-3 space-y-1 text-xs">{active.jobs.map((j) => <li key={j.id}><b className="uppercase text-gold">{j.state}</b> · {j.channel} · {j.detail}</li>)}</ul>
            )}
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">{active.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>
        </div>
      )}
    </div>
  );
}
