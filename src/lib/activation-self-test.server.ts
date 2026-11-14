/**
 * Drives one owner-authorized Step 8 protocol self-test through the existing signed
 * Jackboy client. Server-only. The stage comes from the attempt's audit trail, so a
 * retry continues the same job: it never submits twice and never runs twice.
 */
import {
  SELF_TEST_MAX_POLLS,
  SELF_TEST_POLL_GAP_MS,
  SELF_TEST_STATUS_RESERVE_MS,
  isUnfinished,
  type AttemptStage,
  type SelfTestJob,
} from "./activation-self-test";

export interface SelfTestRunner {
  execute(action: "submit" | "run" | "status", jobId: string): Promise<SelfTestJob>;
}

export interface DriveOptions {
  deadline: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called just before the run request is sent; a later failure then means "outcome unknown". */
  onRunSent?: () => void;
}

export async function driveSelfTest(
  runner: SelfTestRunner,
  stage: Extract<AttemptStage, "new" | "submit_unconfirmed" | "queued" | "run_requested">,
  jobId: string,
  options: DriveOptions,
): Promise<{ job: SelfTestJob; polls: number }> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let job: SelfTestJob | null = null;

  if (stage === "new") {
    job = await runner.execute("submit", jobId);
    if (job.status !== "queued") return { job, polls: 0 };
  } else if (stage === "submit_unconfirmed") {
    // The submit may or may not have reached Jackboy: ask, never resubmit.
    job = await runner.execute("status", jobId);
    if (job.status !== "queued") return finish(job);
  } else if (stage === "run_requested") {
    job = await runner.execute("status", jobId);
    return finish(job);
  }

  // Queued and never run by this attempt: send the single run request.
  options.onRunSent?.();
  job = await runner.execute("run", jobId);
  return finish(job);

  async function finish(current: SelfTestJob) {
    let polls = 0;
    while (
      isUnfinished(current.status) &&
      polls < SELF_TEST_MAX_POLLS &&
      options.deadline - now() > SELF_TEST_STATUS_RESERVE_MS + SELF_TEST_POLL_GAP_MS
    ) {
      await sleep(SELF_TEST_POLL_GAP_MS);
      current = await runner.execute("status", jobId);
      polls += 1;
    }
    return { job: current, polls };
  }
}
