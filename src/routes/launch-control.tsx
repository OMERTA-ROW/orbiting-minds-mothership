import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ShieldAlert, ArrowUpRight } from "lucide-react";
import { launchEvidence, canLaunch, type GateStatus } from "@/data/launch-evidence";
import { seo } from "@/lib/seo";
import { SeoStatusPanel } from "@/components/SeoStatusPanel";
export const Route = createFileRoute("/launch-control")({
  head: () =>
    seo(
      "Launch Control · Limited beta evidence",
      "Evidence-based Evolution limited beta readiness. Verified, failed, unverified and unimplemented account, AI, connector and security capabilities. Launch stays blocked pending founder approval.",
    ),
  component: LaunchControl,
});
function LaunchControl() {
  const [filter, setFilter] = useState<GateStatus | "ALL">("ALL");
  const ready = canLaunch(launchEvidence),
    blockers = launchEvidence.filter((g) => g.gating && g.status !== "PASS");
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap justify-between gap-6 border-b border-border pb-7">
        <div>
          <p className="eyebrow">Evolution / scope locked</p>
          <h1 className="mt-4 text-3xl md:text-4xl">Launch Control</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            A limited beta, not a collection of promises. Dated evidence below is a QA record, not
            continuous monitoring. No new studios, device capabilities or public deployment.
          </p>
        </div>
        <Button
          variant="signal"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      checkedAt: "2026-10-22",
                      launchApproved: false,
                      launchReady: ready,
                      gates: launchEvidence,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "evolution-launch-evidence.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={15} />
          Export evidence
        </Button>
      </header>
      <div className="my-6 flex flex-wrap items-center justify-between gap-4 border-y border-warning/40 py-5">
        <div className="flex items-center gap-3 text-warning">
          <ShieldAlert size={22} />
          <p className="font-mono text-sm">
            {ready ? "GATES RECORDED PASS — OWNER REVIEW REQUIRED" : "LAUNCH BLOCKED"}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {blockers.length} blocking gates without PASS · checked 22 Oct 2026
        </span>
      </div>
      <nav className="mb-7 flex flex-wrap gap-2" aria-label="Beta workflows">
        <Button asChild variant="cosmic">
          <Link to="/beta">
            Private projects
            <ArrowUpRight size={14} />
          </Link>
        </Button>
        <Button asChild variant="signal">
          <Link to="/beta-omni">
            Authorized OMNI
            <ArrowUpRight size={14} />
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in / create account</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/omni" search={{ world: "nexus-nebula" }}>
            Local OMNI demo
          </Link>
        </Button>
      </nav>
      <label className="mb-6 block text-xs">
        Evidence status
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="exchange-select ml-3"
        >
          <option value="ALL">All capabilities</option>
          {["PASS", "FAIL", "UNVERIFIED", "NOT IMPLEMENTED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-0">
        {launchEvidence
          .filter((g) => filter === "ALL" || g.status === filter)
          .map((g) => (
            <article
              key={g.id}
              className="grid gap-4 border-t border-border py-6 md:grid-cols-[190px_minmax(0,1fr)]"
            >
              <div>
                <span
                  className={`font-mono text-[11px] ${g.status === "PASS" ? "text-success" : g.status === "FAIL" ? "text-destructive" : "text-warning"}`}
                >
                  {g.status}
                </span>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {g.gating ? "LAUNCH GATE" : "OUTSIDE WEB BETA"}
                  {g.demoOnly ? " · DEMO ONLY" : ""}
                </p>
                <p className="mt-3 text-[10px] text-muted-foreground">Owner: {g.owner}</p>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg">{g.capability}</h2>
                <p className="mt-3 break-words text-xs leading-7 text-muted-foreground">
                  {g.evidence}
                </p>
                <p className="mt-3 break-words text-xs leading-7">
                  <span className="text-gold-light">Next test / dependency: </span>
                  {g.next}
                </p>
              </div>
            </article>
          ))}
      </div>
      <section className="mt-7 border-t border-border pt-7">
        <h2 className="text-xl">Dependency order</h2>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-xs leading-7 text-muted-foreground">
          <li>
            Complete account/isolation/AI QA. Human profile fields are optional; no profile decision
            blocks the existing private records.
          </li>
          <li>
            Founder selects GitHub repository and permitted read/write scope. No branch or proposed
            PR can be verified before this.
          </li>
          <li>
            Approve rate/spend protection design, prove limits, privacy/session gates, restore and
            incident procedures.
          </li>
          <li>
            Owner tests email delivery and OAuth, reviews mobile/accessibility,
            privacy/terms/support details, and approves invite-only release.
          </li>
        </ol>
        <p className="mt-5 text-xs leading-7 text-warning">
          Timing: credential/approval-dependent, not a launch ETA. GitHub needs connection +
          selection; signed CLI needs repository + signing + native QA and is excluded from this
          beta. No invented download or install commands.
        </p>
        <a
          className="mt-5 inline-flex break-all text-xs text-gold-light underline"
          href="https://lovable.dev/connectors/github/connect?workspace=qTqTdBvij3LL2HnYLgG8"
          target="_blank"
          rel="noreferrer"
        >
          Create authorized GitHub connection
        </a>
      </section>
      <SeoStatusPanel />
    </section>
  );
}
