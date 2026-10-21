import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Copy, Terminal, Shield, LockKeyhole, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge, CoreGeometry } from "@/components/evo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cliCommands } from "@/data/evolution";
import { commandConflictPlan, cliPlatformChecks, type CliPlatform } from "@/lib/cli-reference";
import { CompatibilityValue } from "./CompatibilityValue";

export function Companion() {
  const [platform, setPlatform] = useState<CliPlatform>("macOS"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState("evolution help"),
    [copied, setCopied] = useState(""),
    [notice, setNotice] = useState(""),
    [evolutionOwned, setEvolutionOwned] = useState(false),
    [omniOwned, setOmniOwned] = useState(false);
  const command = cliCommands.find((c) => c.cmd === selected) ?? cliCommands[0];
  const conflict = commandConflictPlan(evolutionOwned, omniOwned);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setNotice("Reference copied; no command executed.");
    } catch {
      setNotice("Clipboard unavailable. Select the reference text to copy it.");
    }
  };
  return (
    <main className="mx-auto max-w-[1600px] px-5 pb-20 pt-9 md:px-10">
      <header className="relative overflow-hidden border-b border-gold/30 pb-10">
        <CoreGeometry className="pointer-events-none absolute -right-20 -top-24 w-[430px] opacity-20" />
        <div className="relative max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">Platform / lightweight companion</span>
            <DemoBadge label="PLANNED DISTRIBUTION · NO DOWNLOAD" />
          </div>
          <h1 className="mt-6 text-4xl leading-tight md:text-5xl">EVOLUTION CLI</h1>
          <p className="mt-5 text-lg">Your terminal. Your tools. One optional companion.</p>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
            Use the terminals and agent toolchains you already have. No replacement terminal,
            replacement IDE, mandatory download or automatic changes to other tools. Basic access
            has no required recurring subscription; external API fees may apply.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="cosmic">
              <Link to="/omni" search={{ world: "nexus-nebula" }}>
                Try OMNI in your browser
                <ArrowUpRight size={15} />
              </Link>
            </Button>
            <Button asChild variant="signal">
              <Link to="/command-nexus">
                Open Command Nexus
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs leading-6 text-warning">
            Browser OMNI is a local DEMO template, not connected AI. Nothing is installed.
          </p>
        </div>
      </header>
      <div className="my-7 grid gap-6 border-b border-border pb-7 md:grid-cols-3">
        {[
          { icon: Terminal, title: "evolution", body: "All-platform command family" },
          { icon: GitBranch, title: "omni", body: "Direct OMNI · future approved AI" },
          { icon: Shield, title: "evolution omni", body: "Fallback when omni already exists" },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex min-w-0 items-start gap-4">
            <Icon className="mt-1 shrink-0 text-gold" size={21} />
            <div>
              <h2 className="break-words font-mono text-lg text-gold-light">{title}</h2>
              <p className="mt-2 text-xs text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>
      {notice && (
        <p
          role="status"
          className="mb-5 border-l border-gold pl-4 text-xs leading-6 text-gold-light"
        >
          {notice}
        </p>
      )}
      <Tabs defaultValue="onboarding">
        <TabsList
          aria-label="CLI sections"
          className="flex h-auto flex-wrap justify-start gap-2 bg-transparent"
        >
          {[
            { id: "onboarding", label: "Install & onboarding" },
            { id: "commands", label: "Command reference" },
            { id: "value", label: "Access & measured value" },
            { id: "architecture", label: "Architecture & release gates" },
          ].map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="min-h-11 whitespace-normal">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="onboarding" className="pt-8">
          <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section>
              <p className="eyebrow">Optional / existing-terminal only</p>
              <h2 className="mt-4 text-3xl">Start in the browser. Install later.</h2>
              <div
                role="group"
                aria-label="CLI operating system"
                className="mt-6 flex flex-wrap gap-2"
              >
                {(["macOS", "Linux", "Windows"] as const).map((p) => (
                  <Button
                    key={p}
                    variant={platform === p ? "signal" : "ghost"}
                    aria-pressed={platform === p}
                    onClick={() => {
                      setPlatform(p);
                      setCopied("");
                    }}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <ol className="mt-6 divide-y divide-border">
                {[
                  {
                    title: "01 / Choose the source",
                    body: "Owner selects or creates the Evolution repository in Project settings → Git. No repository URL or CI distribution is confirmed. Source scaffolding is included in this project.",
                  },
                  {
                    title: "02 / Verify the release",
                    body:
                      platform === "macOS"
                        ? "Future Developer ID signing, notarization, provenance and digest verification. No notarized package exists."
                        : platform === "Windows"
                          ? "Future Authenticode signature, provenance and digest verification. No signed Windows package exists."
                          : "Future signed archive, pinned publisher trust, provenance and digest verification. No signed Linux package exists.",
                  },
                  {
                    title: "03 / Choose a dedicated location",
                    body: "Inspect both command names first. A future installer needs explicit directory/alias consent. No automatic PATH or shell startup edits; no elevated privileges or other-tool changes.",
                  },
                  {
                    title: "04 / Grant only what you need",
                    body: "Local source help, version and doctor need no account. Login, GitHub, OMNI and updates stay blocked. Future keys belong in an OS vault with scoped consent, not flags, logs or browser storage.",
                  },
                  {
                    title: "05 / Remove only owned copies",
                    body: "Linux source tests cover consent and unchanged-directory checks. Native macOS/Windows uninstall and permissions remain unverified. Extra files, modified binaries and symlinks block removal; no recursive cleanup.",
                  },
                ].map((s) => (
                  <li key={s.title} className="py-5">
                    <h3 className="font-sans text-sm text-gold-light">{s.title}</h3>
                    <p className="mt-3 text-xs leading-7 text-muted-foreground">{s.body}</p>
                  </li>
                ))}
              </ol>
            </section>
            <aside className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
              <p className="font-mono text-[10px] text-warning">
                NO PUBLISHED PACKAGE · {platform.toUpperCase()}
              </p>
              <h3 className="mt-4 text-2xl">Check the names first.</h3>
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                Read-only shell reference. The browser cannot perform this check; aliases and
                functions need shell-level inspection.
              </p>
              <pre className="mt-5 overflow-auto whitespace-pre-wrap break-words border-y border-border bg-card/25 p-4 font-mono text-xs leading-7">
                {cliPlatformChecks[platform]}
              </pre>
              <Button
                variant="ghost"
                className="mt-3"
                size="sm"
                onClick={() => copy(cliPlatformChecks[platform])}
              >
                {copied === cliPlatformChecks[platform] ? <Check size={14} /> : <Copy size={14} />}
                Copy name checks
              </Button>
              <fieldset className="mt-6 space-y-4 border-t border-border pt-5">
                <legend className="text-xs text-gold-light">
                  Collision rehearsal · your declarations only
                </legend>
                <label className="flex gap-3 text-xs leading-6">
                  <input
                    type="checkbox"
                    checked={evolutionOwned}
                    onChange={(e) => setEvolutionOwned(e.target.checked)}
                  />
                  evolution already belongs to another tool
                </label>
                <label className="flex gap-3 text-xs leading-6">
                  <input
                    type="checkbox"
                    checked={omniOwned}
                    onChange={(e) => setOmniOwned(e.target.checked)}
                  />
                  omni already belongs to another tool
                </label>
              </fieldset>
              <p
                aria-label="Command collision decision"
                className="mt-5 break-words border-l border-warning pl-4 font-mono text-xs leading-7 text-warning"
              >
                {conflict.command}
              </p>
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                Never overwrite either command. The source installer refuses existing PATH names. No
                aliases, keys, startup files or agent tools are changed.
              </p>
              <div className="mt-7 border-t border-border pt-5">
                <Button disabled variant="outline" className="h-auto w-full whitespace-normal py-3">
                  <LockKeyhole size={15} />
                  Signed download · not available
                </Button>
                <p className="mt-4 text-xs leading-7 text-muted-foreground">
                  Homebrew, npm and winget identities: not registered or verified. No install URL or
                  package command is offered.
                </p>
              </div>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="commands" className="pt-8">
          <div className="grid min-w-0 gap-8 lg:grid-cols-[330px_minmax(0,1fr)]">
            <section>
              <label className="text-xs text-muted-foreground">
                Find a command
                <input
                  aria-label="Find CLI command"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="exchange-select mt-3 w-full"
                  placeholder="doctor, login, omni…"
                />
              </label>
              <ul aria-label="CLI command references" className="mt-5 space-y-2">
                {cliCommands
                  .filter((c) => `${c.cmd} ${c.desc}`.toLowerCase().includes(query.toLowerCase()))
                  .map((c) => (
                    <li key={c.cmd}>
                      <Button
                        variant={command.cmd === c.cmd ? "signal" : "ghost"}
                        className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left"
                        onClick={() => {
                          setSelected(c.cmd);
                          setCopied("");
                        }}
                      >
                        <span className="min-w-0">
                          <code className="block break-words text-xs">{c.cmd}</code>
                          <span className="mt-2 block text-[10px] text-muted-foreground">
                            PLANNED · {c.desc}
                          </span>
                        </span>
                      </Button>
                    </li>
                  ))}
              </ul>
              {!cliCommands.some((c) =>
                `${c.cmd} ${c.desc}`.toLowerCase().includes(query.toLowerCase()),
              ) && <p className="mt-5 text-xs text-muted-foreground">No matching command.</p>}
            </section>
            <section className="min-w-0 border-y border-border py-6">
              <DemoBadge label="PLANNED PUBLIC COMMAND · REFERENCE ONLY" />
              <h2 className="mt-5 break-words font-mono text-xl text-gold-light">{command.cmd}</h2>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">{command.desc}</p>
              <pre className="mt-6 whitespace-pre-wrap break-words bg-card/25 p-5 font-mono text-xs leading-7 text-warning">
                {command.out.join("\n")}
              </pre>
              <h3 className="mt-6 text-lg">Permission boundary</h3>
              <p className="mt-4 text-xs leading-7 text-muted-foreground">{command.permissions}</p>
              <p className="mt-5 text-xs text-gold-light">
                {command.local
                  ? "Implemented offline in unreleased source; not installed on your device."
                  : "Source returns blocked; no connected operation implemented."}
              </p>
              <Button variant="signal" size="sm" className="mt-6" onClick={() => copy(command.cmd)}>
                {copied === command.cmd ? <Check size={14} /> : <Copy size={14} />}Copy planned
                reference
              </Button>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="value" className="pt-8">
          <CompatibilityValue />
        </TabsContent>
        <TabsContent value="architecture" className="pt-8">
          <section>
            <p className="eyebrow">Source scaffold / not a release service</p>
            <h2 className="mt-4 text-3xl">Small executable. Explicit trust.</h2>
            <div className="mt-7 grid gap-9 md:grid-cols-2">
              {[
                {
                  title: "Native executable",
                  body: "Standalone Go, standard library only. One executable, no replacement terminal, background daemon, telemetry, network or shell execution. Source builds target macOS/Linux/Windows on amd64 and arm64.",
                },
                {
                  title: "Local operations",
                  body: "Help/version and read-only PATH-name doctor are implemented. Opt-in source install/uninstall uses a dedicated new directory and exact local digests, not publisher signatures. Source tests do not certify distributed installer safety.",
                },
                {
                  title: "Identity and credentials · planned",
                  body: "Browser OAuth with PKCE/state and verified callback, refresh/revoke and OS Keychain/Credential Manager/Secret Service adapters. Fail closed without a supported secure store; no plaintext fallback. No credential intake exists.",
                },
                {
                  title: "OMNI and adapters · planned",
                  body: "Official model/API coordination with project-aware consent, cost previews and cancellable output. Oracle handles evidence; Guardian gates permissions. Existing GPT/Claude toolchains remain independent.",
                },
                {
                  title: "Release build recipe · dormant",
                  body: "Source includes offline native builds and unsigned archive/checksum packaging, plus a CI template outside the active workflow folder. Repository choice, verified action pins and owner review must precede activation.",
                },
                {
                  title: "Signing and recovery · blocked",
                  body: "Platform certificates/notarization, pinned trust roots, SBOM/provenance, native installation/security tests and proven rollback precede delivery. Hashes are not signatures; no signing success or release URL is claimed.",
                },
              ].map((s) => (
                <section key={s.title} className="border-t border-gold/30 pt-5">
                  <h3 className="text-xl">{s.title}</h3>
                  <p className="mt-4 text-xs leading-7 text-muted-foreground">{s.body}</p>
                </section>
              ))}
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild variant="signal">
                <Link to="/guardian">
                  Guardian readiness
                  <ArrowUpRight size={14} />
                </Link>
              </Button>
              <Button asChild variant="signal">
                <Link to="/releases">
                  Release Galaxy · DEMO
                  <ArrowUpRight size={14} />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/care-agent">
                  Native CARE reference
                  <ArrowUpRight size={14} />
                </Link>
              </Button>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}
