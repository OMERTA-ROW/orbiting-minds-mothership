import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ForgejoRepo } from "@/lib/forgejo";

/** Searchable, bounded, scrollable picker over the full authorized inventory (canonical full names). */
export function RepositoryPicker({
  repos,
  value,
  disabled,
  onChange,
}: {
  repos: ForgejoRepo[];
  value: string;
  disabled?: boolean;
  onChange: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => repos.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())),
    [repos, q],
  );
  return (
    <div className="w-full min-w-0 text-sm sm:flex-1">
      <span className="block">
        Repository {value ? <span className="font-mono text-primary">· {value}</span> : null}
      </span>
      <Input
        aria-label="Search authorized repositories"
        placeholder={repos.length ? `Search ${repos.length} repositories` : "No inventory loaded"}
        value={q}
        disabled={disabled || !repos.length}
        onChange={(e) => setQ(e.target.value)}
        className="mt-2"
      />
      <ul
        role="listbox"
        aria-label="Authorized repositories"
        className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-card"
      >
        {shown.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              role="option"
              aria-selected={r.name === value}
              disabled={disabled}
              onClick={() => onChange(r.name)}
              className={`flex w-full justify-between gap-2 px-3 py-1.5 text-left hover:bg-accent ${r.name === value ? "bg-accent text-primary" : ""}`}
            >
              <span className="truncate font-mono text-xs">{r.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.private ? "private" : "public"}
                {r.empty ? " · empty" : ""}
              </span>
            </button>
          </li>
        ))}
        {repos.length > 0 && !shown.length && (
          <li className="px-3 py-2 text-xs text-muted-foreground">No repository matches.</li>
        )}
      </ul>
    </div>
  );
}
