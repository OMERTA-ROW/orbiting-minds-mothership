import { startWorkspaceCommand } from "./supervisor.mjs";

// The caller must enforce admission and retain its durable claim until cleanup.
export function launchWorkspaceJob(job, options, onCleaned, start = startWorkspaceCommand) {
  let control;
  let reason;
  let stopPromise;
  let timer;
  job.state = "running";

  const stop = (why) => {
    if (!reason) {
      reason = why;
      if (why === "time limit")
        job.events.push({
          stream: "system",
          text: `Time limit of ${options.limits.commandTimeoutSec}s reached; command stopped.`,
        });
      if (why === "output limit")
        job.events.push({
          stream: "system",
          text: `Output cap of ${options.limits.outputCapBytes} bytes reached; command stopped.`,
        });
    }
    return (stopPromise ??= (async () => {
      const active = await started;
      if (active) await active.stop();
      await finished;
    })());
  };
  const requestStop = (why) => {
    void stop(why).catch((error) =>
      console.error("Workspace termination was not confirmed:", error.message),
    );
  };
  const started = (async () => {
    control = await start(options);
    for (const [stream, pipe] of [
      ["stdout", control.child.stdout],
      ["stderr", control.child.stderr],
    ]) {
      pipe.on("data", (chunk) => {
        const remaining = Math.max(0, options.limits.outputCapBytes - job.outBytes);
        const part = chunk.subarray(0, remaining);
        job.outBytes += part.length;
        if (part.length) job.events.push({ stream, text: part.toString("utf8") });
        if (chunk.length > remaining || job.outBytes >= options.limits.outputCapBytes)
          requestStop("output limit");
      });
    }
    return control;
  })();
  const finished = (async () => {
    try {
      const active = await started;
      const result = await active.completed;
      await onCleaned();
      job.exit = reason ? -1 : (result.code ?? -1);
      job.state = reason ? "stopped" : result.code === 0 ? "done" : "failed";
      job.events.push({ stream: "exit", code: job.exit, signal: result.signal ?? null });
    } catch (error) {
      job.state = "failed";
      job.events.push({
        stream: "system",
        text: "Workspace startup or cleanup failed; termination is unverified.",
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })();
  void finished.catch((error) => console.error("Workspace command failed:", error.message));
  timer = setTimeout(() => requestStop("time limit"), options.limits.commandTimeoutSec * 1000);
  job.control = { stop, finished };
  return job.control;
}
