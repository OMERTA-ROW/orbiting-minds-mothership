import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Cloud,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLOUD_PROVIDERS, type CloudProvider } from "@/lib/evolution-control";
import { controlCenterQuery } from "@/lib/evolution-query";
import {
  addCloudConnection,
  checkCloudConnection,
  removeCloudConnection,
} from "@/lib/evolution-control.functions";
import { OwnerConsoleShell } from "./OwnerConsoleShell";
import { ConsolePanel, EmptyState, MetricCard, StateLine } from "./ConsolePrimitives";
import { consoleDate } from "./console-utils";

export function CloudServices() {
  const initial = useSuspenseQuery(controlCenterQuery).data;
  const query = useQuery({ ...controlCenterQuery, initialData: initial });
  const cache = useQueryClient();
  const add = useServerFn(addCloudConnection);
  const check = useServerFn(checkCloudConnection);
  const remove = useServerFn(removeCloudConnection);
  const [provider, setProvider] = useState<CloudProvider>("railway");
  const [label, setLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const inFlight = useRef(false);
  const data = query.data;

  async function act(key: string, work: () => Promise<string>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(key);
    setNotice("");
    try {
      setNotice(await work());
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The operation failed. No success was recorded.",
      );
    } finally {
      await cache.invalidateQueries({ queryKey: controlCenterQuery.queryKey });
      inFlight.current = false;
      setBusy("");
    }
  }

  return (
    <OwnerConsoleShell area="cloud">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">OMNI Block · infrastructure</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Cloud Services
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Real saved provider connections and on-demand read-only checks. No server is created,
              deployed or purchased from this workspace.
            </p>
          </div>
          <Button
            variant="signal"
            disabled={query.isFetching || Boolean(busy)}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} /> Refresh records
          </Button>
        </header>

        {!data.ok ? (
          <ConsolePanel title="Cloud workspace unavailable">
            <EmptyState>{data.message}</EmptyState>
            <Button asChild variant="signal" className="mt-4">
              <Link to="/account-security">Open Account Security</Link>
            </Button>
          </ConsolePanel>
        ) : (
          <>
            <section
              aria-label="Cloud resource metrics"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
            >
              <MetricCard
                label="Instances"
                value="Not verified"
                note={`${data.cloud.length} saved provider connections; instance inventory is not connected`}
                icon={Server}
              />
              <MetricCard
                label="Storage"
                value="Not connected"
                note="No storage inventory source"
                icon={HardDrive}
              />
              <MetricCard
                label="Compute"
                value="Not connected"
                note="No compute telemetry source"
                icon={Cpu}
              />
              <MetricCard
                label="Memory"
                value="Not connected"
                note="No memory telemetry source"
                icon={MemoryStick}
              />
              <MetricCard
                label="Bandwidth"
                value="Not connected"
                note="No network metering source"
                icon={Network}
              />
            </section>

            {notice && (
              <p
                role="status"
                className="rounded-xl border border-gold/25 bg-console-panel/90 px-4 py-3 text-sm text-foreground"
              >
                {notice}
              </p>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <ConsolePanel
                title="Server Connections"
                description={`Saved records checked ${consoleDate(data.checkedAt)}. A connection is not an instance inventory.`}
              >
                {data.cloud.length ? (
                  <div className="overflow-x-auto rounded-xl border border-gold/15">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="bg-console-raised/80 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Connection</th>
                          <th className="px-3 py-3 font-medium">Provider</th>
                          <th className="px-3 py-3 font-medium">Status</th>
                          <th className="px-3 py-3 font-medium">Last checked</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cloud.map((connection) => (
                          <tr key={connection.id} className="border-t border-gold/10 align-top">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">{connection.label}</p>
                              {connection.detail && (
                                <p className="mt-1 max-w-64 text-[10px] leading-4 text-muted-foreground">
                                  {connection.detail}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-gold-light">
                              {CLOUD_PROVIDERS[connection.provider as CloudProvider]?.name ??
                                connection.provider}
                            </td>
                            <td className="px-3 py-3 capitalize text-muted-foreground">
                              {connection.status.replaceAll("_", " ")}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {consoleDate(connection.checked_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    void act(
                                      `check:${connection.id}`,
                                      async () =>
                                        (await check({ data: { id: connection.id } })).detail,
                                    )
                                  }
                                >
                                  Check
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Remove ${connection.label}`}
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    void act(
                                      `remove:${connection.id}`,
                                      async () => (
                                        await remove({ data: { id: connection.id } }),
                                        "Cloud connection removed."
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>
                    No cloud servers added. Add a provider connection below; this does not create
                    infrastructure.
                  </EmptyState>
                )}

                <form
                  id="add-cloud-connection"
                  className="mt-5 grid gap-3 rounded-xl border border-gold/15 bg-console-deep/45 p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!label.trim()) return;
                    void act("add", async () => {
                      await add({ data: { provider, label } });
                      setLabel("");
                      return "Cloud connection added. Use Check to verify it; nothing was deployed.";
                    });
                  }}
                >
                  <label className="text-xs text-muted-foreground">
                    Provider
                    <select
                      className="exchange-select mt-2 w-full bg-console-panel"
                      value={provider}
                      onChange={(event) => setProvider(event.target.value as CloudProvider)}
                      aria-label="Cloud provider"
                    >
                      {(Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((item) => (
                        <option key={item} value={item}>
                          {CLOUD_PROVIDERS[item].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Connection label
                    <Input
                      id="cloud-label"
                      required
                      maxLength={80}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="e.g. Existing staging host"
                      className="mt-2 border-gold/20 bg-console-panel"
                    />
                  </label>
                  <Button type="submit" variant="cosmic" disabled={Boolean(busy)}>
                    <Plus /> Add connection
                  </Button>
                </form>
                <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {(Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((item) => (
                    <p key={item} className="rounded-lg border border-gold/10 p-3">
                      {CLOUD_PROVIDERS[item].name}:{" "}
                      {data.setup.credentials[item] ? (
                        "credential saved server-side"
                      ) : (
                        <>
                          missing credential ·{" "}
                          <a
                            className="text-gold-light underline"
                            href={CLOUD_PROVIDERS[item].docs}
                            target="_blank"
                            rel="noreferrer"
                          >
                            provider documentation
                          </a>{" "}
                          · add {CLOUD_PROVIDERS[item].secret} in Project Settings → Secrets
                        </>
                      )}
                    </p>
                  ))}
                </div>
              </ConsolePanel>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
                <ConsolePanel
                  title="Resource Gauges"
                  description="No utilization telemetry is connected."
                >
                  {["CPU", "Memory", "Storage", "Bandwidth"].map((resource) => (
                    <div key={resource} className="border-b border-border py-3 last:border-0">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">{resource}</span>
                        <span className="text-foreground">Not connected</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-console-raised" aria-hidden />
                    </div>
                  ))}
                </ConsolePanel>
                <ConsolePanel
                  title="Quick Actions"
                  description="Read-only or existing destinations."
                >
                  <div className="grid gap-2">
                    <Button
                      variant="signal"
                      className="justify-start"
                      onClick={() => document.getElementById("cloud-label")?.focus()}
                    >
                      <Plus /> Add provider connection
                    </Button>
                    <Button asChild variant="signal" className="justify-start">
                      <Link to="/projects">
                        <Cloud /> Link a project
                      </Link>
                    </Button>
                    <Button asChild variant="signal" className="justify-start">
                      <Link to="/deployments">
                        <Rocket /> Deployment status
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      disabled
                      title="No verified instance-creation provider flow is connected."
                    >
                      <Server /> Create instance unavailable
                    </Button>
                  </div>
                </ConsolePanel>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <ConsolePanel
                title="Deployment History"
                description="No staging deployment service is connected."
              >
                <EmptyState>
                  Not connected. No deployment records are shown or inferred. Staging and rollback
                  still require immutable artifacts and verified recovery.
                </EmptyState>
                <Button asChild variant="ghost" size="sm" className="mt-3 px-0 text-gold-light">
                  <Link to="/deployments">Open existing deployment status</Link>
                </Button>
              </ConsolePanel>
              <ConsolePanel
                title="Infrastructure Health"
                description="Only saved provider-check results appear here."
              >
                {data.cloud.length ? (
                  data.cloud.map((connection) => (
                    <StateLine
                      key={connection.id}
                      label={connection.label}
                      value={`${connection.status.replaceAll("_", " ")} · ${consoleDate(connection.checked_at)}`}
                    />
                  ))
                ) : (
                  <EmptyState>
                    Not verified. Add and check a provider connection to record account evidence.
                  </EmptyState>
                )}
                <StateLine
                  label="Owned host recovery"
                  value="Phase 2C evidence review remains required"
                />
                <Button asChild variant="ghost" size="sm" className="mt-3 px-0 text-gold-light">
                  <Link to="/repositories">
                    <ShieldCheck /> Open integrity checks
                  </Link>
                </Button>
              </ConsolePanel>
            </div>
          </>
        )}
      </div>
    </OwnerConsoleShell>
  );
}
