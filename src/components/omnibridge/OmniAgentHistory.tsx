import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { RefreshCw, Square } from "lucide-react";
import { readOmniAgentRuns, cancelOmniAgent } from "@/lib/omni-agent.functions";
import { isAgentTerminal } from "@/lib/omni-agent";
import { useState } from "react";

export function OmniAgentHistory({ projectId, busy }: { projectId: string; busy: boolean }) {
  const read = useServerFn(readOmniAgentRuns),
    cancel = useServerFn(cancelOmniAgent);
  const [notice, setNotice] = useState("");
  const q = useQuery({
    queryKey: ["omni-agent-runs", projectId],
    queryFn: () => read({ data: { projectId } }),
    enabled: Boolean(projectId),
    retry: false,
    refetchInterval: busy ? 2000 : false,
  });
  return (
    <section aria-label="Saved Omni agent runs" className="mt-8 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg">Saved agent runs</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh saved agent runs"
          disabled={!projectId || q.isFetching}
          onClick={async () => {
            setNotice("Reading saved agent runs…");
            const result = await q.refetch();
            setNotice(
              result.error
                ? "Saved runs could not be refreshed. Check project access and retry."
                : "Saved agent runs refreshed.",
            );
          }}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {q.error && (
        <p role="status" className="mt-3 text-xs leading-6 text-warning">
          {q.error instanceof Error ? q.error.message : "Saved runs unavailable."}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-xs text-warning">
          {notice}
        </p>
      )}
      {!q.error && !q.data?.length && (
        <p className="mt-3 text-xs text-muted-foreground">No saved runs in this project.</p>
      )}
      <ul className="mt-4 space-y-4">
        {q.data?.map((run) => (
          <li key={run.id} className="border-b border-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase text-gold-light">OMNI · {run.status}</p>
              {!isAgentTerminal(run.status) && (
                <Button
                  variant="signal"
                  size="sm"
                  onClick={async () => {
                    setNotice("");
                    try {
                      await cancel({ data: { id: run.id } });
                      const result = await q.refetch();
                      setNotice(
                        result.error
                          ? "Cancellation recorded; list refresh failed. Refresh before retrying cancellation."
                          : "Cancellation recorded and saved runs refreshed.",
                      );
                    } catch (error) {
                      setNotice(
                        error instanceof Error ? error.message : "Cancellation not confirmed.",
                      );
                    }
                  }}
                >
                  <Square size={12} />
                  Cancel saved run
                </Button>
              )}
            </div>
            <p className="mt-2 break-words text-sm">{run.message}</p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {new Date(run.created_at).toLocaleString()} · {run.model}
            </p>
            {!isAgentTerminal(run.status) && (
              <p className="mt-2 text-xs text-warning">
                Outcome pending or interrupted; no automatic restart.
              </p>
            )}
            {run.result && (
              <details className="mt-3 text-xs">
                <summary>Saved response</summary>
                <p className="mt-2 whitespace-pre-wrap break-words leading-7">{run.result}</p>
              </details>
            )}
            {run.error_message && (
              <p className="mt-2 break-words text-xs text-warning">
                {run.error_status}: {run.error_message}
              </p>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Tokens: {run.total_tokens ?? "Unknown"} · Charge: unavailable
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
