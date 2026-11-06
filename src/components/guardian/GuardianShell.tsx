import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { OctagonPause, ShieldAlert, Download } from "lucide-react";
import { PageHeader, Section, DemoBadge } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { useGuardian } from "@/hooks/use-guardian";
import { useCare } from "@/hooks/use-care";
import { guardianAudit, type GuardianCommand } from "@/lib/guardian";
import { downloadJson } from "@/lib/genesis-sdk";
export function useGuardianAction() {
  const { dispatch } = useGuardian();
  const [message, setMessage] = useState("");
  return {
    message,
    setMessage,
    run: (c: GuardianCommand) => {
      try {
        dispatch(c);
        setMessage("Recorded in this browser’s DEMO history. No external action.");
        return true;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Demo action unavailable");
        return false;
      }
    },
  };
}
export function GuardianNotice({ message }: { message: string }) {
  return message ? (
    <p role="status" className="my-5 break-words text-sm leading-loose text-warning">
      {message}
    </p>
  ) : null;
}
export function GuardianShell({ title, children }: { title: string; children: ReactNode }) {
  const { store, ready, issue, dispatch } = useGuardian();
  const care = useCare();
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="mx-auto max-w-[1440px] px-6 pt-8 md:px-12">
        <DemoBadge label="DEMO · 0 LIVE ENDPOINTS · LAUNCH BLOCKED" />
      </div>
      <PageHeader title={title} eyebrow="Guardian / Owner-controlled command">
        Defense begins with consent. Evidence before confidence. No hidden control.
      </PageHeader>
      <Section>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
          <nav aria-label="Guardian sections" className="flex flex-wrap gap-2">
            {[
              { to: "/guardian", label: "Security Center" },
              { to: "/devices", label: "My Devices" },
              { to: "/fleet", label: "Fleet Control" },
              { to: "/security-report", label: "Daily Reports" },
              { to: "/care", label: "CARE" },
              { to: "/updates", label: "Updates" },
            ].map((l) => (
              <Button
                key={l.to}
                asChild
                variant="ghost"
                className="h-auto min-h-11 whitespace-normal text-xs"
              >
                <Link
                  to={l.to}
                  activeOptions={{ exact: true }}
                  activeProps={{ className: "bg-accent/30 text-gold-light" }}
                >
                  {l.label}
                </Link>
              </Button>
            ))}
          </nav>
          <Button
            variant="signal"
            disabled={!ready || !care.ready}
            className="h-auto min-h-11 whitespace-normal text-warning"
            onClick={() => {
              const failures: string[] = [];
              try {
                dispatch({ type: "pause" });
              } catch {
                failures.push("Fleet pause not recorded");
              }
              try {
                care.dispatch({ type: "pause" });
              } catch {
                failures.push("CARE pause not recorded");
              }
              setMessage(
                failures.length
                  ? `${failures.join("; ")}. No live endpoint contacted.`
                  : "Local fleet plans/scopes and CARE Updates/Pilot/Voice paused. 0 live endpoint acknowledgments; re-pair and re-approve to resume.",
              );
            }}
          >
            <OctagonPause size={16} />
            Emergency demo pause
          </Button>
        </div>
        <div className="mb-10 border-l-2 border-warning pl-5">
          <p className="flex items-start gap-3 text-sm leading-loose text-warning">
            <ShieldAlert size={18} className="mt-1 shrink-0" />
            Publication blocked: authentication, tenant isolation, signed agents, monitoring and
            recovery remain unverified.
          </p>
          <p className="mt-3 text-xs leading-loose text-muted-foreground">
            Fictional device cards and incident exercises. Local pairing codes and preferences grant
            no OS or account access. No scans, terminal, threat detection, device enrollment,
            telemetry, remote control or signed updates. Records stay in this browser, are editable
            and unverified; do not enter real secrets or personal data.
          </p>
        </div>
        <GuardianNotice message={issue} />
        <GuardianNotice message={message} />
        {store.paused && (
          <p className="mb-8 border border-warning/40 p-4 font-mono text-xs text-warning">
            LOCAL REHEARSAL PAUSED · no remote stop confirmation
          </p>
        )}
        {ready ? children : <p role="status">Loading local demo records…</p>}
      </Section>
    </>
  );
}
export function GuardianHistory() {
  const { store } = useGuardian();
  const [message, setMessage] = useState("");
  return (
    <section className="mt-14 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="text-2xl">Owner-visible demo history</h2>
          <p className="mt-3 text-xs text-muted-foreground">
            Your recorded browser actions only · unsigned, unauthenticated, not tamper-evident.
          </p>
        </div>
        <Button
          variant="signal"
          disabled={!store.audit.length}
          onClick={() => {
            try {
              downloadJson("DEMO-guardian-audit.json", guardianAudit(store));
              setMessage("Unsigned local audit downloaded; no executed actions.");
            } catch {
              setMessage("Download unavailable.");
            }
          }}
        >
          <Download size={14} />
          Export local audit
        </Button>
      </div>
      <GuardianNotice message={message} />
      <ol className="mt-6 border-l border-gold/30 pl-5">
        {[...store.audit]
          .reverse()
          .slice(0, 20)
          .map((e) => (
            <li key={e.id} className="border-b border-border py-4">
              <p className="text-sm">{e.action}</p>
              <p className="mt-2 break-words font-mono text-[10px] text-muted-foreground">
                {e.at} · {e.target} · DEMO RECORD ONLY
              </p>
            </li>
          ))}
      </ol>
      {!store.audit.length && (
        <p className="mt-5 text-sm text-muted-foreground">No local Guardian actions yet.</p>
      )}
    </section>
  );
}
