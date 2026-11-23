import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readClaudeStatus, setClaudeEngine, setClaudePrice } from "@/lib/claude-engine.functions";
import {
  CLAUDE_CAPS,
  CLAUDE_ENGINE_IDS,
  engineById,
  type ClaudeEngineId,
} from "@/lib/omni-engines";

type Status = Awaited<ReturnType<typeof readClaudeStatus>>;
const AGENTS = [
  { id: "omni", name: "OMNI" },
  { id: "dread", name: "Dread" },
  { id: "draco", name: "Draco" },
] as const;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

/** Owner-only Claude engine switches, confirmed prices and usage (metadata only). */
export function ClaudeEngine() {
  const read = useServerFn(readClaudeStatus);
  const saveEngine = useServerFn(setClaudeEngine);
  const savePrice = useServerFn(setClaudePrice);
  const [s, setS] = useState<Status | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [priceModel, setPriceModel] = useState<ClaudeEngineId>("claude-sonnet-5-5");
  const [inC, setInC] = useState("");
  const [outC, setOutC] = useState("");

  const load = useCallback(() => {
    read()
      .then(setS)
      .catch(() => setS({ ok: false, message: "Owner sign-in with two-step code is needed." }));
  }, [read]);
  useEffect(load, [load]);

  if (!s) return <p className="text-sm text-muted-foreground">Loading Claude status…</p>;
  if (!s.ok) return <p className="text-sm text-muted-foreground">{s.message}</p>;

  const ready = s.keyConfigured;
  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h3 className="font-medium">Claude engine</h3>
        <p className="text-sm text-muted-foreground">
          Anthropic key: {ready ? "saved on the server" : "not connected"}. Today:{" "}
          {usd(s.todayCents)} of {usd(CLAUDE_CAPS.perDayCents)} · each reply at most{" "}
          {usd(CLAUDE_CAPS.perCallCents)}. Emergency Stop and AI approval apply. Claude never runs
          code; coding goes to Jackboy.
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Per agent (off by default)</h4>
        {AGENTS.map((a) => {
          const row = s.settings.find((x) => x.agent_id === a.id);
          const model = (row?.model ?? "claude-sonnet-5-5") as ClaudeEngineId;
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-16">{a.name}</span>
              <select
                className={selectClass}
                value={model}
                aria-label={`${a.name} Claude model`}
                onChange={async (e) => {
                  const r = await saveEngine({
                    data: {
                      agent: a.id,
                      model: e.target.value as ClaudeEngineId,
                      enabled: row?.enabled ?? false,
                    },
                  });
                  setNote(r.ok ? "Saved." : r.message);
                  load();
                }}
              >
                {CLAUDE_ENGINE_IDS.map((m) => (
                  <option key={m} value={m}>
                    {engineById(m)?.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant={row?.enabled ? "default" : "outline"}
                onClick={async () => {
                  const r = await saveEngine({
                    data: { agent: a.id, model, enabled: !row?.enabled },
                  });
                  setNote(r.ok ? "Saved." : r.message);
                  load();
                }}
              >
                {row?.enabled ? "Claude on" : "Claude off"}
              </Button>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">
          Confirmed prices (cents per million tokens, from Anthropic's pricing page)
        </h4>
        {CLAUDE_ENGINE_IDS.map((m) => {
          const p = s.prices.find((x) => x.model === m);
          return (
            <p key={m} className="text-sm text-muted-foreground">
              {engineById(m)?.label}:{" "}
              {p
                ? `${p.in_cents_per_mtok} in / ${p.out_cents_per_mtok} out, confirmed ${new Date(p.confirmed_at).toLocaleDateString()}`
                : "not set (calls refused)"}
            </p>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <select
            className={selectClass}
            value={priceModel}
            aria-label="Price model"
            onChange={(e) => setPriceModel(e.target.value as ClaudeEngineId)}
          >
            {CLAUDE_ENGINE_IDS.map((m) => (
              <option key={m} value={m}>
                {engineById(m)?.label}
              </option>
            ))}
          </select>
          <Input
            className="w-28"
            inputMode="decimal"
            placeholder="Input"
            aria-label="Input price"
            value={inC}
            onChange={(e) => setInC(e.target.value)}
          />
          <Input
            className="w-28"
            inputMode="decimal"
            placeholder="Output"
            aria-label="Output price"
            value={outC}
            onChange={(e) => setOutC(e.target.value)}
          />
          <Button
            size="sm"
            onClick={async () => {
              const i = Number(inC),
                o = Number(outC);
              if (!(i > 0) || !(o > 0)) return setNote("Enter both prices.");
              const r = await savePrice({ data: { model: priceModel, inCents: i, outCents: o } });
              setNote(r.ok ? "Prices confirmed." : r.message);
              load();
            }}
          >
            Confirm prices
          </Button>
        </div>
      </section>
      {note && (
        <p className="text-sm" role="status">
          {note}
        </p>
      )}

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Usage (last 50, no message text)</h4>
        {s.usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Claude calls yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.usage.map((u) => (
              <li key={u.run_id} className="text-muted-foreground">
                {new Date(u.reserved_at).toLocaleString()} · {u.agent_id} ·{" "}
                {engineById(u.model)?.label} · {u.status} · est {usd(u.estimate_cents)}
                {u.actual_cents !== null ? ` · actual ${usd(u.actual_cents)}` : ""}
                {u.input_tokens !== null ? ` · ${u.input_tokens}/${u.output_tokens} tokens` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
