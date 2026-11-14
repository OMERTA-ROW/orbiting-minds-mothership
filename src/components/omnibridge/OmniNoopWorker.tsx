import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  createNoopWorker,
  enqueueNoopJob,
  listNoopJobs,
  listNoopWorkers,
  revokeNoopWorker,
} from "@/lib/omni-noop-owner.functions";

type Worker = { id: string; name: string; expires_at: string; revoked_at: string | null };
type Job = { id: string; status: string; reason: string | null };

export function OmniNoopWorker() {
  const listWorkers = useServerFn(listNoopWorkers);
  const listJobs = useServerFn(listNoopJobs);
  const create = useServerFn(createNoopWorker);
  const revoke = useServerFn(revokeNoopWorker);
  const enqueue = useServerFn(enqueueNoopJob);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [w, j] = await Promise.all([listWorkers(), listJobs()]);
    setWorkers(w);
    setJobs(j);
  }, [listWorkers, listJobs]);
  useEffect(() => {
    void refresh().catch(() => setNotice("Worker records are unavailable."));
  }, [refresh]);

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
      setNotice(success);
      try {
        await refresh();
      } catch {
        setNotice(`${success} Records could not be refreshed; do not repeat the action.`);
      }
    } catch {
      setNotice("The action was not confirmed. Check owner access and refresh before retrying.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-labelledby="noop-worker-heading">
      <h2 id="noop-worker-heading" className="text-lg">
        Isolated no-op worker
      </h2>
      <p className="text-sm text-muted-foreground">
        Synthetic timers only; no CODE, shell, files, provider calls, or production tasks. A job
        needs current owner approvals, fresh Jackboy safety and a signed permit. Each job reserves
        $1 against Jackboy&apos;s daily permit budget even though the no-op has no provider cost.
      </p>
      <label className="block text-sm" htmlFor="noop-worker-name">
        Worker identity name
      </label>
      <input
        id="noop-worker-name"
        className="w-full rounded border p-2"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        disabled={busy || !name.trim()}
        onClick={() =>
          void run(async () => {
            const result = await create({ data: { name, hours: 1, confirm: true } });
            setSecret(result.secret);
            setName("");
          }, "Worker identity created.")
        }
      >
        Create one-hour identity
      </Button>
      {secret && (
        <div className="space-y-2" aria-live="polite">
          <p>
            Shown once. Store this worker-only credential securely; it cannot access other APIs.
          </p>
          <code className="block break-all">{secret}</code>
          <Button variant="outline" onClick={() => setSecret(null)}>
            Hide credential
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {workers.map((worker) => (
          <div
            key={worker.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              {worker.name} · {worker.revoked_at ? "revoked" : `expires ${worker.expires_at}`}
            </span>
            {!worker.revoked_at && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Revoke ${worker.name} and cancel its running no-op job?`))
                    return;
                  void run(async () => {
                    await revoke({ data: { id: worker.id, confirm: true } });
                  }, "Worker revoked.");
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (
            !window.confirm(
              "Queue one 10-second synthetic no-op? It will not start until all gates pass.",
            )
          )
            return;
          void run(async () => {
            await enqueue({ data: { durationMs: 10000, confirm: true } });
          }, "No-op queued; no execution is implied.");
        }}
      >
        Queue 10-second no-op
      </Button>{" "}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => void refresh().catch(() => setNotice("Worker records are unavailable."))}
      >
        Refresh
      </Button>
      <ul className="space-y-1 text-sm">
        {jobs.map((job) => (
          <li key={job.id}>
            {job.id}: {job.status}
            {job.reason ? ` (${job.reason})` : ""}
          </li>
        ))}
      </ul>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
