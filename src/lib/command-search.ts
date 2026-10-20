import { agents, demoProposals, feed, modules, universe } from "@/data/evolution";

export type SearchKind = "Module" | "Project" | "Agent" | "Proposal" | "Idea";
export interface SearchEntry {
  key: string;
  id: string;
  kind: SearchKind;
  label: string;
  detail: string;
  keywords: string;
}

export const searchEntries: SearchEntry[] = [
  ...modules.map((m) => ({ key: `module:${m.id}`, id: m.id, kind: "Module" as const, label: m.name, detail: m.short, keywords: `${m.purpose} ${m.capabilities.join(" ")}` })),
  ...universe.filter((n) => n.category !== "AI Agents").map((n) => ({ key: `project:${n.id}`, id: n.id, kind: "Project" as const, label: n.name, detail: `${n.category} · ${n.owner}`, keywords: `${n.summary} ${n.capabilities.join(" ")}` })),
  ...agents.map((a) => ({ key: `agent:${a.name}`, id: a.name, kind: "Agent" as const, label: a.name, detail: `${a.role} · ${a.consent}`, keywords: `${a.scope} ${a.name} Agent` })),
  ...demoProposals.map((p) => ({ key: `proposal:${p.id}`, id: p.id, kind: "Proposal" as const, label: p.t, detail: `${p.id} · ${p.p}`, keywords: p.s })),
  ...feed.map((f) => ({ key: `idea:${f.id}`, id: String(f.id), kind: "Idea" as const, label: f.title, detail: `${f.author} · ${f.mode}`, keywords: `${f.body} ${f.tags.join(" ")}` })),
];

export function searchCommands(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return searchEntries.filter((entry) => terms.every((term) => `${entry.kind} ${entry.label} ${entry.detail} ${entry.keywords}`.toLowerCase().includes(term)));
}

export function shouldOpenPalette(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; repeat: boolean }) {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.repeat;
}