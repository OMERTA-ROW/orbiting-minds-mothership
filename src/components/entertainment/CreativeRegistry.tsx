import { useState } from "react";
import { ArrowUpRight, Download, Shield } from "lucide-react";
import { entertainmentAdapters, entertainmentStudios, nexusCompanionPlans } from "@/data/evolution";
import { mediaAdapterManifest } from "@/lib/entertainment";
import { Button } from "@/components/ui/button";
export function downloadCreative(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function CreativeRegistry() {
  const [query, setQuery] = useState(""),
    [studio, setStudio] = useState("all"),
    [state, setState] = useState("all"),
    [selected, setSelected] = useState("planner");
  const a = entertainmentAdapters.find((v) => v.id === selected);
  const rows = entertainmentAdapters.filter(
    (v) =>
      (studio === "all" || v.studio === studio || v.studio === "all") &&
      (state === "all" || v.state === state) &&
      query
        .toLowerCase()
        .split(/\s+/)
        .every((w) => `${v.name} ${v.capabilities} ${v.compatibility}`.toLowerCase().includes(w)),
  );
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Registry / authored references</p>
          <h2 className="mt-4 text-3xl">Creative capability atlas</h2>
        </div>
        <p className="max-w-md text-xs leading-6 text-warning">
          No live provider, camera or editor connections. VERIFIED: none. AVAILABLE AFTER AUTH is
          not claimed—authorization, supported adapters and tests are also required.
        </p>
      </div>
      <div className="my-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_180px]">
        <input
          aria-label="Search creative adapters"
          placeholder="Find a tool or capability…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="exchange-select"
        />
        <select
          aria-label="Adapter studio"
          value={studio}
          onChange={(e) => setStudio(e.target.value)}
          className="exchange-select"
        >
          <option value="all">All studios</option>
          {entertainmentStudios.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Connectivity status"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="exchange-select"
        >
          {["all", "DEMO", "NOT CONNECTED", "AVAILABLE AFTER AUTH", "VERIFIED"].map((v) => (
            <option key={v} value={v}>
              {v === "all" ? "All statuses" : v}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((v) => (
              <Button
                key={v.id}
                variant="ghost"
                aria-pressed={a?.id === v.id}
                onClick={() => setSelected(v.id)}
                className={`h-auto min-h-36 min-w-0 justify-start whitespace-normal rounded-sm border p-5 text-left ${a?.id === v.id ? "border-gold/60 bg-accent/20" : "border-border"}`}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] text-warning">
                    {v.state} · NOT PROBED
                  </span>
                  <span className="mt-3 block text-sm text-foreground">{v.name}</span>
                  <span className="mt-3 block text-xs leading-6 text-muted-foreground">
                    {v.capabilities}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          {rows.length === 0 && (
            <p role="status" className="border-y border-border py-10 text-sm text-muted-foreground">
              No matching adapters. No verified or auth-ready integrations exist.
            </p>
          )}
        </div>
        {a && (
          <aside className="min-w-0 border-l border-gold/30 pl-6">
            <p className="eyebrow">Selected reference</p>
            <h3 className="mt-4 text-2xl">{a.name}</h3>
            <dl className="mt-5 space-y-4 text-xs leading-6">
              {[
                { label: "Connection", value: `${a.state} · latest verified connectivity: none` },
                { label: "Permission preview", value: a.scope },
                { label: "Compatibility", value: a.compatibility },
                { label: "Cost", value: a.cost },
                { label: "Activation gates", value: a.blocker },
              ].map((v) => (
                <div key={v.label}>
                  <dt className="text-gold-light">{v.label}</dt>
                  <dd className="mt-1 text-muted-foreground">{v.value}</dd>
                </div>
              ))}
            </dl>
            <Button
              variant="signal"
              size="sm"
              className="mt-6"
              onClick={() =>
                downloadCreative(`${a.id}-disabled-reference.json`, mediaAdapterManifest(a.id))
              }
            >
              <Download size={14} />
              Disabled manifest
            </Button>
            {a.docs && (
              <Button asChild variant="ghost" size="sm" className="mt-3">
                <a href={a.docs} target="_blank" rel="noopener noreferrer">
                  Official reference
                  <ArrowUpRight size={14} />
                </a>
              </Button>
            )}
          </aside>
        )}
      </div>
      <div className="mt-10 grid gap-8 border-t border-border pt-7 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-xl">
            <Shield size={18} className="text-gold" />
            Provider onboarding gates
          </h3>
          <ol className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
            {[
              "Verified owner identity, least-privilege server credential custody and revocation.",
              "Supported vendor/model/version interface and separate local/device approval.",
              "Rights, credits, likeness, source privacy and explicit asset-sharing consent.",
              "Signed extension, isolated tests, honest usage/cost evidence and rollback proof.",
              "Generation never authorizes distribution; a separate destination grant and final human confirmation are required.",
            ].map((v) => (
              <li key={v} className="border-l border-gold/30 pl-4">
                {v}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-xl">Desktop / 3D references</h3>
          <p className="mt-4 text-xs leading-6 text-warning">
            INERT · NOT INSTALLED · NOT EXECUTABLE FROM EVOLUTION
          </p>
          {nexusCompanionPlans.map((v) => (
            <details key={v.id} className="mt-4 border-b border-border pb-4">
              <summary className="cursor-pointer text-xs text-gold-light">{v.name}</summary>
              <pre className="mt-4 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-muted-foreground">
                {v.text}
              </pre>
              <p className="mt-4 text-xs leading-6 text-muted-foreground">{v.scope}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
