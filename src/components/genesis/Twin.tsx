import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGenesis } from "@/hooks/use-genesis";
import { twinInput } from "@/lib/genesis";
import { GenesisShell, IdentitySelect, FormNotice, fieldLabel } from "./GenesisShell";
import { TrustConnections } from "@/components/trusted/TrustShell";
export function TwinPage({ capsuleId = "" }: { capsuleId?: string }) {
  const { store, dispatch } = useGenesis();
  const [selected, setSelected] = useState(capsuleId);
  const [message, setMessage] = useState("");
  const capsule = store.capsules.find((item) => item.id === selected);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = twinInput.safeParse({
      ...Object.fromEntries(data),
      capsuleId: selected,
      baselineMs: Number(data.get("baselineMs")),
      targetMs: Number(data.get("targetMs")),
      workload: Number(data.get("workload")),
      efficiencyPercent: Number(data.get("efficiencyPercent")),
    });
    if (!parsed.success) {
      setMessage(
        "Select a capsule and runner; baseline/target 1–100,000 ms, workload 1–1,000 and assumed efficiency 0–50%.",
      );
      return;
    }
    try {
      dispatch({ type: "twin", input: parsed.data });
      setMessage(
        "Synthetic model result saved. Submitted code and test plan were NOT executed; no hardware was measured.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Simulation failed.");
    }
  };
  return (
    <GenesisShell title="Digital Twin Lab" eyebrow="Model assumptions. Preserve evidence.">
      <TrustConnections />
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <h2 className="text-2xl">Synthetic latency configuration</h2>
          <p className="mt-4 max-w-2xl text-sm leading-loose text-muted-foreground">
            This numeric model explores a hypothetical latency budget. Efficiency is an assumption
            you supply, not a measured improvement. No capsule code, dependencies or benchmark
            procedure is executed.
          </p>
          {store.capsules.length === 0 ? (
            <div className="mt-8 border-y border-border py-8">
              <p className="text-sm text-muted-foreground">
                Submit a documented capsule to a challenge first.
              </p>
              <Button asChild variant="signal" className="mt-5">
                <Link to="/challenges">Open Challenge Board</Link>
              </Button>
            </div>
          ) : (
            <form className="mt-8 grid gap-6" noValidate onSubmit={submit}>
              <label className={fieldLabel}>
                Submitted capsule
                <select
                  className="exchange-select mt-2 w-full"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  required
                >
                  <option value="">Choose capsule</option>
                  {store.capsules.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <IdentitySelect
                name="runnerId"
                scope="simulate_twins"
                label="Local simulation runner"
              />
              <div className="grid gap-5 sm:grid-cols-2">
                {[
                  {
                    name: "baselineMs",
                    label: "Baseline per workload unit · ms",
                    value: 100,
                    min: 1,
                    max: 100000,
                  },
                  {
                    name: "targetMs",
                    label: "Benchmark target · ms",
                    value: 90,
                    min: 1,
                    max: 100000,
                  },
                  { name: "workload", label: "Workload units", value: 1, min: 1, max: 1000 },
                  {
                    name: "efficiencyPercent",
                    label: "Assumed efficiency · % · not measured",
                    value: 20,
                    min: 0,
                    max: 50,
                  },
                ].map((field) => (
                  <label className={fieldLabel} key={field.name}>
                    {field.label}
                    <Input
                      type="number"
                      name={field.name}
                      defaultValue={field.value}
                      min={field.min}
                      max={field.max}
                      step={field.name === "workload" ? "1" : "any"}
                      required
                      className="mt-2"
                    />
                  </label>
                ))}
              </div>
              <FormNotice message={message} />
              <Button
                type="submit"
                variant="signal"
                className="h-auto min-h-11 justify-self-start whitespace-normal"
              >
                <FlaskConical size={16} />
                Run synthetic model
              </Button>
            </form>
          )}
          {capsule && (
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="text-lg">Capsule evidence plan · not executed</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">
                {capsule.testPlan}
              </p>
              <Link
                to="/capsules/$id"
                params={{ id: capsule.id }}
                className="mt-5 inline-block text-sm text-gold-light underline"
              >
                Review capsule and recorded decision
              </Link>
            </div>
          )}
        </section>
        <aside className="min-w-0 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h2 className="text-xl">Evidence boundary</h2>
          <p className="mt-5 font-mono text-xs leading-loose text-gold-light">
            synthetic-latency-v1
            <br />
            result = baseline × workload × (1 − efficiency / 100)
          </p>
          <p className="mt-5 text-sm leading-loose text-muted-foreground">
            A within-target result validates only these arithmetic assumptions. Hardware evidence
            needs authenticated device ownership, calibrated instruments, captured raw measurements
            and independent review. None is connected.
          </p>
          <Button disabled variant="outline" className="mt-6 h-auto whitespace-normal">
            Connect hardware · unconfigured
          </Button>
          <Button disabled variant="outline" className="mt-4 h-auto whitespace-normal">
            Execute submitted code · disabled
          </Button>
        </aside>
      </div>
      <section className="mt-16 border-t border-border pt-8">
        <h2 className="text-2xl">Recorded results</h2>
        {store.twins.length === 0 && (
          <p className="mt-5 text-sm text-muted-foreground">No test result records yet.</p>
        )}
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          {[...store.twins].reverse().map((test) => (
            <article key={test.id} className="min-w-0 border-t border-border py-6">
              <p className="font-mono text-xs text-gold-light">SIMULATION · {test.outcome}</p>
              <Link
                to="/capsules/$id"
                params={{ id: test.capsuleId }}
                className="mt-4 block text-lg hover:text-gold-light"
              >
                {store.capsules.find((item) => item.id === test.capsuleId)?.title}
              </Link>
              <p className="mt-5 font-mono text-3xl text-gold-light">
                {test.resultMs} <span className="text-sm">ms modeled</span>
              </p>
              <p className="mt-3 text-xs leading-loose text-muted-foreground">
                Baseline {test.baselineMs} ms · target {test.targetMs} ms · workload {test.workload}{" "}
                · assumed efficiency {test.efficiencyPercent}%<br />
                No code executed · no hardware evidence · no certification
              </p>
              <time
                dateTime={test.createdAt}
                className="mt-3 block font-mono text-[10px] text-muted-foreground"
              >
                {new Date(test.createdAt).toLocaleString()}
              </time>
            </article>
          ))}
        </div>
      </section>
    </GenesisShell>
  );
}
