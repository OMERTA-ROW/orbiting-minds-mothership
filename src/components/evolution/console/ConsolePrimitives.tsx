import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ConsolePanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-gold/20 bg-console-panel/90 p-5 text-card-foreground shadow-console backdrop-blur-md",
        className,
      )}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-gold/20 bg-console-panel/90 p-4 shadow-console backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/20 bg-console-raised text-gold-light">
          <Icon size={15} aria-hidden />
        </span>
      </div>
      <p className="mt-3 break-words text-xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
    </article>
  );
}

export function StateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] break-words text-right text-xs leading-5 text-foreground">
        {value}
      </span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gold/20 bg-console-deep/45 px-4 py-6 text-center text-sm leading-6 text-muted-foreground">
      {children}
    </div>
  );
}
