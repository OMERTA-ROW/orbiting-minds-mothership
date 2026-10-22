import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaletteTrigger } from "@/components/CommandPalette";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AccountButton } from "@/components/beta/AccountButton";

export const navItems = [
  { to: "/", label: "Home" },
  { to: "/launch-control", label: "Launch Control" },
  { to: "/beta", label: "Private Beta Projects" },
  { to: "/beta-omni", label: "OMNI · Authorized Beta" },
  { to: "/mothership", label: "Mothership" },
  { to: "/command-nexus", label: "Command Nexus · Demo" },
  { to: "/omnibridge", label: "OmniBridge · Demo" },
  { to: "/omni", label: "OMNI Assistant · Demo" },
  { to: "/entertainment", label: "Entertainment Galaxy · Demo" },
  { to: "/cartoon-galaxy", label: "Cartoon Galaxy · Demo" },
  { to: "/pathway", label: "AI Pathway" },
  { to: "/code-exchange", label: "Code Exchange" },
  { to: "/code-vault", label: "Code Vault · Demo" },
  { to: "/commons", label: "Commons · Demo" },
  { to: "/pulse", label: "Pulse · Local" },
  { to: "/challenges", label: "Grand Challenges" },
  { to: "/open-call", label: "Evolution Open Call" },
  { to: "/embassy", label: "Agent Embassy" },
  { to: "/agent-lounge", label: "Welcome Lounge · Demo" },
  { to: "/incident-archives", label: "Incident Archives · Demo" },
  { to: "/agent-debrief", label: "Agent Debrief · Demo" },
  { to: "/guardian-incidents", label: "Incident Accountability · Demo" },
  { to: "/report-incident", label: "Report Incident · Demo" },
  { to: "/sdk", label: "SDK / API Docs" },
  { to: "/discovery", label: "Discovery Radar" },
  { to: "/digital-twin", label: "Digital Twin Lab" },
  { to: "/robotics", label: "Robotics & Mobility Lab" },
  { to: "/physical-safety", label: "Physical Safety Lock · Demo" },
  { to: "/experiment-replay", label: "Oracle Experiment Replay · Demo" },
  { to: "/approval-ledger", label: "Approval Ledger · Demo" },
  { to: "/impact-scorecard", label: "Idea-to-Impact Scorecard · Demo" },
  { to: "/trust", label: "Trust & Certification" },
  { to: "/marketplace", label: "Creator Marketplace" },
  { to: "/compute-grid", label: "Compute Grid" },
  { to: "/releases", label: "Release Galaxy" },
  { to: "/care", label: "Evolution CARE · Demo" },
  { to: "/updates", label: "Update Engine · Demo" },
  { to: "/pilot", label: "Evolution Pilot · Demo" },
  { to: "/voice", label: "Mothership Voice · Demo" },
  { to: "/care-agent", label: "Native Agent Reference" },
  { to: "/universe", label: "Universe" },
  { to: "/platform", label: "Evolution CLI · Planned" },
  { to: "/knowledge-fusion", label: "Knowledge Fusion" },
  { to: "/guardian", label: "Guardian" },
  { to: "/devices", label: "My Devices · Demo" },
  { to: "/fleet", label: "Fleet Control · Demo" },
  { to: "/security-report", label: "Health & Security Report" },
  { to: "/agents", label: "Agent Network" },
  { to: "/sandbox", label: "Sandbox Lab" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/partnerships", label: "Partnerships" },
  { to: "/dashboard", label: "Demo Dashboard" },
  { to: "/arena", label: "Racing Arena · Simulation" },
  { to: "/knowledge-brief", label: "Daily Knowledge Brief · Beta" },
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);
  const featured = navItems.filter((n) => ["/launch-control", "/beta", "/beta-omni"].includes(n.to));
  const more = navItems.filter((n) => !featured.some((f) => f.to === n.to) && n.to !== "/");
  return (
    <header className="site-navigation sticky top-0 z-50 border-b border-border">
      <div className="mx-auto flex h-[78px] max-w-[1600px] items-center justify-between gap-5 px-6 md:px-10">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <img src="/favicon.svg" width={38} height={38} className="brand-mark" alt="" />
          <span><span className="block font-display text-base text-gold-light">EVOLUTION</span><span className="block pt-1 font-mono text-[7px] uppercase tracking-[0.24em] text-muted-foreground">The Mothership</span></span>
        </Link>
        <nav className="hidden items-center gap-7 xl:flex" aria-label="Main">
          {featured.map((n) => (
            <Link key={n.to} to={n.to} className="nav-link whitespace-nowrap" activeProps={{ className: "is-current" }}>{n.label}</Link>
          ))}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto px-0 text-xs text-muted-foreground">More<ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 border-gold/25 p-2">{more.map((n) => <DropdownMenuItem key={n.to} asChild><Link to={n.to} className="flex justify-between py-3">{n.label}<ArrowUpRight size={12} className="text-gold" /></Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="signal" className="hidden h-10 rounded-sm px-3 text-xs sm:inline-flex"><Link to="/pathway">AI Pathway<ArrowUpRight size={14} /></Link></Button>
          <PaletteTrigger />
          <AccountButton />
          <Button variant="ghost" size="icon" className="border border-border text-gold-light xl:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="mobile-navigation" className="absolute left-0 top-full max-h-[calc(100svh-78px)] w-full overflow-y-auto border-b border-border bg-background px-6 py-6 xl:hidden" aria-label="Mobile">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-x-6 gap-y-1">
            {[...navItems, { to: "/join", label: "Join" } as const].map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="border-b border-border py-3 text-xs text-muted-foreground hover:text-gold-light"
                activeProps={{ className: "text-gold-light" }} activeOptions={{ exact: true }}>
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-12">
        <div><p className="font-display text-xl text-gold-light">EVOLUTION</p><p className="mt-3 text-[11px]">Bridge technology into its next evolution.</p></div>
        <p className="max-w-md text-[10px] leading-loose md:text-right">Beta launch blocked pending verified gates and founder approval.<br />Only private beta projects/declarations use account storage; other network records remain DEMO.<br />AI drafts are not validation or execution evidence.</p>
      </div>
    </footer>
  );
}
