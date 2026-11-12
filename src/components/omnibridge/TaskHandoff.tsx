import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { refreshTaskHandoff, sendTaskToJackboy } from "@/lib/jackboy-handoff.functions";
import { STATUS_LABEL, defaultKind, type HandoffStatus } from "@/lib/jackboy-handoff";

export type HandoffRow = {
  task_id: string;
  job_kind: string;
  jackboy_job_id: string | null;
  status: string;
  updated_at: string;
};

type Task = { id: string; kind: string; agent: string; repository: string | null; state: string };

/** Owner control to hand a held Jackboy task to Jackboy as a QUEUED job. */
export function TaskHandoff(props: {
  task: Task;
  handoff: HandoffRow | undefined;
  configured: boolean;
  stopEngaged: boolean;
  onChanged: () => Promise<void>;
}) {
  const send = useServerFn(sendTaskToJackboy);
  const refresh = useServerFn(refreshTaskHandoff);
  const [kind, setKind] = useState<"test" | "build">(defaultKind(props.task.kind));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const { task, handoff } = props;
  if (task.agent !== "jackboy") return null;

  async function act(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    if (busy) return;
    setBusy(true);
    setNote("Working…");
    try {
      const r = await fn();
      setNote(r.ok ? done : (r.message ?? "Not confirmed."));
      await props.onChanged();
    } catch {
      setNote("Not confirmed. Check your sign-in and two-factor, then retry.");
    } finally {
      setBusy(false);
    }
  }

  const status = (handoff?.status ?? "not_sent") as HandoffStatus | "not_sent";
  const blocked = props.stopEngaged
    ? "Emergency Stop is engaged."
    : !props.configured
      ? "Jackboy handoff is not set up yet."
      : !task.repository
        ? "Add a repository to send this task."
        : "";

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <p className="text-xs">
        <span className="font-medium">Jackboy:</span> {STATUS_LABEL[status] ?? status}
        {handoff?.jackboy_job_id ? ` · job ${handoff.jackboy_job_id}` : ""}
        {handoff ? ` · ${new Date(handoff.updated_at).toLocaleString()}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {task.state === "held" && (!handoff || handoff.status === "error") && (
          <>
            <select
              aria-label="Job type"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={handoff ? handoff.job_kind : kind}
              disabled={busy || Boolean(handoff)}
              onChange={(e) => setKind(e.target.value as "test" | "build")}
            >
              <option value="test">Test</option>
              <option value="build">Build</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || Boolean(blocked)}
              onClick={() =>
                act(
                  () =>
                    send({
                      data: { taskId: task.id, kind: (handoff?.job_kind as "test" | "build") ?? kind },
                    }),
                  "Sent. Approve it with your passkey in Jackboy.",
                )
              }
            >
              Send to Jackboy
            </Button>
          </>
        )}
        {handoff && handoff.status !== "error" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || props.stopEngaged || !props.configured}
            onClick={() => act(() => refresh({ data: { taskId: task.id } }), "Status updated.")}
          >
            Refresh status
          </Button>
        )}
      </div>
      {(note || blocked) && (
        <p role="status" className="text-xs text-muted-foreground">
          {note || blocked}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Needs your authenticator within 15 minutes. Jackboy queues it and still asks for your passkey.
        Mothership never runs it.
      </p>
    </div>
  );
}
