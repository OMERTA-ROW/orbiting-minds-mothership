import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/hooks/use-account";
import { readRepositoryFeatures, readFeatureInventory } from "@/lib/repository-features.functions";
import { featureLabels, featureBlockers, type RepositoryFeature } from "@/lib/repository-features";

export function RepositoryFeatures({ feature }: { feature: RepositoryFeature }) {
  const { ready, user } = useAccount();
  const [provider, setProvider] = useState<"forgejo" | "github">("forgejo");
  const [search, setSearch] = useState("");
  const blocker =
    provider === "github" && (feature === "environments" || feature === "code-search")
      ? undefined
      : featureBlockers[feature];
  const inventory = useQuery({
    queryKey: ["repository-feature-inventory", provider],
    queryFn: () => readFeatureInventory({ data: { provider } }),
    enabled: ready && Boolean(user),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const read = useServerFn(readRepositoryFeatures);
  const [repo, setRepo] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof readRepositoryFeatures>> | null>(
    null,
  );
  async function load(next = 1) {
    if (!repo || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await read({ data: { repo, feature, page: next, provider, search } }));
      setPage(next);
    } catch {
      setResult({
        state: "blocked",
        message:
          "Read could not be confirmed. Check owner sign-in and gateway availability, then retry.",
        rows: [],
      });
    } finally {
      setBusy(false);
    }
  }
  const repos = inventory.data?.state === "connected" ? inventory.data.repos : [];
  const rows =
    result?.rows.filter((r) =>
      `${r.name} ${r.id} ${r.status}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <section className="min-w-0 space-y-6">
      <header className="border-b border-border pb-5">
        <p className="eyebrow">OMNI Block · Evolution Git</p>
        <h1 className="mt-3 text-3xl font-semibold">{featureLabels[feature]}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Private Forgejo mirrors · GitHub remains upstream · repository writes are not authorized
          by this GET-only gateway.
        </p>
      </header>
      {!user && (
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      )}
      {inventory.data?.state !== "connected" && (
        <p role="status" className="text-sm text-muted-foreground">
          {inventory.isFetching
            ? "Checking authorized repository inventory…"
            : inventory.data?.state === "not_configured"
              ? `Missing server settings: ${inventory.data.missing.join(", ")}. Configure through Project Settings → Secrets.`
              : inventory.data?.state === "unreachable"
                ? inventory.data.message
                : "Repository inventory not verified. Owner access, MFA and the approved gateway are required."}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-full text-sm sm:w-auto">
          Provider
          <select
            aria-label="Provider"
            className="exchange-select mt-2 block"
            value={provider}
            disabled={busy}
            onChange={(e) => {
              setProvider(e.target.value === "github" ? "github" : "forgejo");
              setRepo("");
              setResult(null);
              setPage(1);
            }}
          >
            <option value="forgejo">Evolution Git · Forgejo</option>
            <option value="github">GitHub · OMERTA-ROW</option>
          </select>
        </label>
        <label className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
          Repository
          <select
            aria-label="Repository"
            className="exchange-select mt-2 w-full"
            value={repo}
            disabled={busy || !repos.length}
            onChange={(e) => {
              setRepo(e.target.value);
              setResult(null);
              setPage(1);
            }}
          >
            <option value="">Select an authorized repository</option>
            {repos.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={
            !repo || busy || Boolean(blocker) || (feature === "code-search" && !search.trim())
          }
          onClick={() => void load()}
        >
          <RefreshCw size={15} />
          {busy ? "Reading…" : "Read records"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/repositories">Repository inventory & integrity audit</Link>
        </Button>
      </div>
      {feature === "code-search" && provider === "github" && (
        <label className="block text-sm">
          Search authorized repository filenames/code
          <Input
            aria-label="Repository search words"
            maxLength={100}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value.replace(/[^A-Za-z0-9_.\- ]/g, ""));
              setResult(null);
            }}
            className="mt-2 max-w-lg"
          />
        </label>
      )}
      <Button
        variant="outline"
        disabled={inventory.isFetching || busy || !user}
        onClick={() => void inventory.refetch()}
      >
        Refresh authorized inventory
      </Button>
      {inventory.data?.state === "connected" && inventory.data.truncated && (
        <p className="text-sm text-warning">
          Inventory reached its bounded page limit; not every repository is listed.
        </p>
      )}
      {blocker && (
        <p
          role="status"
          className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        >
          {blocker}
        </p>
      )}
      {result?.state === "blocked" && (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          {result.message}
        </p>
      )}
      {result?.state === "read" && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>
              Gateway records checked {result.checkedAt} · page {page}
            </span>
            <Input
              aria-label="Filter returned records"
              placeholder="Filter returned records"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">Name / title</th>
                  <th className="p-3">Identifier</th>
                  <th className="p-3">State</th>
                  <th className="p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="max-w-sm break-words p-3">{r.name}</td>
                    <td className="max-w-48 break-all p-3 font-mono text-xs text-primary">
                      {r.id}
                    </td>
                    <td className="p-3">{r.status}</td>
                    <td className="p-3">{r.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-5 text-sm text-muted-foreground">
                {result.rows.length
                  ? "No returned records match this filter."
                  : "No records were returned by the provider for this page."}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || page <= 1}
              onClick={() => void load(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={busy || !result.hasNext || page >= 20}
              onClick={() => void load(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      <div className="border-t border-border pt-5">
        <h2 className="text-lg">Owner write workflow</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Blocked: the approved gateway permits GET only. A separately reviewed mutation contract,
          per-repository grant, fresh MFA, protected-branch review, Emergency Stop checks and
          durable audit are required before writes can be enabled; execution also requires existing
          permits and verified isolation. No gateway policy or approval is changed here.
        </p>
        <Button
          disabled
          variant="outline"
          className="mt-3"
          title="No reviewed repository mutation contract or grant"
        >
          <LockKeyhole size={15} />
          Write unavailable
        </Button>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="ghost">
            <Link to="/activation-approvals">Existing approval controls</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/account-security">Account Security</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/projects">Project controls</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
