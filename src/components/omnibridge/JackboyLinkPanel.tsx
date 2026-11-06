import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { requestJackboyLink } from "@/lib/jackboy-link.functions";

type Action = "handshake" | "submit" | "run" | "status" | "cancel";

export function JackboyLinkPanel() {
  const request = useServerFn(requestJackboyLink);
  const [projectId, setProjectId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [jobId, setJobId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function act(action: Action) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request({
        data: {
          action,
          projectId,
          approvalId,
          ...(action === "handshake" ? {} : { jobId }),
          ...((action === "submit" || action === "run") && confirmed
            ? { confirm: true as const }
            : {}),
        },
      });
      setMessage(
        "state" in result ? "Authenticated for this request only." : `Job: ${result.status}.`,
      );
    } catch {
      setMessage(
        "Request not confirmed. If it may have reached Jackboy, check status using the same job ID before retrying.",
      );
    } finally {
      setBusy(false);
      setConfirmed(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-labelledby="jackboy-link-title">
      <h2 id="jackboy-link-title" className="text-lg">
        Jackboy scoped protocol link
      </h2>
      <p className="text-sm text-muted-foreground">
        Disabled unless separately configured. Only an explicitly approved fixed protocol self-test
        is supported; this does not enable CODE, repository writes or deployment.
      </p>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Jackboy project UUID
          <input
            className="rounded border bg-background p-2"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Approved grant UUID
          <input
            className="rounded border bg-background p-2"
            value={approvalId}
            onChange={(e) => setApprovalId(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Job UUID (not needed for handshake)
          <input
            className="rounded border bg-background p-2"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I approve this fixed protocol self-test operation.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void act("handshake")}
        >
          Handshake
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !confirmed}
          onClick={() => void act("submit")}
        >
          Queue self-test
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !confirmed}
          onClick={() => void act("run")}
        >
          Run self-test
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void act("status")}>
          Check status
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void act("cancel")}>
          Cancel
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
