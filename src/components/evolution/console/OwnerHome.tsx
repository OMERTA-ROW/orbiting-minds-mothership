import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Bot,
  Cloud,
  Code2,
  FolderGit2,
  Globe2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { readForgejoRepos } from "@/lib/forgejo.functions";
import { controlCenterQuery, evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { Button } from "@/components/ui/button";
import { OwnerConsoleShell } from "./OwnerConsoleShell";
import { ConsolePanel, EmptyState, MetricCard, StateLine } from "./ConsolePrimitives";
import { consoleDate } from "./console-utils";

const services = [
  {
    title: "OMNI Block Developer Center",
    description:
      "Private repository visibility, saved project configuration and read-only integrity evidence.",
    to: "/repositories",
    icon: Code2,
  },
  {
    title: "Cloud Services",
    description:
      "Review real provider connections and explicit infrastructure limits without deploying anything.",
    to: "/cloud-services",
    icon: Cloud,
  },
  {
    title: "AI Agents",
    description:
      "Open existing OMNI intelligence, approvals and Emergency Stop controls. Autonomy stays unchanged.",
    to: "/omni-terminal",
    icon: Bot,
  },
  {
    title: "Account Security",
    description:
      "Manage sign-in protection and owner-only access. Network inventory remains unconnected.",
    to: "/account-security",
    icon: ShieldCheck,
  },
] as const;

export function OwnerHome() {
  const workspace = useReactQuery(evolutionWorkspaceQuery);
  const control = useReactQuery(controlCenterQuery);
  const readForgejo = useServerFn(readForgejoRepos);
  const forgejo = useReactQuery({
    queryKey: ["forgejo-repos"],
    queryFn: () => readForgejo(),
    retry: false,
  });
  const workspaceData = workspace.data;
  const controlData = control.data;
  const forgejoData = forgejo.data;
  const repos = forgejoData?.state === "connected" ? forgejoData.repos : [];
  const privateCount = repos.filter((repo) => repo.private).length;
  const activities = workspaceData?.ok
    ? [...workspaceData.configs]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5)
    : [];

  return (
    <OwnerConsoleShell area="home">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-gold/25 bg-console-hero/75 px-6 py-10 shadow-console backdrop-blur-sm sm:px-10 sm:py-12">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-70"
            aria-hidden
          />
          <p className="eyebrow">Private owner command center</p>
          <h1 className="mt-4 font-display text-4xl font-medium tracking-wide text-gold-gradient sm:text-5xl lg:text-6xl">
            EVOLUTION
          </h1>
          <p className="mt-3 text-xl font-light text-foreground sm:text-2xl">
            Unified Technology Platform
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Bridge technology into its next evolution. One protected view of your projects,
            repositories, cloud connections and agent controls.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="cosmic">
              <Link to="/repositories" search={(previous) => ({ ...previous, repoPage: 1 })}>
                Open Developer Center <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="signal">
              <Link to="/projects" search={(previous) => ({ ...previous, repoPage: 1 })}>
                Manage projects
              </Link>
            </Button>
          </div>
        </section>

        <section
          aria-label="Platform services"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Link
                key={service.to + service.title}
                to={service.to}
                search={(previous) => ({ ...previous, repoPage: 1 })}
                className="group flex min-h-48 flex-col rounded-2xl border border-gold/20 bg-console-panel/90 p-5 shadow-console backdrop-blur-md transition-colors hover:border-gold/45 hover:bg-console-raised/95"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold/30 bg-console-raised text-gold-light shadow-console-nav">
                  <Icon size={21} aria-hidden />
                </span>
                <h2 className="mt-5 text-base font-semibold text-foreground group-hover:text-gold-light">
                  {service.title}
                </h2>
                <p className="mt-2 flex-1 text-xs leading-6 text-muted-foreground">
                  {service.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 text-xs text-gold-light">
                  Open workspace <ArrowRight size={13} aria-hidden />
                </span>
              </Link>
            );
          })}
        </section>

        <div className="grid gap-4 xl:grid-cols-4">
          <MetricCard
            label="Private repositories"
            value={forgejoData?.state === "connected" ? String(privateCount) : "Not verified"}
            note={
              forgejoData?.state === "connected"
                ? `${repos.length} total returned by the read-only gateway`
                : "Gateway data is unavailable or owner verification is required"
            }
            icon={FolderGit2}
          />
          <MetricCard
            label="Project records"
            value={workspaceData?.ok ? String(workspaceData.projects.length) : "Not verified"}
            note="Saved private directory records, not execution proof"
            icon={Code2}
          />
          <MetricCard
            label="Cloud connections"
            value={controlData?.ok ? String(controlData.cloud.length) : "Not verified"}
            note="Saved provider connection records; inventory is not inferred"
            icon={Cloud}
          />
          <MetricCard
            label="Websites"
            value={
              controlData?.ok
                ? String(controlData.directory.filter((entry) => Boolean(entry.website_url)).length)
                : "Not verified"
            }
            note="Linked addresses in your real project directory"
            icon={Globe2}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <ConsolePanel title="System Status" description="Only current read results are shown.">
            <StateLine
              label="Evolution Git"
              value={
                forgejoData?.state === "connected"
                  ? `Connected · ${repos.length} repositories visible`
                  : forgejo.isPending
                    ? "Checking connection"
                    : "Not connected / not verified"
              }
            />
            <StateLine
              label="Owner records"
              value={
                workspaceData?.ok
                  ? `Read · checked ${consoleDate(workspaceData.checkedAt)}`
                  : workspace.isPending
                    ? "Checking private records"
                    : "Not verified"
              }
            />
            <StateLine
              label="Cloud inventory"
              value={
                controlData?.ok
                  ? `${controlData.cloud.length} saved connections · resource metrics not connected`
                  : "Not verified"
              }
            />
            <StateLine label="CODE execution" value="Not connected · safety gates unchanged" />
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 px-0 text-gold-light"
              disabled={forgejo.isFetching}
              onClick={() => void forgejo.refetch()}
            >
              <RefreshCw size={14} className={forgejo.isFetching ? "animate-spin" : ""} /> Refresh
              Git status
            </Button>
          </ConsolePanel>

          <ConsolePanel
            title="Recent Activity"
            description="Latest saved project configuration revisions."
          >
            {activities.length ? (
              <ul className="space-y-1">
                {activities.map((activity) => {
                  const project = workspaceData?.ok
                    ? workspaceData.projects.find((item) => item.id === activity.project_id)
                    : undefined;
                  return (
                    <li key={activity.id} className="border-b border-border py-3 last:border-0">
                      <p className="text-sm text-foreground">
                        {project?.name ?? "Private project"} · revision {activity.revision}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activity.branch} · {consoleDate(activity.created_at)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>
                {workspace.isPending
                  ? "Checking activity records…"
                  : "No configuration activity recorded."}
              </EmptyState>
            )}
            <Button asChild variant="ghost" size="sm" className="mt-4 px-0 text-gold-light">
              <Link to="/settings" search={(previous) => ({ ...previous, repoPage: 1 })}>
                Open configuration history <ArrowRight size={13} />
              </Link>
            </Button>
          </ConsolePanel>

          <ConsolePanel
            title="Quick Actions"
            description="Existing destinations only; nothing runs automatically."
          >
            <div className="grid gap-2">
              <Button asChild variant="signal" className="justify-start">
                <Link to="/repositories" search={(previous) => ({ ...previous, repoPage: 1 })}>
                  <FolderGit2 size={15} /> View private repositories
                </Link>
              </Button>
              <Button asChild variant="signal" className="justify-start">
                <Link to="/projects" search={(previous) => ({ ...previous, repoPage: 1 })}>
                  <Globe2 size={15} /> Link or check a website
                </Link>
              </Button>
              <Button asChild variant="signal" className="justify-start">
                <Link to="/cloud-services" search={(previous) => ({ ...previous, repoPage: 1 })}>
                  <Cloud size={15} /> Review cloud connections
                </Link>
              </Button>
              <Button asChild variant="signal" className="justify-start">
                <Link to="/omni-terminal" search={(previous) => ({ ...previous, repoPage: 1 })}>
                  <Bot size={15} /> Open OMNI controls
                </Link>
              </Button>
            </div>
          </ConsolePanel>
        </div>
      </div>
    </OwnerConsoleShell>
  );
}
