import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flag, RotateCcw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import { seo } from "@/lib/seo";
import {
  ARENA_KEY,
  TRACK,
  arenaStandings,
  arenaRacers,
  readArenaSaved,
  realMoneyBetting,
  scorePrediction,
  simulateRace,
  verifyReplay,
  type RaceResult,
  type ArenaSaved,
  type ArenaHistory,
} from "@/lib/arena";

export const Route = createFileRoute("/arena")({
  head: () =>
    seo(
      "Racing Arena · Simulated AI Races",
      "Watch deterministic simulated AI races, make points-only predictions with no monetary value, and replay any race exactly from its seed.",
    ),
  component: ArenaPage,
});

const name = (id: string) => arenaRacers.find((r) => r.id === id)?.name ?? id;

function ArenaPage() {
  const [pick, setPick] = useState(arenaRacers[0]?.id ?? "aurum");
  const [race, setRace] = useState<RaceResult | null>(null);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<ArenaSaved>({ points: 0, history: [] });
  const [pending, setPending] = useState<ArenaHistory | null>(null);
  const [storageError, setStorageError] = useState("");
  const [replaySeed, setReplaySeed] = useState("");
  const [notice, setNotice] = useState("");
  const sectors = TRACK.laps * TRACK.sectorsPerLap;

  useEffect(() => {
    try {
      setSaved(readArenaSaved(localStorage.getItem(ARENA_KEY)));
    } catch {
      setStorageError("Browser storage is unavailable. Points last only for this visit.");
    }
  }, []);
  useEffect(() => {
    if (!race || step >= sectors) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setStep(reduce ? sectors : step + 1), 350);
    return () => clearTimeout(t);
  }, [race, step, sectors]);

  useEffect(() => {
    if (!pending || step < sectors) return;
    const next = {
      points: saved.points + pending.earned,
      history: [pending, ...saved.history].slice(0, 20),
    };
    setPending(null);
    setSaved(next);
    try {
      localStorage.setItem(ARENA_KEY, JSON.stringify(next));
    } catch {
      setStorageError("Points could not be saved in this browser. They last only for this visit.");
    }
  }, [pending, step, sectors, saved]);

  const start = (seed: number, scored: boolean) => {
    const result = simulateRace(seed);
    setRace(result);
    setStep(0);
    if (scored) {
      const earned = scorePrediction(pick, result.order);
      setPending({ seed, pick, earned, winner: result.order[0] ?? "" });
      setNotice("Prediction recorded for this race. Points are awarded at the finish.");
    } else {
      setPending(null);
      setNotice(
        verifyReplay(result)
          ? `Replay of seed ${seed} reproduced the same result. No points awarded.`
          : "Replay mismatch.",
      );
    }
  };
  const elapsed = (id: string) =>
    race
      ? race.events
          .filter((e) => e.racerId === id && e.sector < step)
          .reduce((s, e) => s + e.time, 0)
      : 0;
  const done = race && step >= sectors;
  const last = saved.history[0];

  return (
    <main className="mx-auto max-w-5xl px-6 pb-20 pt-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">Evolution Universe / Challenge Arena</span>
        <DemoBadge label="SIMULATION · POINTS ONLY" />
      </div>
      <h1 className="mt-5 text-4xl">Racing Arena</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
        Sample AI racers run a seeded simulation on a {TRACK.laps}-lap track. The same seed always
        replays exactly. Predictions earn points that have no value and cannot be bought, redeemed
        or transferred.
      </p>
      <p className="mt-3 max-w-2xl text-xs leading-6 text-warning">
        Real-money betting: off. {realMoneyBetting.status}
      </p>
      <section className="mt-8 grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="border-t border-gold/30 pt-5">
          <fieldset>
            <legend className="text-xs text-muted-foreground">Your prediction (winner)</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {arenaRacers.map((r) => (
                <Button
                  key={r.id}
                  variant={pick === r.id ? "cosmic" : "ghost"}
                  size="sm"
                  aria-pressed={pick === r.id}
                  disabled={!!race && !done}
                  onClick={() => setPick(r.id)}
                >
                  {r.name}
                </Button>
              ))}
            </div>
          </fieldset>
          <Button
            variant="cosmic"
            className="mt-5"
            disabled={!!race && !done}
            onClick={() => start(Math.floor(Math.random() * 1_000_000), true)}
          >
            <Play size={15} />
            Start race
          </Button>
          <div className="mt-6 space-y-3" aria-live="polite">
            {arenaRacers.map((r) => {
              const pct = Math.min(100, (Math.min(step, sectors) / sectors) * 100);
              const t = elapsed(r.id);
              return (
                <div key={r.id}>
                  <div className="flex justify-between text-xs">
                    <span>{r.name}</span>
                    <span className="font-mono text-muted-foreground">{t.toFixed(2)}s</span>
                  </div>
                  <div className="mt-1 h-2 rounded-sm bg-muted">
                    <div
                      className="h-2 rounded-sm bg-gold"
                      style={{ width: `${race ? pct * (t ? 1 : 0) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {done && race && (
            <div className="mt-6 border-l border-gold px-4 py-3 text-sm">
              <p>
                <Flag size={14} className="mr-2 inline text-gold" />
                Winner: {name(race.order[0] ?? "")} · seed {race.seed}
              </p>
              <ol className="mt-2 list-decimal pl-5 text-xs text-muted-foreground">
                {race.totals.map((t) => (
                  <li key={t.racerId}>
                    {name(t.racerId)} — {t.time.toFixed(3)}s
                  </li>
                ))}
              </ol>
              {last?.seed === race.seed && (
                <p className="mt-2 text-xs text-gold-light">
                  You picked {name(last.pick)}: +{last.earned} points
                </p>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="mt-4 text-xs text-muted-foreground">
              {notice}
            </p>
          )}
          {storageError && (
            <p role="status" className="mt-3 text-xs text-warning">
              {storageError}
            </p>
          )}
        </div>
        <aside className="border-l border-gold/30 pl-5">
          <p className="eyebrow">Your points (this browser)</p>
          <p aria-label="Local points" className="mt-3 text-3xl text-gold-light">
            {saved.points}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Winner {10} · podium {3}. Stored locally, not an account balance.
          </p>
          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              const s = Number(replaySeed);
              if (replaySeed.trim() && Number.isSafeInteger(s) && s >= 0 && s <= 0xffffffff)
                start(s, false);
              else setNotice("Enter a whole-number seed from 0 to 4294967295.");
            }}
          >
            <label className="block text-xs text-muted-foreground">
              Replay a seed
              <input
                value={replaySeed}
                onChange={(e) => setReplaySeed(e.target.value)}
                inputMode="numeric"
                className="exchange-select mt-2 w-full"
                aria-label="Replay seed"
              />
            </label>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="mt-2"
              disabled={!!race && !done}
            >
              <RotateCcw size={13} />
              Replay
            </Button>
          </form>
          <p className="eyebrow mt-6">Recent</p>
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {saved.history.slice(0, 8).map((h, i) => (
              <li key={`${h.seed}-${i}`}>
                Seed {h.seed}: {name(h.winner)} won · +{h.earned}
              </li>
            ))}
          </ul>
        </aside>
      </section>
      <section aria-label="Local racer standings" className="mt-10 border-t border-border pt-6">
        <h2 className="text-xl">Local racer standings</h2>
        <p className="mt-3 text-xs text-muted-foreground">
          Last {saved.history.length} completed sample races in this browser · no shared competition
          or prizes.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-3">Racer</th>
                <th>Wins</th>
                <th>Races</th>
                <th>Average time</th>
              </tr>
            </thead>
            <tbody>
              {arenaStandings(saved.history).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-3">{name(r.id)}</td>
                  <td>{r.wins}</td>
                  <td>{r.races}</td>
                  <td className="font-mono">
                    {r.averageSeconds === null ? "—" : `${r.averageSeconds.toFixed(3)}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
