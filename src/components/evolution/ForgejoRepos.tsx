import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readForgejoRepos } from "@/lib/forgejo.functions";
import { FORGEJO_READ_SCOPES } from "@/lib/forgejo";
import { Button } from "@/components/ui/button";

const when = (v: string | null) => (v ? new Date(v).toLocaleString() : "Not reported");

export function ForgejoRepos() {
  const read = useServerFn(readForgejoRepos);
  const q = useQuery({ queryKey: ["forgejo-repos"], queryFn: () => read(), retry: false });
  const r = q.data;
  return (
    <section className="mx-auto my-8 max-w-5xl rounded-xl border border-border bg-card/80 p-5 text-card-foreground backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Evolution Git (read-only)</h2>
          <p className="text-sm text-muted-foreground">
            Your own Forgejo copies. GitHub OMERTA-ROW stays the main source; nothing here can
            change a repository.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => q.refetch()}>
          {q.isFetching ? "Checking…" : "Refresh"}
        </Button>
      </div>
      <div className="mt-4 text-sm">
        {q.isError && <p className="text-destructive">Could not reach the server. Try Refresh.</p>}
        {r?.state === "denied" && <p>Owner sign-in with two-step verification is required.</p>}
        {r?.state === "not_configured" && (
          <p>
            Not connected. Missing settings: {r.missing.join(", ")}. Add them in Project Settings →
            Secrets after the private gateway is set up.
          </p>
        )}
        {r?.state === "invalid_origin" && (
          <p>
            Not connected. FORGEJO_BASE_URL must be exactly https://git-api.evoomni.tech with no
            extra path, port, query or credentials.
          </p>
        )}
        {r?.state === "unreachable" && (
          <p className="text-destructive">Not connected: {r.message}</p>
        )}
        {r?.state === "connected" && (
          <>
            <p className="mb-3 text-muted-foreground">
              {r.repos.length} repositories · checked {when(r.checkedAt)}
              {r.truncated && " · list cut at 1,000"}
            </p>
            {r.repos.length === 0 ? (
              <p>The gateway answered, but this token sees no repositories.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Name</th>
                      <th className="pr-3">Privacy</th>
                      <th className="pr-3">Branch</th>
                      <th className="pr-3">Sync</th>
                      <th>Last update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.repos.map((x) => (
                      <tr key={x.id} className="border-t border-border">
                        <td className="py-1 pr-3 font-medium">
                          {x.name}
                          {x.empty && " (empty)"}
                        </td>
                        <td className="pr-3">{x.private ? "Private" : "Public"}</td>
                        <td className="pr-3">{x.branch || "—"}</td>
                        <td className="pr-3">
                          {x.sync.kind === "mirror"
                            ? `Mirror · ${when(x.sync.at)}`
                            : "Sync not reported"}
                        </td>
                        <td>{when(x.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Agent read access: {FORGEJO_READ_SCOPES.map((s) => `${s.agent} not granted`).join(" · ")}.
      </p>
    </section>
  );
}
