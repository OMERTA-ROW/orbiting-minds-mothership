import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { workspaceRequest } from "@/lib/omni-workspace-link.server";
import type { RemoteReply } from "@/lib/omni-workspace";

const enabled = process.env["OMNI_WORKSPACE_HISTORICAL_TEST"] === "1";
const origin = process.env["OMNI_WORKSPACE_TEST_ORIGIN"] ?? "";
const cfg = { origin, clientId: "mothership-test", secret: "t".repeat(48), projectId: "omni" };
const ownerId = "f1b3d943-c6ee-4ed1-abce-f08ba1493734";
const call = (action: Parameters<typeof workspaceRequest>[1], payload: Record<string, unknown>) =>
  workspaceRequest(cfg, action, payload);

async function startSession() {
  const sessionId = randomUUID();
  await call("session.start", { ownerId, sessionId, agentId: "omni", provider: "none" });
  return sessionId;
}

async function startCommand(sessionId: string, command: string) {
  const jobId = randomUUID();
  await call("command.run", { sessionId, jobId, command });
  const reply = await call("step.decide", {
    ownerId,
    sessionId,
    jobId,
    stepId: "cmd",
    approve: true,
  });
  return { jobId, reply };
}

async function collect(sessionId: string, jobId: string, initial: RemoteReply) {
  const steps = [...initial.steps];
  let status = initial.job?.status;
  for (let i = 0; i < 50 && status !== "done" && status !== "failed" && status !== "stopped"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reply = await call("events.poll", { sessionId, jobId });
    status = reply.job?.status;
    steps.push(...reply.steps);
  }
  return {
    status,
    steps,
    stdout: steps
      .filter((step) => step.stream === "stdout")
      .map((step) => step.body)
      .join(""),
    stderr: steps
      .filter((step) => step.stream === "stderr")
      .map((step) => step.body)
      .join(""),
  };
}

