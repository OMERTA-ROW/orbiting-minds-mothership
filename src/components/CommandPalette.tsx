import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bot, FileText, Layers, Orbit, Search, Sparkles } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { navItems } from "@/components/SiteNav";
import { searchCommands, shouldOpenPalette, type SearchEntry, type SearchKind } from "@/lib/command-search";

const PaletteContext = createContext<(() => void) | null>(null);
const kinds: SearchKind[] = ["Module", "Project", "Agent", "Proposal", "Idea"];
const icons = { Module: Orbit, Project: Layers, Agent: Bot, Proposal: FileText, Idea: Sparkles };

export function PaletteTrigger() {
  const open = useContext(PaletteContext);
  return <Button variant="ghost" size="icon" className="text-gold-light" aria-label="Search the Mothership" title="Search the Mothership (Ctrl/⌘ K)" aria-keyshortcuts="Control+k Meta+k" onClick={() => open?.()}><Search size={18} /></Button>;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const reveal = () => { setQuery(""); setOpen(true); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (shouldOpenPalette(event)) { event.preventDefault(); setQuery(""); setOpen((current) => !current); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  const select = (entry: SearchEntry) => {
    setOpen(false);
    if (entry.kind === "Module") void navigate({ to: "/mothership", search: { module: entry.id }, hash: "module-explorer" });
    else if (entry.kind === "Project") void navigate({ to: "/universe", search: { world: entry.id }, hash: "world-profile" });
    else if (entry.kind === "Agent") void navigate({ to: "/agents", hash: `agent-${entry.id.toLowerCase()}` });
    else if (entry.kind === "Proposal") void navigate({ to: "/dashboard", search: { proposal: entry.id }, hash: `proposal-${entry.id}` });
    else void navigate({ to: "/knowledge-fusion", search: { idea: entry.id }, hash: `idea-${entry.id}` });
  };
  const matches = searchCommands(query);
  const pages = [...navItems, { to: "/join", label: "Join" } as const].filter((p) => !query.trim() || p.label.toLowerCase().includes(query.toLowerCase().trim()));
  return <PaletteContext.Provider value={reveal}>
    {children}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl gap-0 overflow-hidden rounded-md border-gold/30 p-0" onCloseAutoFocus={(event) => {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('button[aria-label="Search the Mothership"]')?.focus();
      }}>
        <DialogTitle className="px-5 pb-2 pt-5 font-display text-gold-light">Mothership command</DialogTitle>
        <DialogDescription className="px-5 pb-4 text-xs">Modules · demo projects, agents and proposals</DialogDescription>
        <Command shouldFilter={false} loop className="rounded-none">
          <CommandInput value={query} onValueChange={setQuery} autoFocus placeholder="Search the constellation…" aria-label="Search commands" />
          <CommandList className="max-h-[min(55svh,450px)] px-2 py-2">
            <CommandEmpty>No matching worlds or commands.</CommandEmpty>
            {kinds.map((kind) => {
              const entries = matches.filter((e) => e.kind === kind);
              const Icon = icons[kind];
              return entries.length > 0 && <CommandGroup key={kind} heading={kind === "Module" ? "Mothership modules" : `Demo ${kind.toLowerCase()}s`}>
                {entries.map((entry) => <CommandItem key={entry.key} value={entry.key} onSelect={() => select(entry)} className="gap-3 py-3">
                  <Icon className="text-gold" /><span className="min-w-0 flex-1"><span className="block break-words text-sm">{entry.label}</span><span className="mt-1 block break-words text-[11px] text-muted-foreground">{entry.detail}</span></span><ArrowUpRight className="text-gold" />
                </CommandItem>)}
              </CommandGroup>;
            })}
            {pages.length > 0 && <CommandGroup heading="Pages">{pages.map((p) => <CommandItem key={p.to} value={`page:${p.to}`} onSelect={() => { setOpen(false); void navigate({ to: p.to }); }}><ArrowUpRight className="text-gold" />{p.label}</CommandItem>)}</CommandGroup>}
          </CommandList>
        </Command>
        <div className="border-t border-border px-5 py-3 font-mono text-[9px] uppercase text-muted-foreground">Owner-reviewed · demo results only</div>
      </DialogContent>
    </Dialog>
  </PaletteContext.Provider>;
}