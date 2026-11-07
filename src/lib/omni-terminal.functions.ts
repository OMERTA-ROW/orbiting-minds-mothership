/**
 * OMNI Terminal server functions. Owner-only (verified email, owner role, aal2).
 * They read status, record commands, hold tasks and engage/release the
 * Emergency Stop. Nothing here executes code, dispatches tasks, flips
 * switches, writes secrets, deploys or calls CODE/Jackboy with credentials.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { noteProblem } from "./activation-approvals";
import {
  commandInput,
  describeProbe,
  respond,
  stopInput,
  summarize,
  taskInput,
  type CommandResult,
} from "./omni-terminal";

type RpcError = { code?: string; message: string } | null;

function ruleMessage(error: RpcError, fallback: string) {
  if (!error) return null;
  if (error.message.includes("Fresh two-factor")) return "Re-verify with your authenticator first.";
  // 22023 messages are written by the terminal functions and contain no data.
  if (error.code === "22023") return error.message;
  return fallback;
}

async function ownerContext(context: {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
}) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

export const readOmniTerminal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ownerContext(context);
    const { loadTerminalSnapshot } = await import("./omni-terminal.server");
    return loadTerminalSnapshot(context.supabase, context.userId, context.claims);
  });

export const runTerminalCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commandInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    const { loadTerminalSnapshot } = await import("./omni-terminal.server");
    const snapshot = await loadTerminalSnapshot(context.supabase, context.userId, context.claims);
    let result: CommandResult = respond(data.command, snapshot);
    if (result.effect === "engage_stop") {
      const { error } = await context.supabase.rpc("omni_terminal_engage_stop", {
        _reason: "Engaged from terminal",
      });
      result = error
        ? { outcome: "error", lines: ["Emergency Stop could not be confirmed. Use the button and refresh."] }
        : {
            outcome: "ok",
            lines: ["Emergency Stop ENGAGED. Jackboy link, receipt grants and callbacks are refused."],
          };
    }
    if (result.effect === "probe") {
      const { probeRailway } = await import("./omni-terminal-probe.server");
      const probe = await probeRailway(process.env["JACKBOY_LINK_ORIGIN"]);
      result = {
        outcome: probe.state === "reachable" ? "ok" : "error",
        lines: [describeProbe(probe), "No credentials, cookies or job data were sent."],
      };
    }
    const secret = Boolean(noteProblem(data.command));
    const { error: logError } = await context.supabase.rpc("omni_terminal_record", {
      _session: data.sessionId,
      _command: secret ? "[redacted]" : data.command.slice(0, 200),
      _outcome: result.outcome,
      _summary: summarize(result),
    });
    return {
      outcome: result.outcome,
      lines: logError ? [...result.lines, "(This entry could not be saved to history.)"] : result.lines,
      recorded: !logError,
    };
  });

export const setTerminalEmergencyStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stopInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    const { error } = data.engaged
      ? await context.supabase.rpc("omni_terminal_engage_stop", { _reason: data.reason })
      : await context.supabase.rpc("omni_terminal_release_stop", { _reason: data.reason });
    const message = ruleMessage(error, "The Emergency Stop change was not recorded. Refresh and retry.");
    if (message) return { ok: false as const, message };
    return { ok: true as const };
  });

export const queueTerminalTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => taskInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    const { error } = await context.supabase.rpc("omni_terminal_queue_task", {
      _id: data.id,
      _kind: data.kind,
      _agent: data.agent,
      _project: data.project,
      // NULL is valid; the generated type omits nullability.
      _repository: (data.repository || null) as unknown as string,
      _instructions: data.instructions,
    });
    const message = ruleMessage(error, "The task was not saved. Refresh and retry.");
    if (message) return { ok: false as const, message };
    return { ok: true as const };
  });

export const cancelTerminalTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commandInput.pick({ sessionId: true }).parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    const { error } = await context.supabase.rpc("omni_terminal_cancel_task", { _id: data.sessionId });
    const message = ruleMessage(error, "The task was not cancelled. Refresh and retry.");
    if (message) return { ok: false as const, message };
    return { ok: true as const };
  });
