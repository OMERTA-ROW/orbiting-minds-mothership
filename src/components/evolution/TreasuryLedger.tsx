import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeftRight,
  CheckCircle2,
  CircleDollarSign,
  KeyRound,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelTreasuryJournal,
  createTreasuryAccount,
  postTreasuryJournal,
  prepareTreasuryJournal,
  readEvolutionTreasury,
  setTreasuryLimits,
  verifyTreasuryRecipient,
} from "@/lib/evolution-treasury.functions";
import {
  formatInternalUnits,
  treasuryAccountInput,
  treasuryLimitsInput,
  treasuryPrepareInput,
  type TreasuryAccount,
  type TreasuryJournal,
} from "@/lib/evolution-treasury";
import { ConsolePanel, EmptyState, MetricCard } from "./console/ConsolePrimitives";

const queryKey = ["evolution-internal-treasury"] as const;
const field = "mt-2 w-full border-gold/20 bg-console-panel";

type Confirmation = {
  journalId: string;
  amountUnits: number;
  summary: string;
};

export function TreasuryLedger() {
  const read = useServerFn(readEvolutionTreasury);
  const create = useServerFn(createTreasuryAccount);
  const verify = useServerFn(verifyTreasuryRecipient);
  const setLimits = useServerFn(setTreasuryLimits);
  const prepare = useServerFn(prepareTreasuryJournal);
  const post = useServerFn(postTreasuryJournal);
  const cancel = useServerFn(cancelTreasuryJournal);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: () => read(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<"opening" | "income" | "expense" | "transfer">("transfer");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [amountConfirmation, setAmountConfirmation] = useState("");
  const [verifyAccount, setVerifyAccount] = useState<TreasuryAccount | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [limitsAccount, setLimitsAccount] = useState<TreasuryAccount | null>(null);

  async function act(key: string, work: () => Promise<string>) {
    if (busy) return;
    setBusy(key);
    setNotice("");
    try {
      setNotice(await work());
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The operation failed; nothing was confirmed.",
      );
    } finally {
      await cache.invalidateQueries({ queryKey });
      setBusy("");
    }
  }

  const data = query.data;
  const accounts = data?.accounts ?? [];
  const pending = data?.journals.filter((journal) => journal.status === "pending") ?? [];
  const totalUnits = accounts.reduce((sum, account) => sum + account.balanceUnits, 0);

  function chooseConfirmation(journal: TreasuryJournal) {
    setConfirming({
      journalId: journal.id,
      amountUnits: journal.amountUnits,
      summary: `${journal.kind} · ${journal.sourceName ?? "Internal counterpart"} → ${journal.destinationName ?? "Internal counterpart"}`,
    });
    setAmountConfirmation("");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Owner-controlled · double-entry records</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">
            Internal allocation ledger
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Tracks internal budget units only. It does not hold bank funds, create provider
            balances, move money or replace invoices.
          </p>
        </div>
        <Button
          variant="signal"
          disabled={query.isFetching || Boolean(busy)}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Refresh ledger
        </Button>
      </header>

      {notice && (
        <p role="status" className="rounded-lg border border-gold/25 bg-console-panel p-3 text-sm">
          {notice}
        </p>
      )}
      {query.isError && (
        <EmptyState>
          Internal Treasury records could not be read. Confirm owner access and fresh two-step
          sign-in in Account Security, then retry.
        </EmptyState>
      )}
      {query.isPending && <EmptyState>Reading owner-scoped internal Treasury records…</EmptyState>}

      {data && (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Internal ledger summary"
          >
            <MetricCard
              label="Internal account units"
              value={formatInternalUnits(totalUnits)}
              note="Sum of owner-created internal accounts; not cash or a provider balance"
              icon={CircleDollarSign}
            />
            <MetricCard
              label="Internal accounts"
              value={String(accounts.length)}
              note={`${accounts.filter((account) => account.status === "active").length} active; up to 100 accounts`}
              icon={Landmark}
            />
            <MetricCard
              label="Pending confirmations"
              value={String(pending.length)}
              note="Prepared records do not change balances until explicitly posted"
              icon={ShieldCheck}
            />
            <MetricCard
              label="Bank / provider balances"
              value="Not connected"
              note="No financial provider or real-money transfer service is connected"
              icon={ArrowLeftRight}
            />
          </section>

          <p className="text-xs text-muted-foreground">
            Ledger checked {new Date(data.checkedAt).toLocaleString()} · {data.unitName} only · no
            real-money claims
          </p>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <ConsolePanel
              title="Accounts and balances"
              description="Verify a recipient before transferring to it. Limits apply to outgoing internal units."
            >
              {accounts.length ? (
                <div className="max-h-[26rem] overflow-auto rounded-lg border border-gold/15">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-console-raised text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3 font-medium">Account</th>
                        <th className="px-3 py-3 font-medium">Balance</th>
                        <th className="px-3 py-3 font-medium">Outgoing today</th>
                        <th className="px-3 py-3 font-medium">Limits</th>
                        <th className="px-3 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account) => (
                        <tr key={account.id} className="border-t border-gold/10 align-top">
                          <td className="px-3 py-3">
                            <p className="font-medium text-foreground">{account.name}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {account.status} ·{" "}
                              {account.verifiedAt ? "recipient verified" : "recipient unverified"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-gold-light">
                            {formatInternalUnits(account.balanceUnits)}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {formatInternalUnits(account.dailyOutUnits)}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {formatInternalUnits(account.perTransferLimitUnits)} / transfer
                            <br />
                            {formatInternalUnits(account.dailyLimitUnits)} / UTC day
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={Boolean(busy)}
                                onClick={() => {
                                  setVerifyAccount(account);
                                  setRecipientName("");
                                }}
                              >
                                <KeyRound /> {account.verifiedAt ? "Reverify" : "Verify"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={Boolean(busy)}
                                onClick={() => setLimitsAccount(account)}
                              >
                                Limits
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>
                  No internal accounts exist. Create one with zero units, then record an opening
                  allocation.
                </EmptyState>
              )}
            </ConsolePanel>

            <ConsolePanel
              title="Create internal account"
              description="Starts at zero units. Limits are editable safety controls, not spending authorization for agents."
            >
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const values = new FormData(form);
                  void act("create-account", async () => {
                    const input = treasuryAccountInput.parse({
                      name: values.get("name"),
                      perTransferLimit: Number(values.get("perTransferLimit")),
                      dailyLimit: Number(values.get("dailyLimit")),
                      requestId: crypto.randomUUID(),
                    });
                    await create({ data: input });
                    form.reset();
                    return `Internal account “${input.name}” created with zero units.`;
                  });
                }}
              >
                <label className="text-xs text-muted-foreground">
                  Account name
                  <Input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    className={field}
                    placeholder="Operations allocation"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-muted-foreground">
                    Per-transfer units
                    <Input
                      name="perTransferLimit"
                      type="number"
                      required
                      min={1}
                      max={1_000_000_000}
                      defaultValue={1000}
                      className={field}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Daily units
                    <Input
                      name="dailyLimit"
                      type="number"
                      required
                      min={1}
                      max={1_000_000_000}
                      defaultValue={5000}
                      className={field}
                    />
                  </label>
                </div>
                <Button type="submit" variant="cosmic" disabled={Boolean(busy)}>
                  <Plus /> Create zero-balance account
                </Button>
              </form>
            </ConsolePanel>
          </div>

          {verifyAccount && (
            <ConsolePanel
              title={`Verify recipient: ${verifyAccount.name}`}
              description="Type the exact account name. Fresh two-step confirmation is checked again by the backend."
              action={
                <Button variant="ghost" size="sm" onClick={() => setVerifyAccount(null)}>
                  Close
                </Button>
              }
            >
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act("verify-recipient", async () => {
                    await verify({
                      data: { accountId: verifyAccount.id, expectedName: recipientName },
                    });
                    setVerifyAccount(null);
                    return `Recipient “${verifyAccount.name}” verified for internal transfers.`;
                  });
                }}
              >
                <label className="min-w-64 flex-1 text-xs text-muted-foreground">
                  Exact recipient name
                  <Input
                    value={recipientName}
                    onChange={(event) => setRecipientName(event.target.value)}
                    required
                    className={field}
                    autoComplete="off"
                  />
                </label>
                <Button type="submit" disabled={Boolean(busy)}>
                  <CheckCircle2 /> Verify recipient
                </Button>
              </form>
            </ConsolePanel>
          )}

          {limitsAccount && (
            <ConsolePanel
              title={`Budget limits: ${limitsAccount.name}`}
              description="Fresh two-step confirmation is required. These limits do not alter CODE or Claude spending caps."
              action={
                <Button variant="ghost" size="sm" onClick={() => setLimitsAccount(null)}>
                  Close
                </Button>
              }
            >
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void act("set-limits", async () => {
                    const input = treasuryLimitsInput.parse({
                      accountId: limitsAccount.id,
                      perTransferLimit: Number(values.get("perTransferLimit")),
                      dailyLimit: Number(values.get("dailyLimit")),
                    });
                    await setLimits({ data: input });
                    setLimitsAccount(null);
                    return `Internal-unit limits saved for ${limitsAccount.name}.`;
                  });
                }}
              >
                <label className="text-xs text-muted-foreground">
                  Per-transfer units
                  <Input
                    name="perTransferLimit"
                    type="number"
                    min={1}
                    max={1_000_000_000}
                    defaultValue={limitsAccount.perTransferLimitUnits}
                    className={field}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Daily units
                  <Input
                    name="dailyLimit"
                    type="number"
                    min={1}
                    max={1_000_000_000}
                    defaultValue={limitsAccount.dailyLimitUnits}
                    className={field}
                  />
                </label>
                <Button type="submit" disabled={Boolean(busy)}>
                  Save limits
                </Button>
              </form>
            </ConsolePanel>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <ConsolePanel
              title="Prepare an internal journal"
              description="Preparation changes no balances. You will review and confirm the exact amount separately."
            >
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void act("prepare-journal", async () => {
                    const input = treasuryPrepareInput.parse({
                      kind,
                      sourceAccountId: source || null,
                      destinationAccountId: destination || null,
                      amountUnits: Number(values.get("amountUnits")),
                      note: values.get("note"),
                      requestId: crypto.randomUUID(),
                    });
                    const result = await prepare({ data: input });
                    const sourceName =
                      accounts.find((account) => account.id === input.sourceAccountId)?.name ??
                      "Internal counterpart";
                    const destinationName =
                      accounts.find((account) => account.id === input.destinationAccountId)?.name ??
                      "Internal counterpart";
                    if (!result.journalId || result.amountUnits === undefined)
                      throw new Error("The backend returned an incomplete journal confirmation.");
                    setConfirming({
                      journalId: result.journalId,
                      amountUnits: result.amountUnits,
                      summary: `${kind} · ${sourceName} → ${destinationName}`,
                    });
                    setAmountConfirmation("");
                    return "Internal journal prepared. Review and confirm the exact amount; no balance changed.";
                  });
                }}
              >
                <label className="text-xs text-muted-foreground">
                  Record type
                  <select
                    className="exchange-select mt-2 w-full bg-console-panel"
                    value={kind}
                    onChange={(event) => {
                      const next = event.target.value as typeof kind;
                      setKind(next);
                      setSource("");
                      setDestination("");
                    }}
                  >
                    <option value="transfer">Internal transfer</option>
                    <option value="opening">Opening allocation</option>
                    <option value="income">Internal income record</option>
                    <option value="expense">Internal expense record</option>
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Source account
                    <select
                      className="exchange-select mt-2 w-full bg-console-panel"
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                      disabled={kind === "opening" || kind === "income"}
                      required={kind === "expense" || kind === "transfer"}
                    >
                      <option value="">Internal counterpart</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Destination account
                    <select
                      className="exchange-select mt-2 w-full bg-console-panel"
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                      disabled={kind === "expense"}
                      required={kind !== "expense"}
                    >
                      <option value="">Internal counterpart</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                          {account.verifiedAt ? "" : " · unverified"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="text-xs text-muted-foreground">
                  Amount in internal units
                  <Input
                    name="amountUnits"
                    type="number"
                    required
                    min={1}
                    max={1_000_000_000}
                    className={field}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Non-sensitive note
                  <Input
                    name="note"
                    maxLength={280}
                    className={field}
                    placeholder="Purpose or budget reference"
                  />
                </label>
                <Button type="submit" variant="cosmic" disabled={Boolean(busy) || !accounts.length}>
                  Prepare for confirmation
                </Button>
              </form>
            </ConsolePanel>

            <ConsolePanel
              title="Confirm and post"
              description="The backend rechecks fresh two-step sign-in, Emergency Stop, recipient verification, limits and available units atomically."
            >
              {confirming ? (
                <form
                  className="grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act("post-journal", async () => {
                      await post({
                        data: {
                          journalId: confirming.journalId,
                          amountConfirmation: Number(amountConfirmation),
                        },
                      });
                      setConfirming(null);
                      return "Internal journal posted and audited. No real money moved.";
                    });
                  }}
                >
                  <p className="rounded-lg border border-gold/20 bg-console-deep p-3 text-sm">
                    {confirming.summary}
                    <strong className="mt-2 block text-gold-light">
                      {formatInternalUnits(confirming.amountUnits)}
                    </strong>
                  </p>
                  <label className="text-xs text-muted-foreground">
                    Type the exact amount to confirm
                    <Input
                      value={amountConfirmation}
                      onChange={(event) => setAmountConfirmation(event.target.value)}
                      inputMode="numeric"
                      required
                      className={field}
                      autoComplete="off"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="cosmic" disabled={Boolean(busy)}>
                      <CheckCircle2 /> Post internal journal
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={Boolean(busy)}
                      onClick={() => setConfirming(null)}
                    >
                      Close
                    </Button>
                  </div>
                </form>
              ) : (
                <EmptyState>
                  Select a prepared journal below or prepare a new one. Nothing posts automatically.
                </EmptyState>
              )}
            </ConsolePanel>
          </div>

          <ConsolePanel
            title="Transfer and journal history"
            description="Latest 100 owner-scoped records. Pending records expire after ten minutes unless posted or cancelled."
          >
            {data.journals.length ? (
              <div className="max-h-[28rem] overflow-auto rounded-lg border border-gold/15">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-console-raised text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-medium">Created</th>
                      <th className="px-3 py-3 font-medium">Record</th>
                      <th className="px-3 py-3 font-medium">Path</th>
                      <th className="px-3 py-3 font-medium">Amount</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.journals.map((journal) => (
                      <tr key={journal.id} className="border-t border-gold/10 align-top">
                        <td className="px-3 py-3 text-muted-foreground">
                          {new Date(journal.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 capitalize text-foreground">
                          {journal.kind}
                          {journal.note && (
                            <span className="mt-1 block max-w-48 text-[10px] text-muted-foreground">
                              {journal.note}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {journal.sourceName ?? "Internal counterpart"} →{" "}
                          {journal.destinationName ?? "Internal counterpart"}
                        </td>
                        <td className="px-3 py-3 text-gold-light">
                          {formatInternalUnits(journal.amountUnits)}
                        </td>
                        <td className="px-3 py-3 capitalize">{journal.status}</td>
                        <td className="px-3 py-3">
                          {journal.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={Boolean(busy)}
                                onClick={() => chooseConfirmation(journal)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Cancel ${journal.kind} journal`}
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void act("cancel-journal", async () => {
                                    await cancel({ data: { journalId: journal.id } });
                                    setConfirming(null);
                                    return "Pending internal journal cancelled; no balance changed.";
                                  })
                                }
                              >
                                <XCircle />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {journal.postedAt
                                ? new Date(journal.postedAt).toLocaleString()
                                : "Closed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>No internal journals have been prepared.</EmptyState>
            )}
          </ConsolePanel>

          <ConsolePanel
            title="Durable audit history"
            description="Latest 100 actions. Audit and posted entries are append-only; corrections require a new journal."
          >
            {data.audit.length ? (
              <div className="max-h-72 overflow-auto rounded-lg border border-gold/15">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="sticky top-0 bg-console-raised text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-medium">Recorded</th>
                      <th className="px-3 py-3 font-medium">Action</th>
                      <th className="px-3 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((entry) => (
                      <tr key={entry.id} className="border-t border-gold/10">
                        <td className="px-3 py-3 text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-foreground">
                          {entry.action.replaceAll("_", " ")}
                        </td>
                        <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                          {entry.journalId ?? entry.accountId ?? "Account policy"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>No internal ledger actions have been recorded.</EmptyState>
            )}
          </ConsolePanel>
        </>
      )}
    </div>
  );
}
