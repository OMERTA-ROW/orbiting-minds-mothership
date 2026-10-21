import { useState } from "react";
import { Download, Mail, GitPullRequest, CalendarClock, Code2 } from "lucide-react";
import { SocialAutopilot } from "./SocialAutopilot";
import { PlatformReadiness } from "./PlatformReadiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  mailProviders,
  mailAccessPlan,
  upgradeEffects,
  upgradeReviewPlan,
  type mailPlanSchema,
} from "@/lib/omni-operations";
import type { z } from "zod";

const download = (value: unknown, name: string) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export function OmniOperations({ projects }: { projects: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<"mail" | "adaptive" | "social" | "platforms">("mail"),
    [provider, setProvider] = useState<"gmail" | "outlook">("gmail"),
    [consent, setConsent] = useState(false),
    [notice, setNotice] = useState("");
  const [operations, setOperations] = useState<z.infer<typeof mailPlanSchema>["operations"]>([
    "read",
    "search",
    "draft",
  ]);
  const act = (fn: () => void) => {
    setNotice("");
    try {
      fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Proposal invalid; no action taken.");
    }
  };
  return (
    <section aria-label="OMNI operations" className="mt-10 border-t border-gold/40 pt-6">
      <p className="eyebrow">OMNI / review-only extensions</p>
      <h2 className="mt-3 text-2xl">Existing tools. Explicit permission.</h2>
      <div className="my-5 flex flex-wrap gap-2">
        <Button variant={tab === "social" ? "signal" : "ghost"} aria-pressed={tab === "social"} onClick={() => { setTab("social"); setNotice(""); }}><CalendarClock size={16}/>Social Autopilot</Button>
        <Button variant={tab === "platforms" ? "signal" : "ghost"} aria-pressed={tab === "platforms"} onClick={() => { setTab("platforms"); setNotice(""); }}><Code2 size={16}/>Platform connectors</Button>
        <Button
          variant={tab === "mail" ? "signal" : "ghost"}
          aria-pressed={tab === "mail"}
          onClick={() => {
            setTab("mail");
            setNotice("");
          }}
        >
          <Mail size={16} />
          Communications Center
        </Button>
        <Button
          variant={tab === "adaptive" ? "signal" : "ghost"}
          aria-pressed={tab === "adaptive"}
          onClick={() => {
            setTab("adaptive");
            setNotice("");
          }}
        >
          <GitPullRequest size={16} />
          Adaptive Engine
        </Button>
      </div>
      {notice && (
        <p role="status" className="my-5 break-words text-xs text-warning">
          {notice}
        </p>
      )}
      {tab === "social" ? <SocialAutopilot projects={projects}/> : tab === "platforms" ? <PlatformReadiness projects={projects}/> : tab === "mail" ? (
        <div className="max-w-2xl space-y-5">
          <p className="font-mono text-xs text-warning">
            GMAIL + OUTLOOK · SETUP REQUIRED · NO MAILBOX CONNECTED
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            Workspace check: 21 Oct 2026. Neither provider has a configured per-user OAuth client.
            Your Google sign-in does not grant mailbox access. No email is read, stored, summarized
            or sent here.
          </p>
          <div className="flex gap-2">
            {mailProviders.map((p) => (
              <Button
                key={p}
                variant={p === provider ? "signal" : "ghost"}
                aria-pressed={p === provider}
                onClick={() => {
                  setProvider(p);
                  setConsent(false);
                }}
              >
                {p === "gmail" ? "Gmail" : "Outlook"}
              </Button>
            ))}
          </div>
          <fieldset>
            <legend className="text-xs">Proposed first access</legend>
            <div className="mt-3 flex flex-wrap gap-4">
              {(["read", "search", "summarize", "draft"] as const).map((op) => (
                <label key={op} className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={operations.includes(op)}
                    onChange={(e) => {
                      setOperations((v) =>
                        e.target.checked ? [...v, op] : v.filter((o) => o !== op),
                      );
                      setConsent(false);
                    }}
                  />
                  {op}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs leading-6 text-muted-foreground">
            Read-only API access first. Reply drafting remains review-only text; summaries require
            separate approved-model privacy consent. Email and attachments are untrusted content,
            never permission to send, reveal credentials or invoke tools.
          </p>
          <label className="flex items-start gap-3 text-xs leading-6">
            <input
              aria-label="Approve mail access plan"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I approve exporting this proposed access plan, not connecting an account or granting
            mail permissions.
          </label>
          <Button
            disabled={!consent || !operations.length}
            onClick={() =>
              act(() => {
                download(
                  mailAccessPlan({ provider, operations, consent }),
                  "omni-mail-access-plan.json",
                );
                setNotice("Access plan download requested. No connection or email action.");
              })
            }
          >
            <Download size={16} />
            Export access plan
          </Button>
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm">Account setup requirements</summary>
            <div className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
              <p>
                A workspace owner/admin must configure and link a{" "}
                {provider === "gmail" ? "Gmail" : "Microsoft Outlook"} App User Connector client
                with offline access before runtime connection work. Each user then authorizes their
                own mailbox; never a shared builder inbox.
              </p>
              <p>Provider redirect URI:</p>
              <code className="block break-all font-mono">
                https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback
              </code>
              <p>
                {provider === "gmail"
                  ? "Google OAuth needs authorized scopes and a published consent app, or an eligible Internal app. Lovable owns the callback domain; do not substitute your site or try to verify Lovable domains."
                  : "Microsoft registration must support the user's account type and correct tenant; personal Outlook accounts require personal-account eligibility."}
              </p>
              <Button asChild variant="ghost" size="sm">
                <a
                  href="https://docs.lovable.dev/integrations/app-user-connectors"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official setup guide
                </a>
              </Button>
              <p>
                Encrypted per-user credential storage, verified consent/disconnect/expiry and fresh
                owner-approved actions are required before activation. Send/forward/bulk changes and
                automatic rules remain disabled.
              </p>
            </div>
          </details>
        </div>
      ) : (
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-warning">
            PROPOSALS ONLY · NO MONITOR, CI, SIGNER OR DEPLOYER CONNECTED
          </p>
          <p className="my-4 text-xs leading-6 text-muted-foreground">
            Official change evidence is an owner declaration until independently checked. This
            export creates no branch, test run or release and grants no permissions.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act(() => {
                const plan = upgradeReviewPlan({
                  projectId: f.get("project"),
                  title: f.get("title"),
                  sourceUrl: f.get("source"),
                  baseline: f.get("baseline"),
                  proposed: f.get("proposed"),
                  rationale: f.get("rationale"),
                  effects: f.getAll("effect"),
                  tests: f.get("tests"),
                  rollback: f.get("rollback"),
                  consent: f.has("consent"),
                });
                download(plan, "evolution-upgrade-proposal.json");
                setNotice(
                  "Proposed upgrade exported. No source fetched, code changed, test run, signature or deployment.",
                );
              });
            }}
          >
            <label className="block text-xs">
              Owned project
              <select
                aria-label="Upgrade owned project"
                name="project"
                required
                className="exchange-select mt-2 w-full"
              >
                <option value="">Select your project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["title", "Upgrade title"],
              ["source", "Official changelog URL"],
              ["baseline", "Current version"],
              ["proposed", "Proposed version"],
            ].map(([name, label]) => (
              <label key={name} className="block text-xs">
                {label}
                <Input
                  name={name}
                  type={name === "source" ? "url" : "text"}
                  required
                  maxLength={name === "source" ? 500 : 100}
                  className="mt-2"
                />
              </label>
            ))}
            {[
              ["rationale", "Reason and dependencies"],
              ["tests", "Requested isolated tests"],
              ["rollback", "Canary and rollback plan"],
            ].map(([name, label]) => (
              <label key={name} className="block text-xs">
                {label}
                <Textarea
                  name={name}
                  required
                  minLength={10}
                  maxLength={name === "rollback" ? 1000 : 1500}
                  className="mt-2"
                />
              </label>
            ))}
            <fieldset>
              <legend className="text-xs">Affected areas</legend>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {upgradeEffects.map((effect) => (
                  <label key={effect} className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="effect"
                      value={effect}
                      defaultChecked={effect === "compatibility"}
                    />
                    {effect}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs leading-6 text-warning">
              Guardian and human review always precede release. New scopes, authentication, secrets,
              billing, migrations, communications and deployment require privileged human approval.
              OMNI cannot sign off its own changes.
            </p>
            <label className="flex items-start gap-3 text-xs leading-6">
              <input
                aria-label="Approve upgrade proposal export"
                name="consent"
                type="checkbox"
                required
              />
              I authorize only a non-sensitive proposal export for review; no monitoring or
              execution.
            </label>
            <Button type="submit" disabled={!projects.length}>
              <Download size={16} />
              Export proposed upgrade
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
