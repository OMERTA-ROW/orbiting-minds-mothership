import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  FolderGit2,
  GitPullRequest,
  Play,
  Database,
  Rocket,
  Settings,
  Plus,
  RefreshCw,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import {
  EVOLUTION_BLOCKERS,
  EVOLUTION_CAPABILITIES,
  evolutionConfigInput,
  evolutionProjectInput,
} from "@/lib/evolution";
import { evolutionAccessQuery, evolutionWorkspaceQuery } from "@/lib/evolution-query";
import { createEvolutionProject, saveEvolutionConfig } from "@/lib/evolution.functions";

export type WorkspaceView =
  "home" | "repositories" | "pull-requests" | "actions" | "migrations" | "deployments" | "settings";
const views = {
  home: { title: "Evolution", icon: FolderGit2 },
  repositories: { title: "Repositories", icon: FolderGit2 },
  "pull-requests": { title: "Pull Requests", icon: GitPullRequest },
  actions: { title: "Actions", icon: Play },
  migrations: { title: "Migrations", icon: Database },
  deployments: { title: "Deployments", icon: Rocket },
  settings: { title: "Settings", icon: Settings },
};

export function EvolutionOwnerHome({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAccount();
  const access = useQuery({ ...evolutionAccessQuery, enabled: ready && Boolean(user) });
  return access.data?.owner ? <Workspace view="home" /> : children;
}

export function EvolutionWorkspace({ view }: { view: WorkspaceView }) {
  const { data } = useSuspenseQuery(evolutionWorkspaceQuery);
  return <Workspace view={view} initial={data} />;
}

function Workspace({
  view,
  initial,
}: {
  view: WorkspaceView;
  initial?: Awaited<ReturnType<typeof import("@/lib/evolution.functions").readEvolutionWorkspace>>;
}) {
  const query = useQuery({
    ...evolutionWorkspaceQuery,
    ...(initial ? { initialData: initial } : {}),
  });
  const cache = useQueryClient();
  const create = useServerFn(createEvolutionProject);
  const save = useServerFn(saveEvolutionConfig);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const data = query.data;
  const project = data?.ok
    ? (data.projects.find((p) => p.id === selected) ?? data.projects[0])
    : undefined;
  const configs =
    data?.ok && project
      ? data.configs
          .filter((c) => c.project_id === project.id)
          .sort((a, b) => b.revision - a.revision)
      : [];
  const current = configs[0];
  const Icon = views[view].icon;
  async function act(work: () => Promise<string>) {
    setBusy(true);
    setNotice("");
    try {
      const message = await work();
      await cache.invalidateQueries({ queryKey: evolutionWorkspaceQuery.queryKey });
      setNotice(message);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The operation failed. No success was recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="eyebrow">Private owner workspace</p>
          <h1 className="mt-3 flex items-center gap-3 text-3xl">
            <Icon className="text-primary" size={26} />
            {views[view].title}
          </h1>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching || busy}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={15} />
          Refresh records
        </Button>
      </header>
      <p className="my-4 text-xs text-muted-foreground">
        {data ? (
          <>
            Records checked{" "}
            <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString()}</time>
          </>
        ) : (
          "Checking private records…"
        )}{" "}
        · No production changes
      </p>
      {notice && (
        <p role="status" className="my-4 break-words border-l-2 border-primary pl-4 text-sm">
          {notice}
        </p>
      )}
      {!data?.ok ? (
        <div className="border-y border-border py-8">
          <h2 className="text-lg">
            {query.isPending ? "Checking owner access" : "Owner workspace unavailable"}
          </h2>
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {data && !data.ok
              ? data.message
              : query.isError
                ? "The owner check failed. Sign in and retry; cached records are not shown."
                : "Waiting for the authenticated owner check."}
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/account-security">Account Security</Link>
          </Button>
        </div>
      ) : (
        <>
          {view === "home" && (
            <>
              <p className="max-w-2xl py-6 text-lg text-muted-foreground">
                Your projects, reviewed changes and release history. OMNI coordinates; Jackboy
                maintains software.
              </p>
              <div className="grid gap-x-8 md:grid-cols-2">
                <div className="border-t border-border py-6">
                  <h2 className="text-xl">Private projects</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {data.projects.length
                      ? `${data.projects.length} saved project records shown (up to 100). Git imports are not verified.`
                      : "No private projects yet."}
                  </p>
                  <Button asChild className="mt-5">
                    <Link to="/repositories">
                      Open repositories
                      <ArrowRight size={15} />
                    </Link>
                  </Button>
                </div>
                <Unavailable title="Execution" reason={EVOLUTION_BLOCKERS.builds} />
              </div>
            </>
          )}
          {(view === "repositories" || view === "settings") && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 py-6">
                <h2 className="text-xl">
                  {view === "settings" ? "Project configuration" : "Private project records"}
                </h2>
                <Button variant="outline" onClick={() => setCreating(!creating)}>
                  <Plus size={16} />
                  {creating ? "Close project form" : "Create project"}
                </Button>
              </div>
              {creating && (
                <form
                  className="grid gap-4 border-y border-border py-6 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const fields = new FormData(event.currentTarget);
                    void act(async () => {
                      const input = evolutionProjectInput.parse({
                        name: fields.get("name"),
                        brief: fields.get("brief"),
                      });
                      const result = await create({ data: input });
                      setSelected(result.projectId);
                      setCreating(false);
                      return "Private project record saved. No Git repository was created or imported.";
                    });
                  }}
                >
                  <label className="text-sm">
                    Project name
                    <input
                      className="exchange-select mt-2 w-full"
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </label>
                  <label className="text-sm">
                    Non-sensitive description
                    <input className="exchange-select mt-2 w-full" name="brief" maxLength={2000} />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Save private project
                  </Button>
                </form>
              )}
              {!data.projects.length ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No project records. Create a private project before configuring its repository.
                </p>
              ) : (
                <>
                  <label className="block max-w-lg text-sm">
                    Project
                    <select
                      className="exchange-select mt-2 w-full"
                      value={project?.id ?? ""}
                      onChange={(event) => {
                        setSelected(event.target.value);
                        setNotice("");
                      }}
                    >
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-3 break-words text-sm text-muted-foreground">
                    {project?.brief || "No description supplied."}
                  </p>
                  <h3 className="mt-8 text-lg">Configure / prepare import</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Saving an address prepares configuration only. Git history, refs and tags have
                    not been imported. Do not enter credentials or environment values.
                  </p>
                  <form
                    key={`${project?.id}:${current?.revision ?? 0}`}
                    className="mt-5 grid gap-5 sm:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!project) return;
                      const fields = new FormData(event.currentTarget);
                      void act(async () => {
                        const input = evolutionConfigInput.parse({
                          projectId: project.id,
                          expectedRevision: current?.revision ?? 0,
                          sourceUrl: fields.get("sourceUrl"),
                          branch: fields.get("branch"),
                          buildCommand: fields.get("buildCommand"),
                          outputDirectory: fields.get("outputDirectory"),
                        });
                        const result = await save({ data: input });
                        return `Configuration revision ${result.revision} saved at ${new Date(result.createdAt).toLocaleString()}. Nothing was imported, executed or deployed.`;
                      });
                    }}
                  >
                    <label className="text-sm">
                      Source repository HTTPS address
                      <input
                        type="url"
                        name="sourceUrl"
                        maxLength={500}
                        defaultValue={current?.source_url ?? ""}
                        className="exchange-select mt-2 w-full"
                      />
                    </label>
                    <label className="text-sm">
                      Branch
                      <input
                        name="branch"
                        required
                        maxLength={200}
                        defaultValue={current?.branch ?? "main"}
                        className="exchange-select mt-2 w-full"
                      />
                    </label>
                    <label className="text-sm">
                      Build command (stored, not run)
                      <input
                        name="buildCommand"
                        maxLength={500}
                        defaultValue={current?.build_command ?? ""}
                        className="exchange-select mt-2 w-full"
                      />
                    </label>
                    <label className="text-sm">
                      Output folder
                      <input
                        name="outputDirectory"
                        required
                        maxLength={200}
                        defaultValue={current?.output_directory ?? "dist"}
                        className="exchange-select mt-2 w-full"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3 sm:col-span-2">
                      <Button type="submit" disabled={busy}>
                        Save configuration revision
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!EVOLUTION_CAPABILITIES.repositoryImport}
                        title={EVOLUTION_BLOCKERS.git}
                      >
                        <LockKeyhole size={15} />
                        Import repository unavailable
                      </Button>
                    </div>
                  </form>
                  <h3 className="mt-8 text-lg">Configuration history</h3>
                  {!configs.length ? (
                    <p className="mt-3 text-sm text-muted-foreground">No revisions saved.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-border">
                      {configs.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-wrap justify-between gap-3 py-3 text-sm"
                        >
                          <span>
                            Revision {c.revision} · {c.branch} · {c.output_directory}
                          </span>
                          <time className="text-muted-foreground" dateTime={c.created_at}>
                            {new Date(c.created_at).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Up to 1,000 recent revisions across your projects are shown. A saved
                    configuration is not a deployment.
                  </p>
                </>
              )}
              <Unavailable title="Independent Git hosting" reason={EVOLUTION_BLOCKERS.git} />
              {view === "settings" && (
                <>
                  <Unavailable
                    title="Secrets and environment values"
                    reason="No project secret vault is connected. Store no private keys here; project runtime configuration needs an owner-reviewed server-side vault integration."
                  />
                  <ExistingControls />
                </>
              )}
            </>
          )}
          {view === "pull-requests" && (
            <Unavailable
              title="No pull request results available"
              reason={EVOLUTION_BLOCKERS.reviews}
              action="Review / merge unavailable"
            />
          )}
          {view === "actions" && (
            <Unavailable
              title="No build logs or artifacts available"
              reason={EVOLUTION_BLOCKERS.builds}
              action="Build / cancel unavailable"
            />
          )}
          {view === "migrations" && (
            <>
              <Unavailable
                title="No project migration runs available"
                reason={EVOLUTION_BLOCKERS.migrations}
                action="Apply migration unavailable"
              />
              <p className="py-4 text-sm text-muted-foreground">
                Evolution's own configuration schema is versioned separately; this page does not
                claim project databases have been migrated.
              </p>
            </>
          )}
          {view === "deployments" && (
            <Unavailable
              title="No staging releases available"
              reason={EVOLUTION_BLOCKERS.staging}
              action="Stage / rollback unavailable"
            />
          )}
          {view !== "settings" && <ExistingControls />}
        </>
      )}
    </section>
  );
}

function Unavailable({
  title,
  reason,
  action,
}: {
  title: string;
  reason: string;
  action?: string;
}) {
  return (
    <section className="mt-8 border-t border-border py-6">
      <h2 className="flex items-center gap-2 text-lg">
        <LockKeyhole size={17} className="text-muted-foreground" />
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{reason}</p>
      {action && (
        <Button className="mt-4" variant="outline" disabled title={reason}>
          {action}
        </Button>
      )}
    </section>
  );
}

function ExistingControls() {
  return (
    <div className="mt-8 border-t border-border py-6">
      <h2 className="text-lg">Existing OMNI / Jackboy controls</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/omni-terminal">OMNI Terminal & Stop</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/activation-approvals">Activation approvals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/omni-api-keys">Connections & keys</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/account-security">Account Security</Link>
        </Button>
      </div>
    </div>
  );
}
