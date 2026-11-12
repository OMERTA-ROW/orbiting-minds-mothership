import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaletteTrigger } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountButton } from "@/components/beta/AccountButton";
import { StatusBadge } from "@/components/StatusBadge";
import { advancedItems, navGroups, navItems } from "@/components/nav-groups";

export { navItems };

export function SiteNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);
  return (
    <header className="site-navigation sticky top-0 z-50 border-b border-border">
      <div className="mx-auto flex h-[78px] max-w-[1600px] items-center justify-between gap-5 px-4 sm:px-6 md:px-10">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <img src="/favicon.svg" width={38} height={38} className="brand-mark" alt="" />
          <span>
            <span className="block font-display text-base text-gold-light">EVOLUTION</span>
            <span className="block pt-1 font-mono text-[7px] uppercase tracking-[0.24em] text-muted-foreground">
              The Mothership
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          <Link
            to="/"
            className="nav-link whitespace-nowrap"
            activeProps={{ className: "is-current" }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          {navGroups.map((g) => (
            <DropdownMenu key={g.id}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="nav-link h-auto gap-1 px-0">
                  {g.label}
                  <ChevronDown size={12} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 border-gold/25 p-2">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {g.blurb}
                </DropdownMenuLabel>
                {g.items.map((n) => (
                  <DropdownMenuItem key={n.to} asChild>
                    <Link to={n.to} className="flex items-center justify-between gap-3 py-2.5">
                      <span>{n.label}</span>
                      <StatusBadge status={n.status} tooltip={false} />
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto gap-1 px-0 text-xs text-muted-foreground">
                Advanced
                <ChevronDown size={12} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-[70vh] w-72 overflow-y-auto border-gold/25 p-2"
            >
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Earlier modules, demos and references. Labels show what is simulated.
              </DropdownMenuLabel>
              {advancedItems.map((n) => (
                <DropdownMenuItem key={n.to} asChild>
                  <Link to={n.to} className="flex justify-between py-2.5">
                    {n.label}
                    <ArrowUpRight size={12} className="text-gold" aria-hidden />
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <PaletteTrigger />
          <AccountButton />
          <Button
            variant="ghost"
            size="icon"
            className="border border-border text-gold-light lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="absolute left-0 top-full max-h-[calc(100svh-78px)] w-full overflow-y-auto border-b border-border bg-background px-5 py-6 lg:hidden"
          aria-label="Mobile"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="block border-b border-border py-3 text-sm text-foreground"
            >
              Home
            </Link>
            {navGroups.map((g) => (
              <section key={g.id} aria-labelledby={`mnav-${g.id}`}>
                <h2 id={`mnav-${g.id}`} className="eyebrow">
                  {g.label}
                </h2>
                <ul className="mt-2">
                  {g.items.map((n) => (
                    <li key={n.to}>
                      <Link
                        to={n.to}
                        onClick={() => setOpen(false)}
                        className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 text-sm text-muted-foreground hover:text-gold-light"
                        activeProps={{ className: "text-gold-light" }}
                      >
                        <span>{n.label}</span>
                        <StatusBadge status={n.status} tooltip={false} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <details className="group">
              <summary className="eyebrow flex min-h-11 cursor-pointer items-center gap-2">
                Advanced · all other areas
                <ChevronDown size={12} className="transition group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {[...advancedItems, { to: "/join", label: "Join" } as const].map((n) => (
                  <li key={n.to}>
                    <Link
                      to={n.to}
                      onClick={() => setOpen(false)}
                      className="block border-b border-border py-3 text-xs text-muted-foreground hover:text-gold-light"
                      activeProps={{ className: "text-gold-light" }}
                      activeOptions={{ exact: true }}
                    >
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
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
        <div>
          <p className="font-display text-xl text-gold-light">EVOLUTION</p>
          <p className="mt-3 text-[11px]">Bridge technology into its next evolution.</p>
        </div>
        <p className="max-w-md text-[10px] leading-loose md:text-right">
          Beta launch blocked pending verified gates and founder approval.
          <br />
          Only private beta projects/declarations use account storage; other network records remain
          DEMO.
          <br />
          AI drafts are not validation or execution evidence.
        </p>
      </div>
    </footer>
  );
}
