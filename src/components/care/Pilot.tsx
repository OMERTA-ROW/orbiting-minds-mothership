import { useEffect, useState } from "react";
import { MousePointer2, Monitor, Pause, Play, Eye, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { carePilotScopes } from "@/data/evolution";
import { useCare } from "@/hooks/use-care";
import { CareShell, Choice, HistoryList, Notice, useCareAction } from "./CareShell";
export function PilotPage() {
  const { store, dispatch } = useCare();
  const { run, message } = useCareAction();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const active =
    store.pilot.state === "Preview active" &&
    Boolean(store.pilot.expiresAt && Date.parse(store.pilot.expiresAt) > now);
  useEffect(() => {
    if (
      now &&
      store.pilot.state === "Preview active" &&
      store.pilot.expiresAt &&
      Date.parse(store.pilot.expiresAt) <= now
    ) {
      try {
        dispatch({
          type: "pilot",
          scopes: store.pilot.scopes,
          durationMinutes: store.pilot.durationMinutes,
        });
      } catch {
        /* preferences may be loading */
      }
    }
  }, [now, store.pilot, dispatch]);
  return (
    <CareShell
      title="Evolution Pilot"
      subtitle="A visible assistant. A bounded session. Every action stays yours."
    >
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <h2 className="text-2xl">Permission rehearsal</h2>
          <p className="mt-4 text-sm leading-loose text-muted-foreground">
            No OS or browser permission is requested. These choices allow only sample action
            previews on this page. A future signed local agent or scoped extension would need
            accessibility/screen grants and per-site consent.
          </p>
          {!store.modules.pilot && (
            <Choice
              label="Enable Pilot demo"
              checked={false}
              onChange={(checked) =>
                run({ type: "modules", modules: { ...store.modules, pilot: checked } })
              }
            />
          )}
          {carePilotScopes.map((scope) => (
            <Choice
              key={scope}
              label={`${scope} · demo scope`}
              note={
                scope === "Screen inspection"
                  ? "Synthetic dashboard only; no screen capture or passwords"
                  : scope === "Mouse actions"
                    ? "Pointer target preview only; never controls your mouse"
                    : "Sample tab only; no inspection of real sites, accounts or tabs"
              }
              disabled={!store.modules.pilot}
              checked={store.pilot.scopes.includes(scope)}
              onChange={(checked) =>
                run({
                  type: "pilot",
                  scopes: checked
                    ? [...store.pilot.scopes, scope]
                    : store.pilot.scopes.filter((s) => s !== scope),
                  durationMinutes: store.pilot.durationMinutes,
                })
              }
            />
          ))}
          <label className="mt-7 block text-xs text-muted-foreground">
            Preview session limit · minutes
            <select
              aria-label="Preview session limit"
              className="exchange-select mt-2 block w-full sm:w-40"
              disabled={!store.modules.pilot}
              value={store.pilot.durationMinutes}
              onChange={(e) =>
                run({
                  type: "pilot",
                  scopes: store.pilot.scopes,
                  durationMinutes: Number(e.target.value),
                })
              }
            >
              {[1, 5, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
          <p className="mt-5 font-mono text-xs text-gold-light">
            USD spend cap $0 · external commands NONE · monitoring OFF
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="signal"
              disabled={!store.modules.pilot || !store.pilot.scopes.length || active}
              onClick={() =>
                run(
                  { type: "startPilot" },
                  "Bounded sample preview started. No screen, mouse or browser access.",
                )
              }
            >
              <Play size={16} />
              Start sample session
            </Button>
            <Button
              variant="outline"
              disabled={!active}
              onClick={() =>
                run(
                  {
                    type: "pilot",
                    scopes: store.pilot.scopes,
                    durationMinutes: store.pilot.durationMinutes,
                  },
                  "Sample session stopped. No real session existed.",
                )
              }
            >
              <Pause size={16} />
              Stop sample session
            </Button>
          </div>
          <Notice message={message} />
          <section className="mt-10 border-t border-border pt-8">
            <h3 className="text-xl">Sensitive actions always require fresh approval</h3>
            <p className="mt-4 text-sm leading-loose text-muted-foreground">
              Purchases, submissions, downloads, file uploads/deletion, account access,
              installation, privileges and deployment are outside this prototype. Screen content and
              pasted instructions cannot override policy. No keystrokes, secrets or OTPs collected.
            </p>
            <Button disabled variant="outline" className="mt-5 h-auto min-h-11 whitespace-normal">
              <LockKeyhole size={16} />
              Connect real desktop / browser · unconfigured
            </Button>
          </section>
        </section>
        <section className="min-w-0 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Monitor size={22} className="text-gold" />
            <h2 className="text-xl">Synthetic workspace</h2>
          </div>
          <div className="mt-6 border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <span className="font-mono text-[10px] text-gold-light">
                DEMO · NOT A SCREEN CAPTURE
              </span>
              <Eye size={16} className="text-muted-foreground" />
            </div>
            <div className="relative min-h-64 p-6">
              <div className="flex items-center gap-3">
                <span className="world-beacon">
                  <Monitor size={16} />
                </span>
                <span className="text-sm">Sample dashboard</span>
              </div>
              <div className="mt-7 border-y border-border py-5">
                <p className="text-xs text-muted-foreground">Files changed</p>
                <p className="mt-2 font-mono text-2xl text-gold-light">0</p>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Sample browser tab: EVOLUTION local demo
              </p>
              {store.pilot.action === "Preview pointer target" && (
                <MousePointer2
                  className="absolute bottom-8 right-10 text-gold-light"
                  size={30}
                  aria-label="Sample pointer graphic, not your cursor"
                />
              )}
            </div>
          </div>
          <p role="status" className="mt-5 font-mono text-xs leading-loose text-gold-light">
            {active
              ? `VISIBLE DEMO SESSION · ${Math.min(store.pilot.durationMinutes, Math.max(0, Math.ceil((Date.parse(store.pilot.expiresAt ?? "") - now) / 60000)))} minute(s) remaining`
              : "NO ACTIVE SESSION"}
          </p>
          <div className="mt-6 grid gap-3">
            {(
              [
                "Inspect sample dashboard",
                "Preview pointer target",
                "Inspect sample browser tab",
              ] as const
            ).map((action) => (
              <Button
                variant="ghost"
                className="h-auto min-h-11 justify-start whitespace-normal text-left"
                key={action}
                disabled={!active}
                onClick={() => run({ type: "pilotAction", action, approve: false })}
              >
                {action}
              </Button>
            ))}
          </div>
          {store.pilot.action && (
            <div className="mt-5 border-y border-border py-5">
              <p className="text-sm text-gold-light">{store.pilot.action}</p>
              <p className="mt-3 text-xs leading-loose text-muted-foreground">
                Target: this fictional workspace. Scope checked locally; no external action, account
                access or uploads.
              </p>
              <Button
                variant="signal"
                className="mt-4 h-auto min-h-11 whitespace-normal"
                disabled={!active || store.pilot.actionApproved}
                onClick={() => {
                  if (store.pilot.action)
                    run(
                      { type: "pilotAction", action: store.pilot.action, approve: true },
                      "Sample action approval recorded. No real computer action performed.",
                    );
                }}
              >
                {store.pilot.actionApproved
                  ? "Demo action approved · not executed"
                  : "Approve sample action only"}
              </Button>
            </div>
          )}
        </section>
      </div>
      <HistoryList />
    </CareShell>
  );
}
