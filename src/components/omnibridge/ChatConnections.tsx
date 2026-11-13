import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readWorkspace } from "@/lib/omni-workspace.functions";
import {
  CONNECTION_LABEL,
  terminalSummary,
  type ConnectionRow,
  type ConnectionState,
} from "@/lib/omni-chat";

const TONE: Record<ConnectionState, string> = {
  ready: "text-gold-light",
  blocked: "text-warning",
  not_connected: "text-muted-foreground",
  unknown: "text-warning",
  check: "text-muted-foreground",
};

const ENTRY_POINTS = [
  { label: "OMNI Terminal", detail: "Terminal chat, commands, Emergency Stop" },
  { label: "CODE queue", detail: "Held CODE generate/edit/test/debug tasks" },
  { label: "Agent memory", detail: "Owner-only notes; not read by this chat" },
  { label: "Jackboy handoff", detail: "Send a held task to Jackboy with fresh code" },
] as const;

/** Connection states read in this session, plus tool entry points. Never claims unchecked links. */
export function ChatConnections(props: { rows: ConnectionRow[]; onRefresh: () => void; refreshing: boolean }) {
  const readTerminal = useServerFn(readWorkspace);
  const [terminal, setTerminal] = useState<{ lines: string[]; at: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const rows = props.rows.map((r) =>
    r.id === "terminal" && terminal
      ? {
          ...r,
          state: (terminal.lines[0]?.endsWith("connected.") &&
          !terminal.lines[0].includes("not connected")
            ? "ready"
            : "not_connected") as ConnectionState,
          detail: `Checked ${new Date(terminal.at).toLocaleTimeString()}.`,
        }
      : r,
  );

  return (
    <section aria-label="Connections" className="text-xs leading-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg">Connections</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh connection status"
          disabled={props.refreshing}
          onClick={props.onRefresh}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-border pb-2">
            <p className="flex justify-between gap-2">
              <span>{r.label}</span>
              <span className={TONE[r.state]}>{CONNECTION_LABEL[r.state]}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">{r.detail}</p>
          </li>
        ))}
      </ul>
      <Button
        variant="signal"
        size="sm"
        className="mt-3"
        disabled={checking}
        onClick={async () => {
          setChecking(true);
          setNote("");
          try {
            const s = await readTerminal({ data: {} });
            setTerminal({ lines: terminalSummary(s).lines, at: new Date().toISOString() });
          } catch {
            setTerminal(null);
            setNote("Terminal status not read: owner sign-in with a fresh two-step code needed.");
          } finally {
            setChecking(false);
          }
        }}
      >
        {checking ? "Checking terminal…" : "Check terminal status"}
      </Button>
      {note && (
        <p role="status" className="mt-2 text-warning">
          {note}
        </p>
      )}
      {terminal && (
        <ul aria-label="Terminal status" className="mt-2 text-[11px] text-muted-foreground">
          {terminal.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <h3 className="mt-5 text-sm">Tools</h3>
      <p className="text-[10px] text-muted-foreground">
        Open in OMNI Terminal (owner, two-step code). This chat cannot run them.
      </p>
      <ul className="mt-2 space-y-1">
        {ENTRY_POINTS.map((e) => (
          <li key={e.label}>
            <Link to="/omni-terminal" className="text-gold-light underline-offset-4 hover:underline">
              {e.label}
            </Link>
            <span className="block text-[10px] text-muted-foreground">{e.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