(enabled ? describe : describe.skip)("disposable bubblewrap host supervisor", () => {
  it("uses isolated namespaces and the job cgroup for concurrent sessions", async () => {
    expect(process.platform).toBe("linux");
    expect(new URL(origin).hostname).toBe("127.0.0.1");
    const firstSession = await startSession();
    const secondSession = await startSession();
    const script = [
      'echo "pid=$(readlink /proc/self/ns/pid)"',
      'echo "net=$(readlink /proc/self/ns/net)"',
      'echo "mnt=$(readlink /proc/self/ns/mnt)"',
      'echo "uid=$(id -u)"',
      'echo "gid=$(id -g)"',
      'echo "uidmap=$(cat /proc/self/uid_map | xargs)"',
      'echo "gidmap=$(cat /proc/self/gid_map | xargs)"',
      "touch /work/identity-proof",
      "cat /proc/self/cgroup",
      "sleep 1",
    ].join("; ");
    try {
      const [firstJob, secondJob] = await Promise.all([
        startCommand(firstSession, script),
        startCommand(secondSession, script),
      ]);
      const [firstResult, secondResult] = await Promise.all([
        collect(firstSession, firstJob.jobId, firstJob.reply),
        collect(secondSession, secondJob.jobId, secondJob.reply),
      ]);
      const namespaceIds = (result: typeof firstResult, jobId: string) => {
        expect(result.status, result.stderr).toBe("done");
        expect(result.stdout).toContain(`job-${jobId}`);
        const values = Object.fromEntries(
          result.stdout
            .split("\n")
            .filter((line) => /^(pid|net|mnt|uid|gid|uidmap|gidmap)=/.test(line))
            .map((line) => line.split("=")),
        );
        for (const kind of ["pid", "net", "mnt"]) {
          expect(values[kind]).toMatch(new RegExp(`^${kind}:\\[\\d+\\]$`));
          expect(values[kind]).not.toBe(fs.readlinkSync(`/proc/self/ns/${kind}`));
        }
        expect(Number(values["uid"])).toBeGreaterThan(0);
        expect(values["gid"]).toBe(values["uid"]);
        expect(values["uidmap"]).toBe(`${values["uid"]} 0 1`);
        expect(values["gidmap"]).toBe(`${values["gid"]} 0 1`);
        return values;
      };
      const firstIds = namespaceIds(firstResult, firstJob.jobId);
      const secondIds = namespaceIds(secondResult, secondJob.jobId);
      for (const kind of ["pid", "net", "mnt"]) expect(firstIds[kind]).not.toBe(secondIds[kind]);
      expect(firstIds["uid"]).not.toBe(secondIds["uid"]);
      expect(firstIds["gid"]).not.toBe(secondIds["gid"]);
      const root = process.env["OMNI_WORKSPACE_TEST_ROOT"] ?? "";
      for (const [sessionId, ids] of [
        [firstSession, firstIds],
        [secondSession, secondIds],
      ] as const) {
        const proof = fs.statSync(`${root}/root/${sessionId}/work/identity-proof`);
        expect(proof.uid).toBe(Number(ids["uid"]));
        expect(proof.gid).toBe(Number(ids["gid"]));
      }
    } finally {
      await call("session.end", { sessionId: firstSession });
      await call("session.end", { sessionId: secondSession });
    }
  }, 15_000);

  it("excludes host state, inherited settings and network routes", async () => {
    const root = process.env["OMNI_WORKSPACE_TEST_ROOT"] ?? "";
    if (!/^\/tmp\/omni-workspace-ci\.[A-Za-z0-9]+$/.test(root))
      throw new Error("The test requires the disposable host fixture root.");
    const sessionId = await startSession();
    const script = [
      "id -u",
      "env",
      "test ! -e /sys && echo NO_SYS",
      "test ! -e /var/run/docker.sock && echo NO_DOCKER",
      "test ! -e /etc/resolv.conf && echo NO_RESOLVER",
      `test ! -e ${root}/root/.state/nonces.sqlite && echo NO_SERVICE_STATE`,
      "getent ahosts example.com >/dev/null 2>&1 && echo DNS_OPEN || echo DNS_BLOCKED",
      ...["127.0.0.1:18791", "169.254.169.254:80", "10.0.0.1:80", "1.1.1.1:443"].map(
        (address) =>
          `bash -c 'exec 3<>/dev/tcp/${address.replace(":", "/")}' 2>/dev/null && echo NETWORK_OPEN || echo NETWORK_BLOCKED`,
      ),
    ].join("; ");
    try {
      const job = await startCommand(sessionId, script);
      const result = await collect(sessionId, job.jobId, job.reply);
      expect(result.status, result.stderr).toBe("done");
      expect(Number(result.stdout.split("\n")[0])).toBeGreaterThan(0);
      expect(result.stdout).toContain("NO_SYS");
      expect(result.stdout).toContain("NO_DOCKER");
      expect(result.stdout).toContain("NO_RESOLVER");
      expect(result.stdout).toContain("NO_SERVICE_STATE");
      expect(result.stdout).toContain("DNS_BLOCKED");
      expect(result.stdout).not.toContain("DNS_OPEN");
      expect(result.stdout.match(/NETWORK_BLOCKED/g)).toHaveLength(4);
      expect(result.stdout).not.toContain("NETWORK_OPEN");
      expect(result.stdout).not.toContain("OMNI_SANDBOX");
      expect(result.stdout).not.toContain("OPENAI_API_KEY");
      expect(result.stdout).not.toContain("sk-test-not-real-key-0000000000");
      expect(result.stdout).not.toContain("t".repeat(48));
      const environmentNames = result.stdout
        .split("\n")
        .filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
        .map((line) => line.split("=")[0]);
      for (const name of environmentNames)
        expect(["PATH", "HOME", "LANG", "TERM", "PWD", "SHLVL", "_"]).toContain(name);
    } finally {
      await call("session.end", { sessionId });
    }
  }, 15_000);

  it("terminates a detached descendant before acknowledging Stop", async () => {
    const sessionId = await startSession();
    const script =
      `setsid bash -c 'echo "DETACHED_PID=$$"; echo "DETACHED_SID=$(ps -o sid= -p $$ | tr -d " ")"; exec sleep 30' & ` +
      "cat /proc/self/cgroup; sleep 30";
    try {
      const { jobId, reply } = await startCommand(sessionId, script);
      let output = reply.steps
        .filter((step) => step.stream === "stdout")
        .map((step) => step.body)
        .join("");
      for (let i = 0; i < 10 && !output.includes("DETACHED_SID="); i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const polled = await call("events.poll", { sessionId, jobId });
        output += polled.steps
          .filter((step) => step.stream === "stdout")
          .map((step) => step.body)
          .join("");
      }
      const pid = /^DETACHED_PID=(\d+)$/m.exec(output)?.[1];
      const sid = /^DETACHED_SID=(\d+)$/m.exec(output)?.[1];
      expect(pid, output).toBeDefined();
      expect(sid).toBe(pid);
      const cgroup = /^0::(\/[^\n]+)$/m.exec(output)?.[1];
      expect(cgroup).toMatch(new RegExp(`/job-${jobId}$`));
      if (!cgroup || cgroup.includes("..")) throw new Error("Invalid job cgroup path.");
      const groupPath = `/sys/fs/cgroup${cgroup}`;
      expect(fs.readFileSync(`${groupPath}/cgroup.events`, "utf8")).toMatch(/^populated 1$/m);
      await call("job.stop", { sessionId, jobId });
      expect(fs.existsSync(groupPath)).toBe(false);
      expect((await call("events.poll", { sessionId, jobId })).job?.status).toBe("stopped");
    } finally {
      await call("session.end", { sessionId });
    }
  }, 15_000);
});
