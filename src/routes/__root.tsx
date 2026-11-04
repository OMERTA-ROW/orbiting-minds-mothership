import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { SiteNav, SiteFooter, navItems } from "../components/SiteNav";
import { Starfield } from "../components/evo";
import OrbitalBackground from "../components/OrbitalBackground";
import { CommandPaletteProvider } from "@/components/CommandPalette";
import { DemoExchangeProvider } from "@/hooks/use-demo-exchange";
import { ExchangeLocaleProvider } from "@/hooks/use-exchange-locale";
import { GenesisProvider } from "@/hooks/use-genesis";
import { CareProvider } from "@/hooks/use-care";
import { GuardianProvider } from "@/hooks/use-guardian";
import { IncidentProvider } from "@/hooks/use-incidents";
import { TrustedReleaseProvider } from "@/hooks/use-trusted-release";
import { AccountProvider } from "@/hooks/use-account";
import { OmniAreaHeader } from "@/components/omnibridge/OmniAreaHeader";

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
      { title: "EVOLUTION Mothership" },
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
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap" },
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const omniArea = path.startsWith("/omni") || path === "/beta-omni" || path === "/angel-tech";
  const calmArea = omniArea || path === "/dashboard";

  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
      <GuardianProvider>
      <CareProvider>
      <GenesisProvider>
      <TrustedReleaseProvider>
      <IncidentProvider>
      <DemoExchangeProvider>
      <ExchangeLocaleProvider>
      <CommandPaletteProvider pages={navItems}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div className={`site-shell flex min-h-screen flex-col${calmArea ? " omni-theme omni-area" : ""}`}>
        <OrbitalBackground />
        <div className="site-cosmos" aria-hidden><Starfield count={150} /></div>
        <SiteNav />
        <main className="flex-1">
          {omniArea && <OmniAreaHeader />}
          <Outlet />
        </main>
        <SiteFooter />
      </div>
      </CommandPaletteProvider>
      </ExchangeLocaleProvider>
      </DemoExchangeProvider>
      </IncidentProvider>
      </TrustedReleaseProvider>
      </GenesisProvider>
      </CareProvider>
      </GuardianProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}
