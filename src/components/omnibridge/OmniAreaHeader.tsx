import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ArrowUpRight, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tools = [
  { to: "/beta-omni", label: "Private agent" },
  { to: "/omnibridge", label: "Connections & plans" },
  { to: "/omni-gateway", label: "Coding" },
  { to: "/omni-agents", label: "Agents" },
  { to: "/omni-models", label: "Models & passports" },
  { to: "/omni-marketing", label: "Marketing" },
  { to: "/angel-tech", label: "Sabrina & partnerships" },
  { to: "/omni-rights", label: "Rights" },
  { to: "/omni-legal", label: "Legal forms & drafts" },
  { to: "/omni-api-keys", label: "API credentials · owner only" },
  { to: "/members", label: "Members · owner only" },
  { to: "/platform", label: "Offline companion" },
] as const;

export function OmniAreaHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="omni-area-header mx-auto max-w-[1440px] border-b border-border px-5 py-6 md:px-10">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <Link
          to="/omni"
          search={{ world: "nexus-nebula" }}
          className="flex min-w-0 items-center gap-3"
        >
          <Orbit size={28} className="shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-sans text-2xl font-semibold">OMNI</h1>
            <p className="mt-1 text-xs text-muted-foreground">Evolution workspace</p>
          </div>
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link to="/beta-omni">
            Private agent <ArrowUpRight size={14} />
          </Link>
        </Button>
      </div>
      <nav aria-label="OMNI workspace" className="mt-6 flex min-w-0 flex-wrap items-center gap-1">
        <Button asChild variant={path === "/omni" ? "secondary" : "ghost"} size="sm">
          <Link to="/omni" search={{ world: "nexus-nebula" }}>
            Conversation
          </Link>
        </Button>
        <Button asChild variant={path === "/omni-razul" ? "secondary" : "ghost"} size="sm">
          <Link to="/omni-razul">Observatory & history</Link>
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
