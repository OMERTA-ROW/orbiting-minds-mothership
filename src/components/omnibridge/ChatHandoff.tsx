import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { RefreshCw, Square, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelTerminalTask,
  queueTerminalTask,
  readOmniTerminal,
} from "@/lib/omni-terminal.functions";
import {
  AGENT_LABEL,
  KIND_LABEL,
  TASK_AGENTS,
  TASK_KINDS,
  taskInput,
  type TaskAgent,
  type TaskKind,
} from "@/lib/omni-terminal";
import {
  handoffAgent,
  handoffDraft,
  heldTaskTitle,
  taskStateLabel,
  type HeldTask,
} from "@/lib/omni-chat";

const OWNER_NEEDED =
  "Owner terminal access was not confirmed. Sign in as the owner with a fresh two-step code, then retry. Nothing was saved.";

type Access = { state: "checking" } | { state: "ok"; stopEngaged: boolean } | { state: "denied" };

/**
 * Approval dialog that saves a chat reply as a HELD task in the OMNI Terminal
 * queue. Held tasks never run; the owner reviews them in OMNI Terminal.
 */
export function ChatHandoffDialog(props: {
  source: { request: string; reply: string } | null;
  projectName: string;
  onClose: () => void;
  onQueued: (task: HeldTask) => void;
}) {
  const read = useServerFn(readOmniTerminal),
    queue = useServerFn(queueTerminalTask);
  const [kind, setKind] = useState<TaskKind>("agent.handoff");
  const [agent, setAgent] = useState<TaskAgent>("jackboy");
  const [project, setProject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [approved, setApproved] = useState(false);
  const [access, setAccess] = useState<Access>({ state: "checking" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const open = !!props.source;

  useEffect(() => {
    if (!props.source) return;
    const draft = handoffDraft({ projectName: props.projectName, ...props.source });
    setProject(draft.project);
    setInstructions(draft.instructions);
    setKind("agent.handoff");
    setAgent("jackboy");
    setApproved(false);
    setNote("");
    setAccess({ state: "checking" });
    let live = true;
    read()
      .then((s) => live && setAccess({ state: "ok", stopEngaged: s.emergencyStop.engaged }))
      .catch(() => live && setAccess({ state: "denied" }));
    return () => {
      live = false;
    };
    // Re-run only when a new reply is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.source]);

  const target = handoffAgent(kind, agent);
  const parsed = taskInput.safeParse({
    id: "00000000-0000-4000-8000-000000000000",
    kind,
    agent: target,
    project,
    instructions,
  });
  const canSave = access.state === "ok" && approved && parsed.success && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setNote("Saving held task…");
    const id = crypto.randomUUID();
    try {
      const r = await queue({ data: { id, kind, agent: target, project, instructions } });
      if (!r.ok) {
        setNote(r.message);
        return;
      }
      props.onQueued({
        id,
        kind,
        agent: target,
        state: "held",
        checkedAt: new Date().toISOString(),
        note: "",
      });
      props.onClose();
    } catch {
      setNote(OWNER_NEEDED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hand off as a held task</DialogTitle>
          <DialogDescription>
            Saves this to the OMNI Terminal queue as held. Nothing runs, nothing is sent to{" "}
            {AGENT_LABEL[target]}, and no money is spent. You review held tasks in OMNI Terminal.
          </DialogDescription>
        </DialogHeader>
        <p role="status" className="text-xs leading-6">
          {access.state === "checking"
            ? "Checking owner terminal access…"
            : access.state === "denied"
              ? OWNER_NEEDED
              : access.stopEngaged
                ? "Owner access confirmed. Emergency Stop is engaged: the task stays held and cannot be sent anywhere."
                : "Owner access confirmed. Emergency Stop is released; the task still only waits."}
        </p>
        <div className="grid gap-3 text-xs">
          <label className="block">
            Task type
            <select
              className="exchange-select mt-1 w-full"
              value={kind}
              onChange={(e) => setKind(e.target.value as TaskKind)}
              disabled={busy}
            >
              {TASK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Agent
            <select
              className="exchange-select mt-1 w-full"
              value={target}
              onChange={(e) => setAgent(e.target.value as TaskAgent)}
              disabled={busy || kind !== "agent.handoff"}
            >
              {TASK_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {AGENT_LABEL[a]}
                </option>
              ))}
            </select>
            {kind !== "agent.handoff" && (
              <span className="mt-1 block text-muted-foreground">CODE tasks go to Jackboy.</span>
            )}
          </label>
          <label className="block">
            Project label
            <input
              className="exchange-select mt-1 w-full"
              value={project}
              maxLength={120}
              onChange={(e) => setProject(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            Instructions (edit before saving)
            <textarea
              className="exchange-select mt-1 min-h-32 w-full"
              value={instructions}
              maxLength={4000}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={busy}
            />
          </label>
          {!parsed.success && <p className="text-warning">{parsed.error.issues[0]?.message}</p>}
          <label className="flex items-start gap-2 leading-6">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              disabled={busy || access.state !== "ok"}
            />
            I approve saving this as a held task. I understand it does not run and is recorded in
            the terminal audit.
          </label>
        </div>
        {note && (
          <p role="status" className="text-xs text-warning">
            {note}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="cosmic" onClick={() => void save()} disabled={!canSave}>
            <Send size={14} />
            Save held task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** In-chat status card for a held task, read back from OMNI Terminal on request. */
export function HeldTaskCard(props: { task: HeldTask; onChange: (t: HeldTask) => void }) {
  const read = useServerFn(readOmniTerminal),
    cancel = useServerFn(cancelTerminalTask);
  const [busy, setBusy] = useState(false);
  const { task } = props;

  async function refresh(note = "") {
    try {
      const s = await read();
      const row = s.tasks.find((t) => t.id === task.id);
      props.onChange({
        ...task,
        state: row?.state ?? "not found",
        checkedAt: new Date().toISOString(),
        note: note || (row ? "" : "Not in the terminal's recent task list."),
      });
    } catch {
      props.onChange({ ...task, note: "Status not read: owner two-step sign-in needed." });
    }
  }

  return (
    <div className="border border-border p-3 text-xs leading-6" aria-label="Held task status">
      <p className="text-[10px] uppercase text-gold-light">TASK HANDOFF · {heldTaskTitle(task)}</p>
      <p className="mt-1">{taskStateLabel(task.state)}</p>
      <p className="text-[10px] text-muted-foreground break-all">
        Task {task.id}
        {task.checkedAt ? ` · checked ${new Date(task.checkedAt).toLocaleTimeString()}` : ""}
      </p>
      {task.note && <p className="text-warning">{task.note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="signal"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await refresh();
            setBusy(false);
          }}
        >
          <RefreshCw size={12} />
          Refresh status
        </Button>
        {task.state === "held" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Cancel this held task? It stays in the audit trail.")) return;
              setBusy(true);
              try {
                const r = await cancel({ data: { id: task.id } });
                await refresh(r.ok ? "Cancellation recorded." : r.message);
              } catch {
                props.onChange({ ...task, note: "Not cancelled: owner two-step sign-in needed." });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Square size={12} />
            Cancel task
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to="/omni-terminal">Open OMNI Terminal</Link>
        </Button>
      </div>
    </div>
  );
}
