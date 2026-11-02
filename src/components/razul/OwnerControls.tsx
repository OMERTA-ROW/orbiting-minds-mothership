import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveRazulControl } from "@/lib/razul-controls.functions";
import { razulControlInput, type RazulControlInput } from "@/lib/razul-controls";
import type { EyeSnapshot } from "@/lib/razul-eye";

export function OwnerControls({
  snapshot,
  refresh,
}: {
  snapshot: EyeSnapshot;
  refresh: () => Promise<void>;
}) {
  const save = useServerFn(saveRazulControl);
  const [threshold, setThreshold] = useState(snapshot.state?.alert_threshold ?? 40);
  const [retention, setRetention] = useState(snapshot.state?.retention_days ?? 90);
  const [blocked, setBlocked] = useState(snapshot.state?.blocked_sources ?? []);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(input: RazulControlInput) {
    if (busy || !confirmed) return;
    const parsed = razulControlInput.safeParse(input);
    if (!parsed.success) {
      setNotice("Check the selected values.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await save({ data: parsed.data });
      setNotice("Setting saved; reading back owner records.");
      await refresh();
    } catch {
      setNotice("Setting was not confirmed. Check owner access and refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="razul-owner-controls" className="space-y-5">
      <h3 id="razul-owner-controls" className="text-xl">
        Owner controls
      </h3>
      <p className="text-xs text-muted-foreground">
        Saved settings affect existing permitted feeds only. No new source, crawler, agent or job is
        started. Changes are recorded as metadata, not a trusted external audit.
      </p>
      <p className="text-xs">
        <a className="text-primary underline" href="/omni-api-keys">
          Manage OMNI API credentials
        </a>{" "}
        <span className="text-muted-foreground">
          — owner-only scoped keys for the authenticated health and jobs endpoints.
        </span>
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I approve saving these exact settings to my private observatory.
      </label>
      <Button
        variant="outline"
        disabled={busy || !confirmed || !!snapshot.state?.paused_at}
        onClick={() => void submit({ action: "pause", confirm: true })}
      >
        <Pause size={14} />
        Pause existing ingestion
      </Button>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({
            action: "configure",
            confirm: true,
            threshold,
            retentionDays: retention,
            coverage: snapshot.state?.coverage ?? [],
            blockedSources: blocked,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Alert threshold
            <input
              className="exchange-select mt-2 w-full"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Public finding retention (days)
            <input
              className="exchange-select mt-2 w-full"
              type="number"
              min={7}
              max={365}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
          </label>
        </div>
        <p className="text-xs text-warning">
          Shorter retention can expire public findings on the next existing run. Coverage is
          preserved; private events and backups are not deleted here.
        </p>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm">Blocked public sources</legend>
          {snapshot.sources
            .filter((s) => s.kind !== "sentinel")
            .map((s) => (
              <label key={s.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={blocked.includes(s.id)}
                  onChange={(e) =>
                    setBlocked(
                      e.target.checked ? [...blocked, s.id] : blocked.filter((id) => id !== s.id),
                    )
                  }
                />
                {s.name}
              </label>
            ))}
        </fieldset>
        <Button type="submit" variant="outline" disabled={busy || !confirmed || !snapshot.state}>
          <Save size={14} />
          Save feed settings
        </Button>
      </form>
      <h3 className="text-lg">Established agent subscriptions</h3>
      {snapshot.feeds.map((feed) => (
        <Subscription
          key={`${feed.agent}:${feed.min_relevance}:${feed.alerts_enabled}`}
          feed={feed}
          busy={busy}
          confirmed={confirmed}
          submit={submit}
        />
      ))}
      {notice && (
        <p role="status" className="text-sm text-warning">
          {notice}
        </p>
      )}
    </section>
  );
}

function Subscription({
  feed,
  busy,
  confirmed,
  submit,
}: {
  feed: EyeSnapshot["feeds"][number];
  busy: boolean;
  confirmed: boolean;
  submit: (input: RazulControlInput) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(feed.alerts_enabled);
  const [floor, setFloor] = useState(feed.min_relevance);
  return (
    <form
      className="flex flex-wrap items-end gap-3 border-b border-border pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = razulControlInput.safeParse({
          action: "subscription",
          confirm: true,
          agent: feed.agent,
          categories: feed.categories,
          floor,
          enabled,
        });
        if (parsed.success) void submit(parsed.data);
      }}
    >
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {feed.agent} alerts
      </label>
      <label className="text-xs">
        Minimum relevance
        <input
          aria-label={`${feed.agent} minimum relevance`}
          className="exchange-select mt-1 w-24"
          type="number"
          min={0}
          max={100}
          value={floor}
          onChange={(e) => setFloor(Number(e.target.value))}
        />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={busy || !confirmed}>
        <Save size={14} />
        Save {feed.agent}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        {feed.categories.join(", ")} · subscription is not machine enrollment or delivery proof
      </p>
    </form>
  );
}
