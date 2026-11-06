import { useState } from "react";
import { Calculator, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compareWorkflows, type WorkflowEstimateInput } from "@/lib/cost-estimator";

const numericFields = [
  ["requestsPerMonth", "Requests / month", "1"],
  ["inputTokensPerRequest", "Input tokens / request", "1"],
  ["outputTokensPerRequest", "Billable output tokens / request", "1"],
  ["inputRatePerMillion", "Input rate / 1M tokens", "any"],
  ["outputRatePerMillion", "Output rate / 1M tokens", "any"],
  ["fixedMonthlyCost", "Optional fixed cost / month", "any"],
] as const;
type Draft = { id: number; name: string } & Record<(typeof numericFields)[number][0], string>;
const draft = (id: number): Draft => ({
  id,
  name: `Workflow ${id}`,
  requestsPerMonth: "",
  inputTokensPerRequest: "",
  outputTokensPerRequest: "",
  inputRatePerMillion: "",
  outputRatePerMillion: "",
  fixedMonthlyCost: "0",
});

export function CostEstimator() {
  const [rows, setRows] = useState<Draft[]>([draft(1), draft(2)]),
    [currency, setCurrency] = useState("USD"),
    [notice, setNotice] = useState("");
  const [nextId, setNextId] = useState(3);
  const inputs: WorkflowEstimateInput[] = rows.map((r) => ({
    name: r.name,
    ...Object.fromEntries(
      numericFields.map(([key]) => [key, r[key].trim() === "" ? NaN : Number(r[key])]),
    ),
  })) as WorkflowEstimateInput[];
  let estimates: ReturnType<typeof compareWorkflows> | null = null;
  try {
    estimates = compareWorkflows(inputs);
  } catch {
    /* Keep incomplete/invalid drafts without inventing zero rates. */
  }
  const unit = (amount: number) =>
    `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const update = (id: number, key: keyof Draft, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  const exportEstimate = () => {
    if (!estimates) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              mode: "USER_ENTERED_ESTIMATE",
              currency,
              assumptions: inputs,
              estimates,
              actualCharge: null,
              excludes: [
                "Taxes",
                "Currency conversion",
                "Cache/context tiers",
                "Reasoning not included in entered output",
                "Media/tool/hosting fees not entered",
              ],
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "evolution-ai-cost-estimate.json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Estimate exported locally. No account connected or usage data sent.");
  };
  return (
    <section aria-label="Offline AI cost estimator" className="min-w-0 border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="eyebrow">Optional workflows / before connection</p>
          <h2 className="mt-4 flex items-center gap-3 text-3xl">
            <Calculator size={25} className="shrink-0 text-gold" />
            AI cost estimator
          </h2>
        </div>
        <label className="text-xs">
          Rate currency
          <select
            aria-label="Rate currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="exchange-select mt-2 block"
          >
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
            <option value="credits">Credits</option>
          </select>
        </label>
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">
        Your rates and expected monthly usage only. Nothing connects, runs, uploads or saves
        automatically. All compared rates must use the selected currency; changing the label does
        not convert them.
      </p>
      <div className="mt-8 grid gap-x-9 gap-y-7 lg:grid-cols-2">
        {rows.map((r) => (
          <fieldset key={r.id} className="min-w-0 border-t border-gold/30 pt-5">
            <legend className="sr-only">{r.name || `Workflow ${r.id}`}</legend>
            <div className="flex items-end gap-3">
              <label className="min-w-0 flex-1 text-xs">
                Workflow name
                <Input
                  aria-label={`Workflow ${r.id} name`}
                  value={r.name}
                  maxLength={80}
                  onChange={(e) => update(r.id, "name", e.target.value)}
                  className="mt-2"
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove workflow ${r.id}`}
                disabled={rows.length <= 2}
                onClick={() => setRows(rows.filter((v) => v.id !== r.id))}
              >
                <Trash2 size={16} />
              </Button>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {numericFields.map(([key, label, step]) => (
                <label key={key} className="min-w-0 text-xs leading-6">
                  {label}
                  <Input
                    aria-label={`Workflow ${r.id} ${label}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={step}
                    value={r[key]}
                    onChange={(e) => update(r.id, key, e.target.value)}
                    placeholder="Enter your assumption"
                    className="mt-2"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="signal"
          disabled={rows.length >= 4}
          onClick={() => {
            setRows([...rows, draft(nextId)]);
            setNextId(nextId + 1);
          }}
        >
          <Plus size={15} />
          Add workflow
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setRows([draft(1), draft(2)]);
            setCurrency("USD");
            setNextId(3);
            setNotice("");
          }}
        >
          <RotateCcw size={15} />
          Reset estimates
        </Button>
        <Button variant="ghost" disabled={!estimates} onClick={exportEstimate}>
          <Download size={15} />
          Export comparison
        </Button>
      </div>
      <div aria-live="polite" className="mt-8 border-y border-border py-6">
        {estimates ? (
          <>
            <h3 className="text-xl">Estimated monthly comparison</h3>
            <div className="mt-6 grid gap-7 md:grid-cols-2">
              {estimates.map((e, i) => (
                <div key={rows[i]?.id} className="min-w-0">
                  <h4 className="break-words text-sm text-gold-light">{e.name}</h4>
                  <p className="mt-2 font-mono text-2xl text-foreground">
                    {unit(e.monthlyCost)}
                    <span className="ml-2 text-xs text-muted-foreground">/ month</span>
                  </p>
                  <dl className="mt-4 space-y-2 text-xs leading-6">
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Input · {e.inputTokens.toLocaleString()} tokens</dt>
                      <dd>{unit(e.inputCost)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Output · {e.outputTokens.toLocaleString()} tokens</dt>
                      <dd>{unit(e.outputCost)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Optional fixed amount</dt>
                      <dd>{unit(e.fixedMonthlyCost)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Above lowest entered estimate</dt>
                      <dd>{unit(e.differenceFromLowest)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt>Per request including fixed cost</dt>
                      <dd>
                        {e.perRequestCost === null ? "No requests entered" : unit(e.perRequestCost)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm leading-7 text-muted-foreground">
            Enter a name and every usage/rate field for each workflow. Values must be finite and
            non-negative; enter 0 only when that is your assumption.
          </p>
        )}
      </div>
      <p className="mt-5 text-xs leading-7 text-warning">
        Estimates are not actual charges or measured savings. Include billable reasoning in your
        output assumption. Provider context/cache tiers, media, tools, taxes, hosting and currency
        conversion may change costs. Consumer subscriptions do not imply API entitlement. No
        guaranteed free AI.
      </p>
      {notice && (
        <p role="status" className="mt-4 text-xs text-gold-light">
          {notice}
        </p>
      )}
    </section>
  );
}
