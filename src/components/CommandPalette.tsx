import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { navItems } from "@/components/nav-groups";

const PaletteContext = createContext<(() => void) | null>(null);

/** Ctrl/⌘ K, without Alt and not a held-down repeat. */
export function shouldOpenPalette(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
}) {
  return (
    event.key.toLowerCase() === "k" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.repeat
  );
}

export function PaletteTrigger() {
  const open = useContext(PaletteContext);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-gold-light"
      aria-label="Search the Mothership"
      title="Search the Mothership (Ctrl/⌘ K)"
      aria-keyshortcuts="Control+k Meta+k"
      onClick={() => open?.()}
    >
      <Search size={18} />
    </Button>
  );
}

/** Page search over the working site's pages only. */
export function CommandPaletteProvider({
  children,
  pages: navigation,
}: {
  children: ReactNode;
  pages: readonly { to: (typeof navItems)[number]["to"]; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const reveal = () => {
    setQuery("");
    setOpen(true);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (shouldOpenPalette(event)) {
        event.preventDefault();
        setQuery("");
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  const q = query.toLowerCase().trim();
  const pages = navigation.filter((p) => !q || p.label.toLowerCase().includes(q));
  return (
    <PaletteContext.Provider value={reveal}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-2xl gap-0 overflow-hidden rounded-md border-gold/30 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLButtonElement>('button[aria-label="Search the Mothership"]')
              ?.focus();
          }}
        >
          <DialogTitle className="px-5 pb-2 pt-5 font-display text-gold-light">Search</DialogTitle>
          <DialogDescription className="px-5 pb-4 text-xs">Find a page</DialogDescription>
          <Command shouldFilter={false} loop className="rounded-none">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Search pages…"
              aria-label="Search commands"
            />
            <CommandList className="max-h-[min(55svh,450px)] px-2 py-2">
              <CommandEmpty>No matching pages.</CommandEmpty>
              {pages.length > 0 && (
                <CommandGroup heading="Pages">
                  {pages.map((p) => (
                    <CommandItem
                      key={p.to}
                      value={`page:${p.to}`}
                      onSelect={() => {
                        setOpen(false);
                        void navigate({ to: p.to });
                      }}
                    >
                      <ArrowUpRight className="text-gold" />
                      {p.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}
