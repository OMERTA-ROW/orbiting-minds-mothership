import { cn } from "@/lib/utils";
import { NAV_STATUS, type NavStatus } from "@/components/nav-groups";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Status badge with a plain-language explanation (tooltip on hover/focus; text for screen readers). */
export function StatusBadge({
  status,
  tooltip = true,
  className,
}: {
  status: NavStatus;
  tooltip?: boolean;
  className?: string;
}) {
  const s = NAV_STATUS[status];
  const classes = cn(
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
    s.tone,
    className,
  );
  if (!tooltip) return <span className={classes}>{s.label}</span>;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn(classes, "cursor-help")}>
            {s.label}
            <span className="sr-only">: {s.help}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-60 border border-border bg-popover text-popover-foreground">
          {s.help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
