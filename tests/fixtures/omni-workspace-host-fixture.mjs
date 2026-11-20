// Disposable Linux fixture only. Production continues to use the quarantined entrypoint.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (
  process.platform !== "linux" ||
  process.getuid?.() !== 0 ||
  !process.env.OMNI_WORKSPACE_DELEGATED_CGROUP ||
  process.env.OMNI_SANDBOX_CLIENT_ID !== "mothership-test" ||
  process.env.OMNI_SANDBOX_HMAC_SECRET !== "t".repeat(48)
)
  throw new Error("The host fixture requires disposable Linux and synthetic credentials.");

const serviceDir = path.resolve("services/omni-sandbox");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omni-host-fixture-"));
let source = fs.readFileSync(path.join(serviceDir, "server.mjs"), "utf8");

function replaceOnce(oldText, newText) {
  const first = source.indexOf(oldText);
  if (first < 0 || source.indexOf(oldText, first + oldText.length) !== -1)
    throw new Error(`Fixture source anchor is missing or ambiguous: ${oldText.slice(0, 80)}`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

function replaceSection(start, end, replacement) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0 || source.indexOf(start, first + start.length) !== -1)
    throw new Error(`Fixture source section is missing or ambiguous: ${start}`);
  source = source.slice(0, first) + replacement + source.slice(last);
}

replaceOnce(
  'from "./recovery.mjs";',
  `from ${JSON.stringify(pathToFileURL(path.join(serviceDir, "recovery.mjs")).href)};\n` +
    `import { startWorkspaceCommand } from ${JSON.stringify(pathToFileURL(path.join(serviceDir, "supervisor.mjs")).href)};`,
);
replaceOnce(
  'if (!["health.check", "job.stop", "agent.stop", "session.end"].includes(action)) {',
  'if (false && !["health.check", "job.stop", "agent.stop", "session.end"].includes(action)) {',
);
replaceOnce(
  "        // Do not consume an approval until a real supervisor can accept it.\n" +
    '        if (b.approve && job.pending.kind === "command")\n' +
    '          throw new Refusal("The isolated workspace command supervisor is unavailable.");\n',
  "",
);
replaceOnce("          run(s, job, command);", "          await run(s, job, command);");
replaceOnce(
  'for (const j of s.jobs.values()) if (!b.jobId || j.id === b.jobId) killJob(j, "owner");',
  'for (const j of s.jobs.values()) if (!b.jobId || j.id === b.jobId) await killJob(j, "owner");',
);
replaceOnce(
  'for (const s of sessions.values()) for (const j of s.jobs.values()) killJob(j, "owner");',
  'for (const s of sessions.values()) for (const j of s.jobs.values()) await killJob(j, "owner");',
);
replaceOnce('if (s) endSession(s, "owner");', 'if (s) await endSession(s, "owner");');
replaceOnce(
  '        endSession(s, "timeout");',
  '        void endSession(s, "timeout").catch((error) => console.error("Fixture cleanup failed:", error));',
);

replaceSection(
  "  function killJob(job, reason) {",
  "  const reaper =",
  `
  async function killJob(job, reason) {
    if (job.control && job.state === "running") {
      job.stopReason = reason;
      if (reason === "time limit")
        job.events.push({ stream: "system", text: \`Time limit of \${c.limits.commandTimeoutSec}s reached; command stopped.\` });
      await job.control.stop();
      await job.finished;
    } else if (job.state === "awaiting_approval" || job.state === "queued") {
      job.pending = null;
      job.state = "stopped";
    }
  }
  async function endSession(s, reason) {
    for (const j of s.jobs.values()) await killJob(j, reason);
    fs.rmSync(s.dir, { recursive: true, force: true });
    fs.rmSync(s.mirror, { recursive: true, force: true });
    sessions.delete(s.id);
  }
`,
);

replaceSection(
  "  function run(s, job, command) {",
  "  // -------------------------------------------------------------- git",
  `
  async function run(s, job, command) {
    job.state = "running";
    let control;
    try {
      control = await startWorkspaceCommand({
        parent: process.env.OMNI_WORKSPACE_DELEGATED_CGROUP,
        jobId: job.id, work: s.work, uid: s.uid, limits: c.limits, command,
      });
    } catch (error) {
      console.error("Fixture supervisor startup failed:", error.message);
      job.state = "failed";
      job.events.push({ stream: "system", text: \`Supervisor startup failed: \${error.message}\` });
      job.events.push({ stream: "exit", code: -1, signal: null });
      return;
    }
    job.control = control;
    const cap = c.limits.outputCapBytes;
    const onData = (stream) => (buffer) => {
      if (stream === "stderr") console.error("Fixture command stderr:", buffer.toString("utf8"));
      const part = buffer.subarray(0, Math.max(0, cap - job.outBytes));
      job.outBytes += part.length;
      if (part.length) job.events.push({ stream, text: part.toString("utf8") });
      if (job.outBytes >= cap && !job.stopReason) {
        job.events.push({ stream: "system", text: \`Output cap of \${cap} bytes reached; command stopped.\` });
        void killJob(job, "output cap").catch((error) => console.error("Fixture Stop failed:", error));
      }
    };
    control.child.stdout.on("data", onData("stdout"));
    control.child.stderr.on("data", onData("stderr"));
    const timer = setTimeout(() => {
      void killJob(job, "time limit").catch((error) => console.error("Fixture Stop failed:", error));
    }, c.limits.commandTimeoutSec * 1000);
    job.finished = control.completed.then(({ code, signal }) => {
      clearTimeout(timer);
      job.exit = job.stopReason ? -1 : (code ?? -1);
      job.state = job.stopReason ? "stopped" : code === 0 ? "done" : "failed";
      job.events.push({ stream: "exit", code: job.exit, signal: signal ?? null });
    }, (error) => {
      clearTimeout(timer);
      job.state = "failed";
      job.events.push({ stream: "system", text: \`Cgroup termination was not confirmed: \${error.message}\` });
    });
  }

`,
);

const modulePath = path.join(temp, "server.mjs");
fs.writeFileSync(modulePath, source, { mode: 0o600 });
try {
  const { createSandbox, loadConfig } = await import(pathToFileURL(modulePath).href);
  const c = loadConfig();
  const sb = createSandbox(c);
  await sb.ready;
  sb.server.listen(c.port, "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      sb.close();
      fs.rmSync(temp, { recursive: true, force: true });
      process.exit(0);
    });
} catch (error) {
  fs.rmSync(temp, { recursive: true, force: true });
  throw error;
}
