import { agents, codeContributions, demoProposals, feed, modules, sampleProjects, universe, roboticsScenarios } from "@/data/evolution";

export type SearchKind = "Module" | "Project" | "Agent" | "Proposal" | "Idea" | "Code" | "Scenario";
export interface SearchEntry {
  key: string;
  id: string;
  kind: SearchKind;
  label: string;
  detail: string;
  keywords: string;
}

export const searchEntries: SearchEntry[] = [
  ...roboticsScenarios.map(s => ({ key: `scenario:${s.id}`, id: s.id, kind: "Scenario" as const, label: s.title, detail: `${s.category} · RESEARCH DEMO`, keywords: `${s.problem} ${s.author} ${s.compatibility} ${s.dataset.name}` })),
  ...modules.map((m) => ({ key: `module:${m.id}`, id: m.id, kind: "Module" as const, label: m.name, detail: m.short, keywords: `${m.purpose} ${m.capabilities.join(" ")}` })),
  ...universe.filter((n) => n.category !== "AI Agents").map((n) => ({ key: `project:${n.id}`, id: n.id, kind: "Project" as const, label: n.name, detail: `${n.category} · ${n.owner}`, keywords: `${n.summary} ${n.capabilities.join(" ")} ${sampleProjects.find((p) => p.id === n.id)?.stack.join(" ") ?? ""}` })),
  ...agents.map((a) => ({ key: `agent:${a.name}`, id: a.name, kind: "Agent" as const, label: a.name, detail: `${a.role} · ${a.consent}`, keywords: `${a.scope} ${a.name} Agent` })),
  ...demoProposals.map((p) => ({ key: `proposal:${p.id}`, id: p.id, kind: "Proposal" as const, label: p.t, detail: `${p.id} · ${p.p}`, keywords: p.s })),
  ...feed.map((f) => ({ key: `idea:${f.id}`, id: String(f.id), kind: "Idea" as const, label: f.title, detail: `${f.author} · ${f.mode}`, keywords: `${f.body} ${f.tags.join(" ")}` })),
  ...codeContributions.map((item) => ({ key: `code:${item.id}`, id: item.id, kind: "Code" as const, label: item.title.en, detail: `${item.language} · ${item.author} · DEMO`, keywords: `${item.title.es} ${item.description.en} ${item.description.es} ${item.industry} ${item.license} ${item.authorType} ${item.operator ?? ""}` })),
];

export function searchCommands(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = searchEntries.filter((entry) => terms.every((term) => `${entry.kind} ${entry.label} ${entry.detail} ${entry.keywords}`.toLowerCase().includes(term)));
  const text = query.toLowerCase().trim();
  const score = (entry: SearchEntry) => !text ? 0 : entry.label.toLowerCase() === text || entry.id.toLowerCase() === text ? 3 : entry.label.toLowerCase().includes(text) ? 2 : 1;
  return matches.sort((a, b) => score(b) - score(a));
}

export function shouldOpenPalette(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; repeat: boolean }) {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.repeat;
}