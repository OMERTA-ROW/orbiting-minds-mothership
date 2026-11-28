import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Braces,
  ChevronDown,
  CircleDollarSign,
  Cloud,
  Code2,
  Cog,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Globe2,
  HardDrive,
  Home,
  Image,
  KeyRound,
  Layers3,
  Menu,
  Network,
  Package,
  Play,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Terminal,
  UserRound,
  X,
} from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AccountButton } from "@/components/beta/AccountButton";
import { useCommandPalette } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navGroups } from "@/components/nav-groups";

export type ConsoleArea = "home" | "developer" | "cloud";
const homeNavigation = [
  { label: "Home", to: "/", icon: Home },
  { label: "OMNI Block Developer Center", to: "/repositories", icon: Code2 },
  { label: "Cloud Services", to: "/cloud-services", icon: Cloud },
  { label: "Network & Security", to: "/account-security", icon: ShieldCheck },
  { label: "Website Center", to: "/projects", icon: Globe2 },
  { label: "AI Agents", to: "/omni-terminal", icon: Bot },
  { label: "Projects", to: "/projects", icon: FolderGit2 },
  { label: "Neuro Intelligence", to: "/neuro", icon: Sparkles },
  { label: "Database migrations", to: "/migrations", icon: Layers3 },
  { label: "Billing & Subscriptions", to: "/treasury", icon: CircleDollarSign },
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

const developerNavigation = [
  { label: "Repositories", to: "/repositories", icon: FolderGit2 },
  { label: "Pull Requests", to: "/pull-requests", icon: GitPullRequest },
  { label: "Issues", to: "/issues", icon: Boxes },
  { label: "Branches", to: "/branches", icon: GitBranch },
  { label: "Commits", to: "/commits", icon: GitCommitHorizontal },
  { label: "Actions", to: "/actions", icon: Play },
  { label: "Releases", to: "/releases", icon: Tags },
  { label: "Environments", to: "/environments", icon: Layers3 },
  { label: "Packages", to: "/packages", icon: Package },
  { label: "Code Search", to: "/code-search", icon: Braces },
  { label: "Projects", to: "/projects", icon: FolderGit2 },
  { label: "Wiki", to: "/wiki", icon: BookOpen },
  { label: "Security", to: "/account-security", icon: ShieldCheck },
  { label: "Settings", to: "/settings", icon: Cog },
] as const;

const cloudNavigation = [
  { label: "Instances", to: "/cloud-services", icon: Server },
  { label: "Storage", disabled: "No storage inventory is connected.", icon: HardDrive },
  { label: "Networking", disabled: "No network inventory is connected.", icon: Network },
  { label: "Backups", disabled: "Recovery evidence is not verified.", icon: HardDrive },
  { label: "Deployments", to: "/deployments", icon: Rocket },
  { label: "Images", disabled: "No machine-image inventory is connected.", icon: Image },
  { label: "SSH Keys", disabled: "No SSH key manager is connected.", icon: KeyRound },
  { label: "Automation", disabled: "Cloud automation remains off.", icon: Sparkles },
  { label: "Billing", to: "/treasury", icon: CircleDollarSign },
  { label: "Settings", to: "/settings", icon: Cog },
] as const;

const services = [
  { label: "Evolution Home", to: "/", icon: Home },
  { label: "Developer Center", to: "/repositories", icon: Code2 },
  { label: "Cloud Services", to: "/cloud-services", icon: Cloud },
  { label: "OMNI Terminal", to: "/omni-terminal", icon: Terminal },
  { label: "My Projects", to: "/projects", icon: FolderGit2 },
] as const;

function Navigation({
  area,
  onNavigate,
}: {
  area: ConsoleArea;
  onNavigate?: (() => void) | undefined;
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const entries =
    area === "developer"
      ? developerNavigation
      : area === "cloud"
        ? cloudNavigation
        : homeNavigation;
  return (
    <nav
      aria-label={area === "home" ? "Evolution workspace" : `${area} workspace`}
      className="px-3 py-4"
    >
      {area !== "home" && (
        <Link
          to="/"
          onClick={onNavigate}
          className="mb-4 flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-console-raised hover:text-gold-light"
        >
          <Home size={15} aria-hidden /> Evolution Home
        </Link>
      )}
      <p className="mb-2 px-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {area === "developer"
          ? "Development workspace"
          : area === "cloud"
            ? "Infrastructure workspace"
            : "Owner workspace"}
      </p>
      <ul className="space-y-1">
        {entries.map((item) => {
          const Icon = item.icon;
          if ("disabled" in item) {
            return (
              <li key={item.label}>
                <Button
                  variant="ghost"
                  type="button"
                  disabled
                  title={item.disabled}
                  aria-label={`${item.label}: ${item.disabled}`}
                  className="flex min-h-10 w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 text-left text-xs text-muted-foreground opacity-55"
                >
                  <Icon size={16} aria-hidden />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[9px]">Off</span>
                </Button>
              </li>
            );
          }
          const active = item.to === "/" ? path === "/" : path === item.to;
          return (
            <li key={`${item.label}:${item.to}`}>
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-xs text-muted-foreground transition-colors hover:bg-console-raised hover:text-foreground",
                  active && "border-gold/30 bg-console-active text-gold-light shadow-console-nav",
                )}
              >
                <Icon size={16} aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 border-t border-gold/15 pt-4">
        {navGroups.map((group) => (
          <details
            key={group.id}
            className="mb-1"
            open={group.items.some((item) => item.to === path) || undefined}
          >
            <summary className="cursor-pointer rounded-lg px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-console-raised hover:text-gold-light">
              {group.label}
            </summary>
            <ul className="mt-1 space-y-1 border-l border-gold/15 pl-2">
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    aria-current={path === item.to ? "page" : undefined}
                    title={item.note}
                    className={cn(
                      "flex min-h-10 items-center rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-console-raised hover:text-foreground",
                      path === item.to && "bg-console-active text-gold-light",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </nav>
  );
}

function SidebarContent({
  area,
  onNavigate,
}: {
  area: ConsoleArea;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className="flex min-h-[76px] items-center gap-3 border-b border-gold/15 px-5"
        aria-label="Evolution OMNI Block home"
      >
        <img src="/favicon.svg" width={36} height={36} className="brand-mark" alt="" />
        <span>
          <span className="block font-display text-sm tracking-wide text-gold-light">
            EVOLUTION
          </span>
          <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
            OMNI Block
          </span>
        </span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Navigation area={area} onNavigate={onNavigate} />
      </div>
      <footer className="border-t border-gold/15 p-3">
        <p className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <UserRound size={13} aria-hidden /> Owner controls
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="justify-start px-2 text-[11px] text-gold-light"
          >
            <Link to="/omni-terminal" onClick={onNavigate}>
              OMNI Stop
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="justify-start px-2 text-[11px]">
            <Link to="/account-security" onClick={onNavigate}>
              Security
            </Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}

function ServiceSwitcher({ area }: { area: ConsoleArea }) {
  const current = services.find(
    (service) =>
      service.to ===
      (area === "developer" ? "/repositories" : area === "cloud" ? "/cloud-services" : "/"),
  );
  const CurrentIcon = current?.icon ?? Activity;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-2 border border-gold/15 bg-console-panel/70 text-xs md:inline-flex"
        >
          <CurrentIcon size={14} className="text-gold-light" aria-hidden />
          <span className="max-w-32 truncate">{current?.label ?? "Evolution"}</span>
          <ChevronDown size={12} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 border-gold/25 bg-console-panel p-2">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Switch service
        </DropdownMenuLabel>
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <DropdownMenuItem key={service.to} asChild>
              <Link to={service.to} className="gap-3 py-2.5">
                <Icon size={15} className="text-gold-light" aria-hidden /> {service.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="border border-gold/15 bg-console-panel/70 text-gold-light"
          aria-label="Notifications"
        >
          <Bell size={17} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 border-gold/25 bg-console-panel p-3">
        <DropdownMenuLabel className="px-1 text-sm text-foreground">
          Notifications
        </DropdownMenuLabel>
        <p className="px-1 py-3 text-xs leading-5 text-muted-foreground">
          Not connected. No notification provider is configured; no unread count is inferred.
        </p>
        <DropdownMenuSeparator className="bg-gold/15" />
        <DropdownMenuItem asChild>
          <Link to="/activation-approvals" className="py-2.5">
            Review existing approval records
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ConsoleContext = createContext(false);

export function OwnerConsoleShell({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  const nested = useContext(ConsoleContext);
  if (nested) return <>{children}</>;
  return (
    <ConsoleContext.Provider value={true}>
      <ConsoleFrame area={area}>{children}</ConsoleFrame>
    </ConsoleContext.Provider>
  );
}

function ConsoleFrame({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const openPalette = useCommandPalette();
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileOpen]);

  return (
    <div className="owner-console evolution-console-theme min-h-screen text-foreground">
      <a
        href="#owner-console-content"
        className="sr-only z-[70] bg-console-panel px-4 py-3 text-gold-light focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to workspace content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-gold/20 bg-console-sidebar/95 shadow-console backdrop-blur-xl lg:block">
        <SidebarContent area={area} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <Button
            variant="ghost"
            className="absolute inset-0 h-full w-full rounded-none bg-console-deep/80 hover:bg-console-deep/80"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r border-gold/25 bg-console-sidebar shadow-console">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3 z-10 text-gold-light"
              aria-label="Close navigation menu"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </Button>
            <SidebarContent area={area} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center gap-2 border-b border-gold/15 bg-console-header/90 px-3 py-3 backdrop-blur-xl sm:gap-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 border border-gold/15 text-gold-light lg:hidden"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={18} />
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={() => openPalette?.()}
            aria-keyshortcuts="Control+k Meta+k"
            className="flex h-10 min-w-0 flex-1 justify-start gap-3 rounded-lg border border-gold/15 bg-console-panel/75 px-3 text-left text-xs text-muted-foreground transition-colors hover:border-gold/35 sm:max-w-xl sm:px-4"
          >
            <Search size={16} className="shrink-0 text-gold-light" aria-hidden />
            <span className="truncate">Search workspaces and controls</span>
            <kbd className="ml-auto hidden rounded border border-gold/20 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">
              ⌘ K
            </kbd>
          </Button>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ServiceSwitcher area={area} />
            <Notifications />
            <AccountButton />
          </div>
        </header>
        <div
          id="owner-console-content"
          tabIndex={-1}
          className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
