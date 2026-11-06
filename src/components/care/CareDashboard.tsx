import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { HeartPulse, HardDrive, Cpu, MemoryStick, Download, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { careDevices, careModules, careStorage, careUpdates } from "@/data/evolution";
import { useCare } from "@/hooks/use-care";
import { ScanPlans } from "./ScanPlans";
import { careManifest, careReport } from "@/lib/care";
import { downloadJson } from "@/lib/genesis-sdk";
import { CareShell, Choice, HistoryList, Notice, useCareAction } from "./CareShell";
export function CareDashboard() {
  const { store } = useCare();
  const { run, message, setMessage } = useCareAction();
  const [review, setReview] = useState(false);
  const [setup, setSetup] = useState(true);
  const device = careDevices.find((d) => d.id === store.deviceId);
  const download = (kind: "manifest" | "report") => {
    try {
      downloadJson(
        `DEMO-care-${kind}.json`,
        kind === "manifest" ? careManifest(store) : careReport(store),
      );
      setMessage(
        kind === "manifest"
          ? "Virtual manifest downloaded. No file scan, move or deletion."
          : "Sample report downloaded. No real health checks or benefits claimed.",
      );
    } catch {
      setMessage("Download unavailable.");
    }
  };
  return (
    <CareShell
      title="EVOLUTION CARE"
      subtitle="A considered approach to the technology you choose to care for."
    >
      <section className="border-y border-border py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl">
            {store.onboarded ? "Your optional modules" : "First run · choose optional modules"}
          </h2>
          {store.onboarded && (
            <Button variant="ghost" onClick={() => setSetup(!setup)}>
              {setup ? "Close preferences" : "Review module choices"}
            </Button>
          )}
        </div>
        <p className="mt-4 text-sm leading-loose text-muted-foreground">
          All modules start off. Saving a choice enables only its demo controls; no installer,
          background service or account is created.
        </p>
        {(!store.onboarded || setup) && (
          <>
            <div className="mt-5 grid gap-x-12 md:grid-cols-2">
              {careModules.map((module) => (
                <Choice
                  key={module.id}
                  label={module.name}
                  note={`${module.description}. ${module.permission}.`}
                  checked={store.modules[module.id]}
                  onChange={(checked) =>
                    run({ type: "modules", modules: { ...store.modules, [module.id]: checked } })
                  }
                />
              ))}
            </div>
            <Button
              className="mt-6"
              variant="signal"
              onClick={() => {
                if (
                  run(
                    { type: "modules", modules: store.modules },
                    "First-run choices saved locally. No software installed.",
                  )
                )
                  setSetup(false);
              }}
            >
              Save optional module choices
            </Button>
          </>
        )}
        {store.onboarded && !setup && (
          <p className="mt-6 font-mono text-xs leading-loose text-gold-light">
            {careModules
              .filter((m) => store.modules[m.id])
              .map((m) => m.name)
              .join(" · ") || "All optional modules OFF"}
          </p>
        )}
      </section>
      <Notice message={message} />
      {!store.modules.care ? (
        <div className="border-b border-border py-12">
          <HeartPulse className="mb-5 text-gold" size={32} />
          <h2 className="text-2xl">CARE is off</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Opt in above to inspect fictional inventory and a virtual review list.
          </p>
        </div>
      ) : (
        device && (
          <>
            <section className="py-10">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <h2 className="text-2xl">Sample health snapshot</h2>
                  <p className="mt-3 text-xs text-warning">
                    DEMO numbers · not measured on your computer · no health score
                  </p>
                </div>
                <label className="text-xs text-muted-foreground">
                  Sample device
                  <select
                    className="exchange-select mt-2 block w-full"
                    aria-label="Sample device"
                    value={store.deviceId}
                    onChange={(e) => run({ type: "device", id: e.target.value })}
                  >
                    {careDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.os}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-6 font-mono text-xs text-gold-light">
                {device.os} / {device.architecture} · {device.platform} · sample recorded{" "}
                {device.sampleAt.slice(0, 10)}
              </p>
              <div className="mt-8 grid gap-8 md:grid-cols-3">
                {[
                  {
                    icon: HardDrive,
                    label: "Sample disk usage",
                    text: `${device.diskUsedGb} / ${device.diskTotalGb} GB`,
                    note: "No disk health test or recoverable-space estimate",
                  },
                  {
                    icon: MemoryStick,
                    label: "Sample memory usage",
                    text: `${device.memoryUsedGb} / ${device.memoryTotalGb} GB`,
                    note: "No measured bottleneck or promised optimization",
                  },
                  {
                    icon: Cpu,
                    label: "Sample CPU usage",
                    text: `${device.cpuPercent}%`,
                    note: "Single fictional point, not live monitoring",
                  },
                ].map((m) => (
                  <article key={m.label} className="border-t border-border py-6">
                    <m.icon size={24} className="text-gold" />
                    <p className="mt-5 text-xs text-muted-foreground">{m.label}</p>
                    <p className="mt-4 font-mono text-3xl text-gold-light">{m.text}</p>
                    <p className="mt-4 text-xs leading-loose text-muted-foreground">{m.note}</p>
                  </article>
                ))}
              </div>
              <p className="mt-5 text-xs leading-loose text-muted-foreground">
                Backup status: {device.backup}. Last real scan: NEVER. Startup, security patches and
                disk integrity: NOT CHECKED. No claim of improved performance or extended hardware
                life.
              </p>
              <Button
                variant="signal"
                className="mt-6 h-auto min-h-11 whitespace-normal"
                onClick={() => download("report")}
              >
                <Download size={16} />
                Download sample health report
              </Button>
            </section>
            <ScanPlans />
            <section className="border-t border-border py-8">
              <h2 className="text-2xl">Sample software inventory</h2>
              <p className="mt-4 text-xs leading-loose text-muted-foreground">
                Historical version scenarios only. These are not your applications or the latest
                available releases. Unknown software stays unknown.
              </p>
              <div className="mt-6 grid gap-8 md:grid-cols-3">
                {careUpdates.map((u) => (
                  <article key={u.id} className="border-t border-border py-5">
                    <h3 className="text-xl">{u.name}</h3>
                    <p className="mt-4 font-mono text-sm text-gold-light">
                      Sample installed {u.installed}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {u.vendor} · identity not matched to a real device
                    </p>
                  </article>
                ))}
              </div>
              <Button asChild variant="signal" className="mt-6">
                <Link to="/updates">Review update catalog</Link>
              </Button>
            </section>
            <section className="border-t border-border py-8">
              <div className="flex flex-wrap items-center justify-between gap-5">
                <h2 className="text-2xl">Virtual storage review</h2>
                <Button variant="ghost" onClick={() => setReview(!review)}>
                  {review ? "Close sample list" : "Review sample storage"}
                </Button>
              </div>
              <p className="mt-4 text-sm leading-loose text-muted-foreground">
                Cache / temporary-file REVIEW QUEUE · sample paths only. Per-file selection approves
                review only, never a move or deletion. Locked caches, personal files and backups are
                protected. Recoverable storage is unknown; no hash computed and no restore
                capability tested.
              </p>
              {review && (
                <>
                  <ul className="mt-6">
                    {careStorage.map((item) => (
                      <li key={item.id} className="border-t border-border py-6">
                        <label className="flex min-w-0 items-start gap-4">
                          <input
                            type="checkbox"
                            className="mt-1 accent-primary"
                            aria-label={`Review ${item.kind}`}
                            disabled={item.locked || item.protected}
                            checked={store.storageSelection.includes(item.id)}
                            onChange={(e) =>
                              run({
                                type: "storage",
                                ids: e.target.checked
                                  ? [...store.storageSelection, item.id]
                                  : store.storageSelection.filter((id) => id !== item.id),
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block break-all font-mono text-xs text-gold-light">
                              {item.path}
                            </span>
                            <span className="mt-3 block text-xs">
                              {item.sizeMb} MB · {item.kind} ·{" "}
                              {item.locked
                                ? "LOCKED / EXCLUDED"
                                : item.protected
                                  ? "PROTECTED / EXCLUDED"
                                  : "REVIEW ONLY"}
                            </span>
                            <span className="mt-3 block text-xs leading-loose text-muted-foreground">
                              {item.reason}. {item.reversible}.
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-wrap gap-4">
                    <Button
                      variant="signal"
                      className="h-auto min-h-11 whitespace-normal"
                      disabled={!store.storageSelection.length}
                      onClick={() => download("manifest")}
                    >
                      <Download size={16} />
                      Download virtual review manifest
                    </Button>
                    <Button disabled variant="outline">
                      <Shield size={16} />
                      Move / delete / optimize · disabled
                    </Button>
                    <Button disabled variant="outline">
                      Restore · unavailable / not tested
                    </Button>
                  </div>
                </>
              )}
            </section>
          </>
        )
      )}
      <HistoryList />
    </CareShell>
  );
}
