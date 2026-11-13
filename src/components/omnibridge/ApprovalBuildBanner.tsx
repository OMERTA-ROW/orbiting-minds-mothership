import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApprovalFlowBuild } from "@/lib/approval-flow-build.functions";
import {
  APPROVAL_FLOW_SUMMARY,
  APPROVAL_FLOW_VERSION,
  buildNotice,
  siteKind,
  type LiveFlow,
  type SiteKind,
} from "@/lib/approval-flow-build";

const SITE_BADGE: Record<SiteKind, string> = {
  live: "LIVE",
  preview: "PREVIEW",
  local: "LOCAL",
  other: "UNKNOWN SITE",
};

/** Says which build this page is and warns when the live page runs an older approval flow. */
export function ApprovalBuildBanner() {
  const read = useServerFn(getApprovalFlowBuild);
  // Read after hydration: the address is only known in the browser.
  const [site, setSite] = useState<SiteKind | null>(null);
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [live, setLive] = useState<LiveFlow | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const r = await read();
      setServerVersion(r.serverVersion);
      setLive(r.live);
    } catch {
      setLive({ state: "unreachable", version: null });
    } finally {
      setChecking(false);
    }
  }, [read]);

  useEffect(() => {
    setSite(siteKind(window.location.hostname));
    void check();
  }, [check]);

  if (!site) return null;
  const notice = buildNotice({ site, serverVersion, live });
  const Icon = notice.tone === "warn" ? AlertTriangle : notice.tone === "ok" ? CheckCircle2 : Info;
  const tone =
    notice.tone === "warn"
      ? "border-warning/70"
      : notice.tone === "ok"
        ? "border-success/50"
        : "border-border";

  return (
    <section
      aria-labelledby="build-label-title"
      data-site={site}
      className={`space-y-2 rounded-lg border bg-card p-3 text-sm ${tone}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 font-mono text-xs tracking-wider ${site === "live" ? "border-success/60 text-success" : "border-warning/60 text-warning"}`}
        >
          {SITE_BADGE[site]}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          Approval flow v{APPROVAL_FLOW_VERSION}
        </span>
        {site !== "live" && live && (
          <span className="font-mono text-xs text-muted-foreground">
            · Live:{" "}
            {live.state === "unreachable"
              ? "not checked"
              : live.version === null
                ? "earlier flow (no version)"
                : `v${live.version}`}
          </span>
        )}
      </div>
      <h2 id="build-label-title" className="flex items-center gap-2 font-medium">
        <Icon size={16} aria-hidden className={notice.tone === "warn" ? "text-warning" : undefined} />
        {notice.title}
      </h2>
      <p role={notice.tone === "warn" ? "alert" : undefined} className="text-muted-foreground">
        {notice.detail}
      </p>
      <p className="text-xs text-muted-foreground">This flow: {APPROVAL_FLOW_SUMMARY}.</p>
      <div className="flex flex-wrap gap-2">
        {notice.title === "This page is out of date" ||
        notice.title === "Live page does not match its own server" ? (
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={checking} onClick={() => void check()}>
          <RefreshCw size={14} aria-hidden className={checking ? "animate-spin motion-reduce:animate-none" : undefined} />
          {checking ? "Checking live site…" : "Check live site again"}
        </Button>
      </div>
    </section>
  );
}
