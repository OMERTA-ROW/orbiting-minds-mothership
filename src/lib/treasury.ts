export type TreasuryLedgerEntry = {
  agent_id: string;
  cents: number;
  created_at: string;
};

export type TreasurySpendSummary = {
  totalCents: number;
  dayCents: number;
  monthCents: number;
  byAgent: Record<string, { totalCents: number; dayCents: number; monthCents: number }>;
};

export function summarizeOmniLedger(
  entries: readonly TreasuryLedgerEntry[],
  now: Date,
): TreasurySpendSummary {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Treasury timestamp is invalid.");

  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const summary: TreasurySpendSummary = {
    totalCents: 0,
    dayCents: 0,
    monthCents: 0,
    byAgent: {},
  };
  const byAgent = new Map<string, { totalCents: number; dayCents: number; monthCents: number }>();

  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.cents) || entry.cents < 0)
      throw new Error("Treasury ledger contains an invalid amount.");
    const createdAt = Date.parse(entry.created_at);
    if (!Number.isFinite(createdAt) || createdAt > nowMs)
      throw new Error("Treasury ledger contains an invalid timestamp.");

    let agent = byAgent.get(entry.agent_id);
    if (!agent) {
      agent = { totalCents: 0, dayCents: 0, monthCents: 0 };
      byAgent.set(entry.agent_id, agent);
    }
    summary.totalCents = addCents(summary.totalCents, entry.cents);
    agent.totalCents = addCents(agent.totalCents, entry.cents);
    if (createdAt >= monthStart) {
      summary.monthCents = addCents(summary.monthCents, entry.cents);
      agent.monthCents = addCents(agent.monthCents, entry.cents);
    }
    if (createdAt >= dayStart) {
      summary.dayCents = addCents(summary.dayCents, entry.cents);
      agent.dayCents = addCents(agent.dayCents, entry.cents);
    }
  }

  summary.byAgent = Object.fromEntries(byAgent);
  return summary;
}

function addCents(total: number, amount: number): number {
  const sum = total + amount;
  if (!Number.isSafeInteger(sum)) throw new Error("Treasury ledger total is out of range.");
  return sum;
}
