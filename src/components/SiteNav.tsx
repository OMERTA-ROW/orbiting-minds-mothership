import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaletteTrigger } from "@/components/CommandPalette";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const navItems = [
  { to: "/", label: "Home" },
  { to: "/mothership", label: "Mothership" },
  { to: "/pathway", label: "AI Pathway" },
  { to: "/code-exchange", label: "Code Exchange" },
  { to: "/commons", label: "Commons · Demo" },
  { to: "/pulse", label: "Pulse · Local" },
  { to: "/universe", label: "Universe" },
  { to: "/platform", label: "Platform" },
  { to: "/knowledge-fusion", label: "Knowledge Fusion" },
  { to: "/guardian", label: "Guardian" },
  { to: "/agents", label: "Agent Network" },
  { to: "/sandbox", label: "Sandbox Lab" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/partnerships", label: "Partnerships" },
  { to: "/dashboard", label: "Demo Dashboard" },
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);
  const featured = navItems.filter((n) => ["/mothership", "/universe", "/code-exchange", "/knowledge-fusion", "/guardian"].includes(n.to));
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
          <Button asChild variant="signal" className="hidden h-10 rounded-sm px-5 text-xs sm:inline-flex"><Link to="/join">Join the Network<ArrowUpRight size={14} /></Link></Button>
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
        <p className="max-w-md text-[10px] leading-loose md:text-right">Owner-reviewed prototype. Network data is demo / simulated.<br />AI pathways are draft proposals, not validation results.<br />Opt-in only · no unauthorized access, ever.</p>
      </div>
    </footer>
  );
}
