import { useState } from "react";
import { useOmniDownload } from "@/hooks/use-omni-download";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Download, Search, Shield, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Starfield } from "@/components/evo";
import { omniConnectors, omniConnectionStates } from "@/data/evolution";
import { discoverOmniConnectors, omniManifest, type OmniConnectorId } from "@/lib/omnibridge";
export function downloadOmni(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const positions = [
  [15, 18],
  [50, 12],
  [85, 18],
  [12, 51],
  [88, 51],
  [17, 85],
  [50, 88],
  [83, 85],
];
export function CapabilityGraph() {
  const { download, downloadNotice } = useOmniDownload();
  const [selected, setSelected] = useState<OmniConnectorId>("local"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL");
  const c = omniConnectors.find((v) => v.id === selected);
  const results = discoverOmniConnectors(query, status);
  if (!c) return null;
  return (
    <div className="min-w-0">
      {downloadNotice && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          {downloadNotice}
        </p>
      )}
      <div className="grid border-y border-border xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-label="Capability constellation"
          className="relative min-w-0 overflow-hidden xl:border-r xl:border-border"
        >
          <div className="flex flex-wrap justify-between gap-2 px-4 py-4 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-2">
              <Network size={14} className="text-gold" />
              CAPABILITY CONSTELLATION
            </span>
            <span>00 VERIFIED CONNECTIONS</span>
          </div>
          <div className="omni-graph relative hidden md:block">
            <Starfield count={50} />
            <svg viewBox="0 0 1000 480" className="absolute inset-0 h-full w-full" aria-hidden>
              <g fill="none" className="stroke-gold" strokeWidth="0.8">
                <ellipse cx="500" cy="240" rx="385" ry="190" opacity="0.2" />
                <ellipse cx="500" cy="240" rx="320" ry="150" opacity="0.2" />
                <circle cx="500" cy="240" r="72" opacity="0.6" />
                <circle cx="500" cy="240" r="90" opacity="0.18" />
                {positions.map(([x, y], i) => (
                  <path
                    key={i}
                    d={`M500 240 L${(x ?? 0) * 10} ${(y ?? 0) * 4.8}`}
                    strokeDasharray="3 7"
                    opacity="0.35"
                  />
                ))}
              </g>
            </svg>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="font-display text-xl text-gold-light">OmniBridge</p>
              <p className="mt-2 font-mono text-[8px] text-muted-foreground">
                PROPOSE · REVIEW · NEVER ASSUME
              </p>
            </div>
            {omniConnectors.map((v, i) => (
              <Button
                key={v.id}
                variant="ghost"
                aria-label={`Inspect ${v.name}`}
                aria-pressed={selected === v.id}
                onClick={() => setSelected(v.id)}
                className={`omni-node omni-node-${i} absolute flex h-24 w-32 -translate-x-1/2 -translate-y-1/2 flex-col gap-1 whitespace-normal rounded-none p-2 ${selected === v.id ? "text-gold-light" : "text-muted-foreground"}`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-background font-mono text-xs ${selected === v.id ? "border-gold shadow-glow" : "border-border"}`}
                >
                  {v.mark}
                </span>
                <span className="text-[11px]">{v.id === "atlas" ? "Unknown adapter" : v.name}</span>
                <span className="font-mono text-[8px] text-warning">{v.state}</span>
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 pb-5 md:hidden">
            {omniConnectors.map((v) => (
              <Button
                key={v.id}
                variant={selected === v.id ? "signal" : "ghost"}
                aria-label={`Inspect ${v.name}`}
                aria-pressed={selected === v.id}
                className="h-20 justify-start whitespace-normal border border-border text-left"
                onClick={() => setSelected(v.id)}
              >
                <span>
                  <span className="block text-xs">{v.name}</span>
                  <span className="mt-2 block font-mono text-[9px] text-warning">{v.state}</span>
                </span>
              </Button>
            ))}
          </div>
          <p className="px-5 pb-5 text-[11px] text-muted-foreground">
            Dashed paths: proposed compatibility only · connectivity unmeasured · no automatic
            discovery
          </p>
        </section>
        <aside
          aria-label="Selected capability"
          className="min-w-0 border-t border-border px-5 py-6 xl:border-t-0"
        >
          <p className="font-mono text-[10px] text-warning">{c.state}</p>
          <h2 className="mt-3 text-2xl">{c.name}</h2>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.surface}</p>
          <dl className="mt-5 space-y-4 text-xs">
            <div>
              <dt className="text-gold-light">Capabilities</dt>
              <dd className="mt-2 leading-6 text-muted-foreground">
                {c.capabilities.join(" · ") || "None supported"}
              </dd>
            </div>
            <div>
              <dt className="text-gold-light">Requested scopes · not granted</dt>
              <dd className="mt-2 break-words font-mono text-[10px] leading-5 text-muted-foreground">
                {c.scopes.join(" · ") || "None"}
              </dd>
            </div>
            <div>
              <dt className="text-gold-light">Latest verified connectivity</dt>
              <dd className="mt-2 text-muted-foreground">Never measured · no probe or receipt</dd>
            </div>
            <div>
              <dt className="text-gold-light">Provider cost</dt>
              <dd className="mt-2 leading-5 text-muted-foreground">{c.cost}</dd>
            </div>
          </dl>
          <details className="mt-5 text-xs">
            <summary className="cursor-pointer text-gold-light">
              Compatibility & onboarding blockers
            </summary>
            <p className="mt-3 leading-6 text-muted-foreground">{c.compatibility}</p>
            <p className="mt-3 leading-6 text-warning">{c.blocker}</p>
          </details>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="signal"
              onClick={() =>
                download(() => downloadOmni(omniManifest(c.id), `${c.id}-disabled-manifest.json`))
              }
            >
              <Download size={13} />
              Reference manifest
            </Button>
            {c.docs && (
              <Button asChild size="sm" variant="ghost">
                <a href={c.docs} target="_blank" rel="noreferrer">
                  Official docs
                  <ArrowUpRight size={12} />
                </a>
              </Button>
            )}
          </div>
        </aside>
      </div>
      <section className="mt-9" aria-label="Connector registry">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Registry / reference discovery</p>
            <h2 className="mt-3 text-2xl">Know the boundary.</h2>
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <label className="flex min-w-0 flex-1 items-center gap-2 border border-input px-3">
              <Search size={14} className="text-muted-foreground" />
              <input
                aria-label="Search capabilities"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a capability…"
                className="h-10 min-w-0 w-full bg-transparent text-xs outline-none"
              />
            </label>
            <select
              aria-label="Connection status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="exchange-select"
            >
              <option value="ALL">All states</option>
              {omniConnectionStates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-5 font-mono text-[10px] text-muted-foreground">
          {results.length} MATCHES · CONNECTED requires verified scoped access; no entries meet it
        </p>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {results.length ? (
            results.map((v) => (
              <Button
                key={v.id}
                variant="ghost"
                className="grid h-auto w-full grid-cols-1 justify-start gap-3 whitespace-normal rounded-none px-3 py-5 text-left sm:grid-cols-[170px_150px_minmax(0,1fr)]"
                onClick={() => setSelected(v.id)}
                aria-label={`Select registry ${v.name}`}
              >
                <span className="text-sm text-gold-light">{v.name}</span>
                <span className="font-mono text-[9px] text-warning">{v.state}</span>
                <span className="min-w-0 text-xs leading-5 text-muted-foreground">
                  {v.capabilities.join(" · ") || v.blocker}
                </span>
              </Button>
            ))
          ) : (
            <p role="status" className="py-10 text-sm text-muted-foreground">
              No matching capabilities. No live connector is verified.
            </p>
          )}
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-4 px-0">
          <Link to="/guardian">
            <Shield size={14} />
            Guardian security gates
            <ArrowUpRight size={12} />
          </Link>
        </Button>
      </section>
    </div>
  );
}
