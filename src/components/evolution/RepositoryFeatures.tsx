import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/hooks/use-account";
import {
  readRepositoryFeatures,
  readFeatureInventory,
  readAccessDiagnosis,
} from "@/lib/repository-features.functions";
import { RepositoryPicker } from "./RepositoryPicker";
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
  const diagnose = useServerFn(readAccessDiagnosis);
  const access = useQuery({
    queryKey: ["repository-access-diagnosis"],
    queryFn: () => diagnose(),
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
    <section className="min-w-0 space-y-4">
      <header className="border-b border-border pb-3">
        <p className="eyebrow">OMNI Block · Evolution Git</p>
        <h1 className="mt-1 text-2xl font-semibold">{featureLabels[feature]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
        <RepositoryPicker
          repos={repos}
          value={repo}
          disabled={busy}
          onChange={(next) => {
            setRepo(next);
            setResult(null);
            setPage(1);
          }}
        />
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
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Button
          size="sm"
          variant="outline"
          disabled={inventory.isFetching || busy || !user}
          onClick={() => void inventory.refetch()}
        >
          {inventory.isFetching ? "Refreshing…" : "Refresh authorized inventory"}
        </Button>
        {inventory.data?.state === "connected" && (
          <span>
            {inventory.data.repos.length} authorized repositories · checked{" "}
            {inventory.data.checkedAt}
          </span>
        )}
        {access.data && (
          <span role="status">
            Session: {access.data.assurance === "aal2" ? "two-step verified" : `assurance ${access.data.assurance ?? "unknown"} (sign out and back in with your code if you just verified)`}{" "}
            · owner {access.data.owner === true ? "confirmed" : access.data.owner === false ? "not confirmed" : "unverified"}
            {provider === "forgejo" &&
              ` · gateway feature routes enabled: ${access.data.forgejoRoutes.length ? access.data.forgejoRoutes.join(", ") : "none (list only)"}`}
          </span>
        )}
      </div>
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
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-card">
                  <th className="px-3 py-2">Name / title</th>
                  <th className="px-3 py-2">Identifier</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="max-w-sm break-words p-3">{r.name}</td>
                    <td className="max-w-48 break-all p-3 font-mono text-xs text-primary">
                      {r.id}
                    </td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.updated}</td>
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
      <details className="rounded-lg border border-border bg-card p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          <LockKeyhole size={14} className="mr-2 inline" />
          Owner write workflow — not available (why and what is needed)
        </summary>
        <p className="mt-2 text-muted-foreground">
          {access.data?.writes ??
            "Writes are not available: the gateway is GET-only and no repository mutation contract or per-repository grant exists."}{" "}
          Enabling them needs a reviewed mutation route on the gateway, a per-repository grant, fresh
          two-step sign-in, protected-branch review, Emergency Stop checks, spending caps and
          durable audit. Nothing here changes a gate.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/activation-approvals">Approval controls</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/account-security">Two-step sign-in</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/projects">Project controls</Link>
          </Button>
        </div>
      </details>
    </section>
  );
}
