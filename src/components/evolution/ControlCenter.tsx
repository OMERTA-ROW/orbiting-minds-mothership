import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  ExternalLink,
  FolderGit2,
  Github,
  Globe,
  LockKeyhole,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLONE_BLOCKER, suggestRepo } from "@/lib/evolution-control";
import { controlCenterQuery } from "@/lib/evolution-query";
import {
  checkWebsite,
  deleteDirectoryEntry,
  importGithubRepos,
  saveControlSettings,
  saveDirectoryEntry,
} from "@/lib/evolution-control.functions";

type Data = Extract<
  Awaited<ReturnType<typeof import("@/lib/evolution-control.functions").readControlCenter>>,
  { ok: true }
>;
type Entry = Data["directory"][number];
const when = (t?: string | null) => (t ? new Date(t).toLocaleString() : "never");
const field = "h-9 rounded-md border border-border bg-background/70 px-2 text-sm";

export function ControlCenter() {
  const initial = useSuspenseQuery(controlCenterQuery).data;
  const query = useQuery({ ...controlCenterQuery, initialData: initial });
  const cache = useQueryClient();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const inFlight = useRef(false);
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const importFn = useServerFn(importGithubRepos);
  const saveFn = useServerFn(saveDirectoryEntry);
  const delFn = useServerFn(deleteDirectoryEntry);
  const webFn = useServerFn(checkWebsite);
  const setFn = useServerFn(saveControlSettings);
  const data = query.data;

  async function act(key: string, work: () => Promise<string>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(key);
    setNotice("");
    try {
      setNotice(await work());
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "That did not work. Nothing was recorded as successful.",
      );
    } finally {
      try {
        await cache.invalidateQueries({ queryKey: controlCenterQuery.queryKey });
      } finally {
        inFlight.current = false;
        setBusy("");
      }
    }
  }
  const runImport = () =>
    act("import", async () => {
      const r = await importFn();
      return `GitHub import ${r.status}: ${r.repos} repositories from ${r.pages} pages.${r.errors.length ? ` Problems: ${r.errors.join("; ")}` : ""}`;
    });

  // Metadata import runs automatically once per sign-in session when GitHub is connected and the last import is over a day old.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !data.ok || !data.setup.github) return;
    auto.current = true;
    const key = "evolution-auto-import";
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Without durable browser deduplication, leave automatic import off; manual import works.
      return;
    }
    const last = data.runs.find((r) => r.status === "succeeded");
    if (!last || Date.now() - new Date(last.started_at).getTime() > 86_400_000) void runImport();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data.ok)
    return (
      <Shell>
        <div className="border-y border-border py-8">
          <h2 className="text-lg">Owner workspace unavailable</h2>
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {data.message}
          </p>
        </div>
      </Shell>
    );

  const repoById = new Map(data.repos.map((r) => [r.github_repo_id, r]));
  const matched = new Set(data.directory.map((d) => d.github_repo_id).filter(Boolean));
  const unmatched = data.repos.filter((r) => !matched.has(r.github_repo_id));
  const lastRun = data.runs[0];
  const storageKb = data.repos.reduce((n, r) => n + (r.size_kb ?? 0), 0);

  return (
    <Shell checkedAt={data.checkedAt}>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href="https://lovable.dev/settings/connectors" target="_blank" rel="noreferrer">
            <Github size={15} /> {data.setup.github ? "Review GitHub connection" : "Connect GitHub"}
          </a>
        </Button>
        <Button disabled={!data.setup.github || !!busy} onClick={() => void runImport()}>
          <RefreshCw size={15} className={busy === "import" ? "animate-spin" : ""} />{" "}
          {busy === "import" ? "Importing…" : "Import all authorized repositories"}
        </Button>
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            void act("refresh", async () => {
              const result = await query.refetch();
              if (result.error || !result.data?.ok)
                throw new Error(
                  "Project records could not be refreshed. Check owner access, then retry.",
                );
              return "Saved project records refreshed. Repository contents were not cloned or changed.";
            })
          }
        >
          <RefreshCw size={15} /> Refresh records
        </Button>
        <Button variant="outline" disabled title={CLONE_BLOCKER}>
          <LockKeyhole size={15} /> Clone all
        </Button>
        <Button variant="outline" onClick={() => setEditing({ name: "" })}>
          <Plus size={15} /> Add project
        </Button>
        <Button asChild variant="outline">
          <Link to="/cloud-services" hash="add-cloud-connection">
            <Cloud size={15} /> Connect cloud server
          </Link>
        </Button>
      </div>
      {notice && (
        <p role="status" className="my-4 break-words border-l-2 border-primary pl-4 text-sm">
          {notice}
        </p>
      )}

      <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <Fact label="Last GitHub import">
          {lastRun
            ? `${lastRun.status} · ${when(lastRun.finished_at ?? lastRun.started_at)} · ${lastRun.repos_seen} repos, ${lastRun.pages} pages`
            : "Not run yet"}
          {lastRun?.error && <span className="mt-1 block text-destructive">{lastRun.error}</span>}
          {lastRun?.status === "failed" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!!busy}
              onClick={() => void runImport()}
            >
              Retry
            </Button>
          )}
        </Fact>
        <Fact label="Imported repositories">
          {data.repos.length} unique (by GitHub ID) · {(storageKb / 1024).toFixed(1)} MB on GitHub ·
          0 cloned
        </Fact>
        <Fact label="Clone queue">{CLONE_BLOCKER}</Fact>
      </div>

      <Settings
        data={data}
        busy={!!busy}
        onSave={(v) =>
          act(
            "settings",
            async () => (
              await setFn({ data: v }),
              "Settings saved. Clone-all is only a preference until an executor exists."
            ),
          )
        }
      />

      {editing && (
        <EntryForm
          entry={editing}
          data={data}
          busy={!!busy}
          onCancel={() => setEditing(null)}
          onSave={(v) =>
            act("save", async () => (await saveFn({ data: v }), setEditing(null), "Project saved."))
          }
        />
      )}

      <h2 className="mt-10 flex items-center gap-2 text-xl">
        <FolderGit2 size={20} className="text-primary" /> My Projects ({data.directory.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Directory entries are your own list, not verified connections.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {data.directory.map((d) => {
          const repo = d.github_repo_id ? repoById.get(d.github_repo_id) : undefined;
          const suggestion = !d.github_repo_id ? suggestRepo(d.name, unmatched) : undefined;
          return (
            <li
              key={d.id}
              className="rounded-lg border border-border bg-background/60 p-4 backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base">{d.name}</h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${d.name}`}
                    disabled={!!busy}
                    onClick={() =>
                      confirm(
                        `Remove ${d.name} from your directory? Nothing on GitHub or Lovable changes.`,
                      ) &&
                      void act(
                        "del",
                        async () => (
                          await delFn({ data: { id: d.id } }),
                          "Removed from directory."
                        ),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div>
                  Lovable:{" "}
                  {d.lovable_project_id ? (
                    <a
                      className="underline"
                      href={`https://lovable.dev/projects/${d.lovable_project_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      open project
                    </a>
                  ) : (
                    "not linked"
                  )}
                </div>
                <div>
                  Website:{" "}
                  {d.website_url ? (
                    <a className="underline" href={d.website_url} target="_blank" rel="noreferrer">
                      {d.website_url}
                    </a>
                  ) : (
                    "not linked"
                  )}
                  {d.website_url && (
                    <>
                      {" "}
                      ·{" "}
                      {d.website_checked_at
                        ? `HTTP ${d.website_status || "unreachable"} at ${when(d.website_checked_at)}`
                        : "not checked"}
                    </>
                  )}
                </div>
                <div>
                  Repository:{" "}
                  {repo ? (
                    <>
                      {repo.full_name} · {repo.default_branch ?? "no branch"} · pushed{" "}
                      {when(repo.pushed_at)}
                    </>
                  ) : d.github_repo_id ? (
                    `GitHub ID ${d.github_repo_id} (not in latest import)`
                  ) : (
                    "not matched"
                  )}
                </div>
                <div>Local clone: not cloned (locked pending sandbox)</div>
                <div>
                  Cloud: {data.cloud.find((c) => c.id === d.cloud_connection_id)?.label ?? "none"}
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {repo && (
                  <Button asChild size="sm" variant="outline">
                    <a href={repo.html_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> Open repository
                    </a>
                  </Button>
                )}
                {suggestion && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      void act(
                        "match",
                        async () => (
                          await saveFn({
                            data: toInput({ ...d, github_repo_id: suggestion.github_repo_id }),
                          }),
                          `Matched to ${suggestion.full_name}.`
                        ),
                      )
                    }
                  >
                    Match {suggestion.full_name}
                  </Button>
                )}
                {d.website_url ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      void act("web", async () => {
                        const r = await webFn({ data: { id: d.id } });
                        return r.status
                          ? `Website answered HTTP ${r.status}.`
                          : "Website could not be reached.";
                      })
                    }
                  >
                    <Globe size={13} /> Check website
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(d)}>
                    <Globe size={13} /> Link website
                  </Button>
                )}
                {!d.lovable_project_id && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(d)}>
                    Link Lovable project
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 text-xl">
        Imported repositories not on a project card ({unmatched.length})
      </h2>
      {data.repos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {data.setup.github
            ? "No repositories imported yet. Run the import."
            : "Connect GitHub to import repositories."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-background/60">
          {unmatched.map((r) => (
            <li
              key={r.github_repo_id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
            >
              <span>
                {r.full_name}{" "}
                <span className="text-xs text-muted-foreground">
                  {r.private ? "private" : "public"} · {r.default_branch ?? "—"}
                  {r.archived ? " · archived" : ""}
                </span>
              </span>
              <span className="flex gap-2">
                <Button asChild size="sm" variant="ghost">
                  <a href={r.html_url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void act(
                      "add",
                      async () => (
                        await saveFn({
                          data: {
                            name: r.full_name.split("/")[1] ?? r.full_name,
                            githubRepoId: r.github_repo_id,
                            lovableProjectId: "",
                            websiteUrl: "",
                            cloudConnectionId: "",
                            notes: "",
                          },
                        }),
                        "Added to My Projects."
                      ),
                    )
                  }
                >
                  Add as project
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <CloudAssociations data={data} />
    </Shell>
  );
}

function toInput(d: Partial<Entry>) {
  return {
    ...(d.id ? { id: d.id } : {}),
    name: d.name ?? "",
    lovableProjectId: d.lovable_project_id ?? "",
    websiteUrl: d.website_url ?? "",
    githubRepoId: d.github_repo_id ?? null,
    cloudConnectionId: d.cloud_connection_id ?? "",
    notes: d.notes ?? "",
  };
}

function Shell({ children, checkedAt }: { children: React.ReactNode; checkedAt?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <header className="border-b border-border pb-6">
        <p className="eyebrow">Evolution 2 · control center</p>
        <h1 className="mt-3 flex items-center gap-3 text-3xl">
          <FolderGit2 className="text-primary" size={26} /> My Projects
        </h1>
        {checkedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Records checked {new Date(checkedAt).toLocaleString()}
          </p>
        )}
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Settings({
  data,
  busy,
  onSave,
}: {
  data: Data;
  busy: boolean;
  onSave: (v: { cloneAllOptIn: boolean; githubOrgs: string[] }) => void;
}) {
  const [optIn, setOptIn] = useState(data.settings.clone_all_opt_in);
  const [orgs, setOrgs] = useState(data.settings.github_orgs.join(", "));
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background/60 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          cloneAllOptIn: optIn,
          githubOrgs: orgs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
    >
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} /> Clone
        all authorized repositories automatically (when an executor exists)
      </label>
      <label className="flex flex-col gap-1">
        Extra GitHub organizations
        <Input value={orgs} onChange={(e) => setOrgs(e.target.value)} className="h-9 w-64" />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        Save settings
      </Button>
    </form>
  );
}

function EntryForm({
  entry,
  data,
  busy,
  onSave,
  onCancel,
}: {
  entry: Partial<Entry>;
  data: Data;
  busy: boolean;
  onSave: (v: ReturnType<typeof toInput>) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(toInput(entry));
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="mt-6 grid gap-3 rounded-lg border border-primary/40 bg-background/80 p-4 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <h2 className="text-lg sm:col-span-2">{entry.id ? `Edit ${entry.name}` : "Add project"}</h2>
      <label className="flex flex-col gap-1">
        Name
        <Input required value={v.name} onChange={set("name")} />
      </label>
      <label className="flex flex-col gap-1">
        Lovable project ID
        <Input
          value={v.lovableProjectId}
          onChange={set("lovableProjectId")}
          placeholder="xxxxxxxx-xxxx-…"
        />
      </label>
      <label className="flex flex-col gap-1">
        Website (https)
        <Input
          value={v.websiteUrl}
          onChange={set("websiteUrl")}
          placeholder="https://example.com"
        />
      </label>
      <label className="flex flex-col gap-1">
        GitHub repository
        <select
          className={field}
          value={v.githubRepoId ?? ""}
          onChange={(e) =>
            setV({ ...v, githubRepoId: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">Not matched</option>
          {data.repos.map((r) => (
            <option key={r.github_repo_id} value={r.github_repo_id}>
              {r.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Cloud server
        <select className={field} value={v.cloudConnectionId} onChange={set("cloudConnectionId")}>
          <option value="">None</option>
          {data.cloud.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.status})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Notes
        <Input value={v.notes} onChange={set("notes")} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CloudAssociations({ data }: { data: Data }) {
  const linked = data.directory.filter((entry) => entry.cloud_connection_id).length;
  return (
    <section id="cloud" className="mt-10 border-t border-border pt-6">
      <h2 className="flex items-center gap-2 text-xl">
        <Cloud size={20} className="text-primary" /> Project cloud associations
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {linked} of {data.directory.length} project records have a saved cloud association. Add,
        check and remove provider connections in Cloud Services; project associations remain
        editable here.
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/cloud-services">Manage cloud connections</Link>
      </Button>
    </section>
  );
}
