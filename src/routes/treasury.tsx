import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CircleDollarSign, CreditCard, Server, ShieldAlert } from "lucide-react";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { readTreasury } from "@/lib/omni-workspace.functions";
import { GLOBAL_LIMITS, fmtCents } from "@/lib/omni-workspace";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/treasury")({
  head: () =>
    seo(
      "Treasury · Owner only",
      "Read-only view of OMNI workspace budgets and reported spend. No funding accounts or transfers are connected.",
    ),
  component: TreasuryPage,
});

type Snapshot = Awaited<ReturnType<typeof readTreasury>>;

function TreasuryPage() {
  const read = useServerFn(readTreasury);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void read()
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch(() => {
        if (active) {
          setSnapshot(null);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [read]);

  return (
    <>
      <PageHeader eyebrow="Mothership · Owner-only" title="Treasury">
        A read-only view of the existing OMNI workspace spend meter and per-agent limits.
        <div className="mt-5">
          <DemoBadge label="No funding accounts connected · No transfers" />
        </div>
      </PageHeader>
      <Section className="space-y-8">
        <div
          role="note"
          className="flex items-start gap-3 border border-gold/25 bg-card/60 p-4 text-sm text-muted-foreground"
        >
          <ShieldAlert className="mt-0.5 shrink-0 text-gold" size={18} aria-hidden />
          <p>
            This page reports costs received by OMNI&apos;s workspace meter; they are not bank
            transactions or provider-invoice reconciliation. Jackboy&apos;s separate permit caps and
            ledger are not included. No balance, reservation, infrastructure cost, or transfer is
            inferred here.
          </p>
        </div>

        {error && (
          <p role="alert" className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Treasury records could not be read. No values are displayed; sign in as the verified
            owner with the required assurance level, then reload.
          </p>
        )}

        {!snapshot && !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading owner-scoped Treasury records…
          </p>
        )}

        {snapshot && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={CreditCard}
                label="Verified account balances"
                value="Not connected"
                note="No financial provider is connected."
              />
              <SummaryCard
                icon={CircleDollarSign}
                label="OMNI-reported spend · this month"
                value={fmtCents(snapshot.spend.monthCents)}
                note="USD cents recorded in the OMNI workspace ledger."
              />
              <SummaryCard
                icon={Activity}
                label="OMNI-reported spend · today"
                value={fmtCents(snapshot.spend.dayCents)}
                note="UTC day; not a provider invoice."
              />
              <SummaryCard
                icon={Server}
                label="Infrastructure costs"
                value="Not tracked"
                note="No cloud or owned-server cost source is connected."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <article className="glass p-5 md:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="eyebrow">Existing policy</p>
                    <h2 className="mt-2 text-xl text-gold-light">OMNI workspace spend limits</h2>
                  </div>
                  <span className="rounded-full border border-success/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-success">
                    Read only
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Code-enforced global ceilings. These are limits, not funded balances or
                  allocations; changing them is outside this Treasury view.
                </p>
                <dl className="mt-5 grid grid-cols-3 gap-3">
                  <Limit label="Per task" cents={GLOBAL_LIMITS.task} />
                  <Limit label="Per UTC day" cents={GLOBAL_LIMITS.day} />
                  <Limit label="Lifetime" cents={GLOBAL_LIMITS.total} />
                </dl>
              </article>
              <article className="glass p-5 md:p-6">
                <p className="eyebrow">Funding & reserves</p>
                <h2 className="mt-2 text-xl text-gold-light">No transfer capability</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Funding sources, budget allocations, reservations, and funding requests are not
                  implemented. No money can be moved from this page.
                </p>
                <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
                  Snapshot generated {new Date(snapshot.generatedAt).toLocaleString()}.
                </p>
              </article>
            </div>

            <article className="glass p-5 md:p-6">
              <div className="mb-5">
                <p className="eyebrow">Registered profiles</p>
                <h2 className="mt-2 text-xl text-gold-light">OMNI workspace agents</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Profiles and limits come from the owner-protected workspace registry. They do not
                  represent external bank accounts or independent counterpart funds.
                </p>
              </div>
              {snapshot.agents.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="pb-3 pr-4">Agent</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 pr-4">Per task</th>
                        <th className="pb-3 pr-4">Per day</th>
                        <th className="pb-3 pr-4">Lifetime</th>
                        <th className="pb-3">Recorded total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.agents.map((agent) => (
                        <tr key={agent.id} className="border-b border-border/70 last:border-0">
                          <td className="py-3 pr-4 text-gold-light">{agent.display_name}</td>
                          <td className="py-3 pr-4 capitalize">{agent.status}</td>
                          <td className="py-3 pr-4">{fmtCents(agent.budget_task_cents)}</td>
                          <td className="py-3 pr-4">{fmtCents(agent.budget_day_cents)}</td>
                          <td className="py-3 pr-4">{fmtCents(agent.budget_total_cents)}</td>
                          <td className="py-3">
                            {fmtCents(snapshot.spend.byAgent[agent.id]?.totalCents ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No workspace agent profiles are registered.
                </p>
              )}
            </article>

            <article className="glass p-5 md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <Activity className="text-gold" size={20} aria-hidden />
                <div>
                  <p className="eyebrow">Append-only workspace meter</p>
                  <h2 className="mt-1 text-xl text-gold-light">Recent reported spend</h2>
                </div>
              </div>
              {snapshot.activity.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="pb-3 pr-4">Recorded</th>
                        <th className="pb-3 pr-4">Agent</th>
                        <th className="pb-3 pr-4">Note</th>
                        <th className="pb-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.activity.map((entry) => (
                        <tr key={entry.id} className="border-b border-border/70 last:border-0">
                          <td className="py-3 pr-4 text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-gold-light">{entry.agent_id}</td>
                          <td className="max-w-64 truncate py-3 pr-4 text-muted-foreground">
                            {entry.note || "Workspace usage"}
                          </td>
                          <td className="py-3 text-right">{fmtCents(entry.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No spend entries are recorded in the OMNI workspace ledger.
                </p>
              )}
            </article>

            <div className="grid gap-4 md:grid-cols-2">
              <IntegrationState title="Counterpart accounts" state="Not configured" />
              <IntegrationState title="Server inventory & health" state="Not connected" />
              <IntegrationState title="Provider balances & reconciliation" state="Not connected" />
              <IntegrationState title="Honeycomb mobile Treasury API" state="Not implemented" />
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="glass min-h-36 p-5">
      <div className="flex items-center gap-2 text-gold">
        <Icon size={17} aria-hidden />
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-5 font-display text-2xl text-gold-gradient">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </article>
  );
}

function Limit({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="border border-border bg-background/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 font-display text-xl text-gold-light">{fmtCents(cents)}</dd>
    </div>
  );
}

function IntegrationState({ title, state }: { title: string; state: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-border bg-card/40 p-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="shrink-0 rounded-full border border-muted-foreground/30 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {state}
      </span>
    </div>
  );
}
