import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteNav, SiteFooter } from "../components/SiteNav";
import { navItems } from "../components/nav-groups";
import { Starfield } from "../components/evo";
import OrbitalBackground from "../components/OrbitalBackground";
import EvolutionSpaceBackground from "../components/EvolutionSpaceBackground";
import EvolutionInteriorBackground from "../components/EvolutionInteriorBackground";

import { CommandPaletteProvider } from "@/components/CommandPalette";
import { AccountProvider, useAccount } from "@/hooks/use-account";
import { evolutionAccessQuery } from "@/lib/evolution-query";
import { OmniAreaHeader } from "@/components/omnibridge/OmniAreaHeader";
import { OwnerConsoleShell } from "@/components/evolution/console/OwnerConsoleShell";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Evolution" },
      { name: "description", content: "Bridge technology into its next evolution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Owner's Evolution home ("/" once the owner check passes) is an interior page. */
function SiteShell({ path, omniArea }: { path: string; omniArea: boolean }) {
  const { user, ready } = useAccount();
  const access = useQuery({
    ...evolutionAccessQuery,
    enabled: ready && Boolean(user) && path === "/",
  });
  const ownerHome = path === "/" && Boolean(user) && access.data?.owner === true;
  // One persistent scene across every workspace, account, guide and retired-area route.
  // Public landing retains its existing presentation; route changes never mount extra canvases.
  const evolutionInterior = ownerHome || (path.replace(/\/+$/, "") || "/") !== "/";
  const publicLanding = path === "/" && !ownerHome;
  const sharedConsole = evolutionInterior && ready && Boolean(user);
  const consoleArea = ownerHome || sharedConsole;
  const developerArea = [
    "/repositories",
    "/projects",
    "/pull-requests",
    "/actions",
    "/neuro",
    "/migrations",
    "/releases",
    "/issues",
    "/branches",
    "/commits",
    "/environments",
    "/packages",
    "/code-search",
    "/wiki",
  ].includes(path);
  const cloudArea = path === "/cloud-services" || path === "/deployments";
  const content = (
    <>
      {omniArea && <OmniAreaHeader />}
      <Outlet />
    </>
  );

  return (
    <div
      className={`site-shell flex min-h-screen flex-col${omniArea ? " omni-area" : ""}${publicLanding ? " evolution-dashboard" : ""}${evolutionInterior ? " evolution-interior" : ""}${consoleArea ? " evolution-console-theme" : ""}`}
    >
      {publicLanding && <EvolutionSpaceBackground />}
      {evolutionInterior ? (
        <EvolutionInteriorBackground />
      ) : (
        <>
          <OrbitalBackground />
          <div className="site-cosmos" aria-hidden>
            <Starfield count={150} />
          </div>
        </>
      )}
      {!consoleArea && <SiteNav />}
      <main className="flex-1">
        {sharedConsole ? (
          <OwnerConsoleShell area={developerArea ? "developer" : cloudArea ? "cloud" : "home"}>
            <div className="evolution-workspace-content">{content}</div>
          </OwnerConsoleShell>
        ) : (
          content
        )}
      </main>
      {!consoleArea && <SiteFooter />}
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const omniArea = path.startsWith("/omni") || path === "/beta-omni";

  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <CommandPaletteProvider pages={navItems}>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <SiteShell path={path} omniArea={omniArea} />
        </CommandPaletteProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}
