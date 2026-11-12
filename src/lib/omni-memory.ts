/**
 * Per-agent OMNI memory: pure rules shared by server and browser.
 *
 * Entries live only in Mothership's database. The owner saves, lists (one agent
 * at a time) and deletes them explicitly. No agent, model, OMNI/Railway service or
 * Jackboy reads them yet: there is no external memory backend and no sync.
 */
import { z } from "zod";
import { noteProblem } from "./activation-approvals";

/** Isolated agent IDs. Must match the database check in omni_memory_valid_agent. */
export const MEMORY_AGENTS = [
  "omni",
  "jackboy",
  "jax",
  "razul",
  "sabrina",
  "guardian",
  "hercules",
  "honeycomb",
] as const;
export type MemoryAgent = (typeof MEMORY_AGENTS)[number];
export const MEMORY_AGENT_LABEL: Record<MemoryAgent, string> = {
  omni: "OMNI",
  jackboy: "Jackboy",
  jax: "JAX",
  razul: "Razul Central Intelligence",
  sabrina: "Sabrina",
  guardian: "Guardian",
  hercules: "Hercules",
  honeycomb: "Honeycomb Terminal",
};

export const MEMORY_KINDS = ["fact", "instruction", "preference", "reference", "note"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  fact: "Fact",
  instruction: "Instruction",
  preference: "Preference",
  reference: "Reference",
  note: "Note",
};

export const MEMORY_SOURCES = [
  "owner_typed",
  "terminal_session",
  "held_task",
  "document",
  "web_page",
] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];
export const MEMORY_SOURCE_LABEL: Record<MemorySource, string> = {
  owner_typed: "Typed by me",
  terminal_session: "Terminal session",
  held_task: "Held task",
  document: "Document",
  web_page: "Web page",
};

export const MEMORY_LIMITS = { title: 120, body: 8000, sourceRef: 300, perAgent: 500 } as const;

/** Where entries are stored and who reads them. Changing this needs a tested sync path. */
export const MEMORY_BACKEND = {
  storedIn: "Mothership (Lovable Cloud database)",
  externalBackend: false,
  readByAgents: false,
} as const;

const agent = z.enum(MEMORY_AGENTS);
const clean = (v: string) => !noteProblem(v);

export const memorySaveInput = z
  .object({
    agent,
    kind: z.enum(MEMORY_KINDS),
    title: z.string().trim().min(1, "Give it a short title.").max(MEMORY_LIMITS.title),
    body: z.string().trim().min(1, "Write what to remember.").max(MEMORY_LIMITS.body),
    sourceKind: z.enum(MEMORY_SOURCES),
    sourceRef: z.string().trim().max(MEMORY_LIMITS.sourceRef).default(""),
  })
  .strict()
  .refine((m) => clean(m.title) && clean(m.body) && clean(m.sourceRef), {
    message: "Remove anything that looks like a key or token.",
    path: ["body"],
  });
export type MemorySaveInput = z.infer<typeof memorySaveInput>;

export const memoryListInput = z.object({ agent }).strict();
export const memoryDeleteInput = z.object({ agent, id: z.string().uuid() }).strict();

export type MemoryRow = {
  id: string;
  agent_id: string;
  kind: string;
  title: string;
  body: string;
  source_kind: string;
  source_ref: string;
  body_sha256: string;
  created_at: string;
};

/**
 * Defence in depth: the database already scopes every read to one agent.
 * If any row for another agent ever comes back, refuse the whole result.
 */
export function onlyAgent<T extends { agent_id: string }>(rows: T[], wanted: MemoryAgent): T[] {
  if (rows.some((r) => r.agent_id !== wanted))
    throw new Error("Memory result mixed agents; nothing was shown.");
  return rows;
}

export function memoryErrorMessage(error: { code?: string; message: string } | null) {
  if (!error) return null;
  // 22023 messages are written by the memory functions and contain no stored data.
  if (error.code === "22023") return error.message;
  return "Not confirmed. Refresh and retry.";
}
