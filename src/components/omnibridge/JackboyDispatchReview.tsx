import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  approveJackboyReceipt,
  revokeJackboyReceipt,
  sendJackboyCallback,
} from "@/lib/jackboy-dispatch.functions";

type Fields = {
  grantId: string;
  jackboyOwnerId: string;
  projectId: string;
  jobId: string;
  repo: string;
  instructions: string;
  expiresAt: string;
};
const empty: Fields = {
  grantId: "",
  jackboyOwnerId: "",
  projectId: "",
  jobId: "",
  repo: "",
  instructions: "",
  expiresAt: "",
};

export function JackboyDispatchReview() {
  const approve = useServerFn(approveJackboyReceipt);
  const revoke = useServerFn(revokeJackboyReceipt);
  const callback = useServerFn(sendJackboyCallback);
  const [fields, setFields] = useState(empty);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function update(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setConfirmed(false);
    setMessage("");
  }
  async function act(work: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      setMessage(await work());
    } catch {
      setMessage("Request not confirmed. Check the owner audit and job state before retrying.");
    } finally {
      setBusy(false);
      setConfirmed(false);
    }
  }
  const labels: [keyof Fields, string][] = [
    ["grantId", "Jackboy grant UUID"],
    ["jackboyOwnerId", "Jackboy owner UUID"],
    ["projectId", "Jackboy project UUID"],
    ["jobId", "Job UUID"],
    ["repo", "Repository (owner/name)"],
    ["expiresAt", "Grant expiry (ISO timestamp)"],
  ];

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg">Jackboy receive-only dispatch</h2>
      <p className="text-sm text-muted-foreground">
        Copy the exact reviewed scope from Jackboy. This grant permits quarantine only, not
        execution. Both services have separate grants and revocations. Owner MFA is required.
      </p>
      {labels.map(([key, label]) => (
        <label key={key} className="grid gap-1 text-sm">
          {label}
          <input
            className="rounded border bg-background p-2"
            value={fields[key]}
            onChange={(event) => update(key, event.target.value)}
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm">
        Exact reviewed instructions
        <textarea
          className="rounded border bg-background p-2"
          value={fields.instructions}
          onChange={(event) => update("instructions", event.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I reviewed these exact job details and authorize the selected receive-only action.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !confirmed}
          onClick={() =>
            void act(async () => {
              const result = await approve({ data: { ...fields, confirm: true } });
              return `Grant approved. Compare this digest with Jackboy before sending: ${result.payloadDigest}`;
            })
          }
        >
          Approve quarantine grant
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !confirmed}
          onClick={() =>
            void act(async () => {
              await revoke({ data: { grantId: fields.grantId, confirm: true } });
              return "Mothership grant revoked. Revoke the Jackboy grant separately.";
            })
          }
        >
          Revoke grant
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !confirmed}
          onClick={() =>
            void act(async () => {
              const result = await callback({ data: { jobId: fields.jobId, confirm: true } });
              return `Signed callback acknowledged: ${result.status}.`;
            })
          }
        >
          Send stored status callback
        </Button>
      </div>
      {message && (
        <p className="break-all text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
