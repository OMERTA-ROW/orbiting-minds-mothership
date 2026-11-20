import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tools = [
  { to: "/activation-approvals", label: "Activation approvals · owner only" },
  { to: "/treasury", label: "Treasury · owner only" },
  { to: "/members", label: "Members · owner only" },
  { to: "/platform", label: "Offline companion · planned" },
] as const;

export function OmniAreaHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="omni-area-header mx-auto max-w-[1440px] border-b border-border px-5 py-6 md:px-10">
      <div className="flex items-center gap-4">
        <Link to="/beta-omni" className="flex min-w-0 items-center gap-3">
          <Orbit size={28} className="shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-sans text-2xl font-semibold">OMNI</h1>
            <p className="mt-1 text-xs text-muted-foreground">Evolution workspace</p>
          </div>
        </Link>
      </div>
      <nav aria-label="OMNI workspace" className="mt-6 flex min-w-0 flex-wrap items-center gap-1">
        <Button asChild variant={path === "/beta-omni" ? "secondary" : "ghost"} size="sm">
          <Link to="/beta-omni">Private agent</Link>
        </Button>
        <Button asChild variant={path === "/omni-razul" ? "secondary" : "ghost"} size="sm">
          <Link to="/omni-razul">Observatory & history</Link>
        </Button>
        <Button asChild variant={path === "/omni-terminal" ? "secondary" : "ghost"} size="sm">
          <Link to="/omni-terminal">Terminal · owner</Link>
        </Button>
        <Button asChild variant={path === "/omni-api-keys" ? "secondary" : "ghost"} size="sm">
          <Link to="/omni-api-keys">Dashboard & API keys · owner</Link>
        </Button>
        <Button asChild variant={path === "/omni-dock" ? "secondary" : "ghost"} size="sm">
          <Link to="/omni-dock">Docking Bay · owner</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Tools <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="omni-theme max-h-[65svh] w-64 overflow-y-auto bg-popover text-popover-foreground"
          >
            {tools.map((tool) => (
              <DropdownMenuItem asChild key={tool.to}>
                <Link to={tool.to}>{tool.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
