import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CircleDollarSign,
  CreditCard,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { TreasuryLedger } from "@/components/evolution/TreasuryLedger";
import {
  ConsolePanel,
  EmptyState,
  MetricCard,
} from "@/components/evolution/console/ConsolePrimitives";
import { readTreasury } from "@/lib/omni-workspace.functions";
import { GLOBAL_LIMITS, fmtCents } from "@/lib/omni-workspace";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/treasury")({
  head: () =>
    seo(
      "Treasury · Internal Ledger and AI Usage",
      "Owner-only internal allocation records and reported OMNI spending. No bank funds, provider balances or real-money transfers are connected.",
    ),
  component: TreasuryPage,
});

function TreasuryPage() {
  const read = useServerFn(readTreasury);
  const query = useQuery({
    queryKey: ["omni-treasury-usage"],
    queryFn: () => read(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const snapshot = query.data;

  return (
    <>
      <PageHeader eyebrow="Mothership · Owner-only" title="Treasury">
        Internal budget allocations and separately reported AI usage, with durable owner approvals.
        <div className="mt-5">
          <DemoBadge label="Internal units only · No real-money transfers" />
        </div>
      </PageHeader>
      <Section className="space-y-8">
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-gold/25 bg-console-panel p-4 text-sm text-muted-foreground"
        >
          <ShieldAlert className="mt-0.5 shrink-0 text-gold" size={18} aria-hidden />
          <p>
            Internal accounts hold allocation units, not money. OMNI usage is reported separately
            and is not provider-invoice reconciliation. Jackboy permits, Claude usage and cloud
            invoices are not silently merged into these totals.
          </p>
        </div>

        <TreasuryLedger />

        <section
          aria-labelledby="reported-ai-usage"
          className="space-y-5 border-t border-gold/20 pt-7"
        >
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Separate usage evidence</p>
              <h2 id="reported-ai-usage" className="mt-2 text-2xl font-semibold text-foreground">
                Reported OMNI workspace usage
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                USD cents recorded by the existing OMNI workspace meter. These are not internal
                units.
              </p>
            </div>
            <Button
              variant="signal"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Refresh usage
            </Button>
          </header>

          {query.isError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              Reported OMNI usage could not be read. No values are inferred.
              <Button asChild variant="outline" size="sm" className="ml-3">
                <Link to="/account-security">Open Account Security</Link>
              </Button>
            </div>
          )}
          {query.isPending && <EmptyState>Loading owner-scoped OMNI usage…</EmptyState>}

          {snapshot && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={CreditCard}
                  label="Provider account balances"
                  value="Not connected"
                  note="No financial provider is connected"
                />
                <MetricCard
                  icon={CircleDollarSign}
                  label="OMNI-reported spend · month"
                  value={fmtCents(snapshot.spend.monthCents)}
                  note="USD cents recorded by the OMNI workspace"
                />
                <MetricCard
                  icon={Activity}
                  label="OMNI-reported spend · today"
                  value={fmtCents(snapshot.spend.dayCents)}
                  note="UTC day; not a provider invoice"
                />
                <MetricCard
                  icon={Server}
                  label="Infrastructure costs"
                  value="Not tracked"
                  note="No authoritative cloud cost source is connected"
                />
              </div>

              <div className="grid items-start gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <ConsolePanel
                  title="OMNI workspace spend limits"
                  description="Existing code-enforced ceilings. Treasury does not change them."
                >
                  <dl className="grid grid-cols-3 gap-2">
                    <Limit label="Per task" cents={GLOBAL_LIMITS.task} />
                    <Limit label="Per UTC day" cents={GLOBAL_LIMITS.day} />
                    <Limit label="Lifetime" cents={GLOBAL_LIMITS.total} />
                  </dl>
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Snapshot generated {new Date(snapshot.generatedAt).toLocaleString()}. Separate
                    Claude and Jackboy controls remain independent.
                  </p>
                </ConsolePanel>

                <ConsolePanel
                  title="Registered agent limits"
                  description="Owner-protected workspace profiles, not financial accounts."
                >
                  {snapshot.agents.length ? (
                    <div className="max-h-80 overflow-auto rounded-lg border border-gold/15">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead className="sticky top-0 bg-console-raised text-muted-foreground">
                          <tr>
                            <th className="px-3 py-3 font-medium">Agent</th>
                            <th className="px-3 py-3 font-medium">Status</th>
                            <th className="px-3 py-3 font-medium">Per task</th>
                            <th className="px-3 py-3 font-medium">Per day</th>
                            <th className="px-3 py-3 font-medium">Lifetime</th>
                            <th className="px-3 py-3 font-medium">Recorded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.agents.map((agent) => (
                            <tr key={agent.id} className="border-t border-gold/10">
                              <td className="px-3 py-3 text-gold-light">{agent.display_name}</td>
                              <td className="px-3 py-3 capitalize">{agent.status}</td>
                              <td className="px-3 py-3">{fmtCents(agent.budget_task_cents)}</td>
                              <td className="px-3 py-3">{fmtCents(agent.budget_day_cents)}</td>
                              <td className="px-3 py-3">{fmtCents(agent.budget_total_cents)}</td>
                              <td className="px-3 py-3">
                                {fmtCents(snapshot.spend.byAgent[agent.id]?.totalCents ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState>No workspace agent profiles are registered.</EmptyState>
                  )}
                </ConsolePanel>
              </div>

              <ConsolePanel
                title="Recent reported OMNI spend"
                description="The latest 20 entries from the existing append-only workspace meter."
              >
                {snapshot.activity.length ? (
                  <div className="max-h-96 overflow-auto rounded-lg border border-gold/15">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="sticky top-0 bg-console-raised text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3 font-medium">Recorded</th>
                          <th className="px-3 py-3 font-medium">Agent</th>
                          <th className="px-3 py-3 font-medium">Note</th>
                          <th className="px-3 py-3 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.activity.map((entry) => (
                          <tr key={entry.id} className="border-t border-gold/10">
                            <td className="px-3 py-3 text-muted-foreground">
                              {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-gold-light">{entry.agent_id}</td>
                            <td className="max-w-64 truncate px-3 py-3 text-muted-foreground">
                              {entry.note || "Workspace usage"}
                            </td>
                            <td className="px-3 py-3 text-right">{fmtCents(entry.cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>
                    No spend entries are recorded in the OMNI workspace ledger.
                  </EmptyState>
                )}
              </ConsolePanel>
            </>
          )}
        </section>
      </Section>
    </>
  );
}

function Limit({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-lg border border-border bg-console-deep p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-lg text-gold-light">{fmtCents(cents)}</dd>
    </div>
  );
}
