import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export const navItems = [
  { to: "/", label: "Home" },
  { to: "/mothership", label: "Mothership" },
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
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-gold/60 shadow-glow">
            <span className="h-2.5 w-2.5 rounded-full bg-gold-gradient" />
          </span>
          <span className="font-display text-lg tracking-[0.25em] text-gold-gradient">EVOLUTION</span>
        </Link>
        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
          {navItems.slice(1).map((n) => (
            <Link key={n.to} to={n.to} className="rounded-full px-2.5 py-1.5 text-[13px] text-muted-foreground transition hover:text-gold-light"
              activeProps={{ className: "text-gold-light bg-accent/50" }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/join" className="hidden rounded-full bg-gold-gradient px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-glow sm:inline-flex">Join</Link>
          <button className="rounded-full border border-border p-2 text-gold-light xl:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-border bg-background/95 px-6 py-4 xl:hidden" aria-label="Mobile">
          <div className="grid grid-cols-2 gap-1">
            {[...navItems, { to: "/join", label: "Join" } as const].map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/40"
                activeProps={{ className: "text-gold-light bg-accent/50" }} activeOptions={{ exact: true }}>
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
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p><span className="font-display tracking-[0.2em] text-gold">EVOLUTION</span> — Bridge technology into its next evolution.</p>
        <p>Owner-reviewed prototype. All data is demo / simulated. Opt-in only · no unauthorized access, ever.</p>
      </div>
    </footer>
  );
}
