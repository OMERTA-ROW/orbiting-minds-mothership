// Single source of truth for which pages may appear in search. Route heads and the
// Launch Control SEO panel both read this, so the panel reflects configured tags.
export type SearchPolicyEntry = { path: string; label: string; indexable: boolean; reason: string };

export const searchPolicy = [
  { path: "/", label: "Homepage", indexable: true, reason: "Owner-approved public entry point." },
  { path: "/beta", label: "Private beta projects", indexable: false, reason: "Signed-in private workspace." },
  { path: "/beta-omni", label: "Authorized OMNI beta", indexable: false, reason: "Signed-in private conversation." },
  { path: "/quantum-studio", label: "Quantum Studio beta", indexable: false, reason: "Signed-in private media." },
  { path: "/knowledge-brief", label: "Daily Knowledge Brief", indexable: false, reason: "Signed-in approved beta members only." },
] as const satisfies readonly SearchPolicyEntry[];

export function isIndexable(path: string) {
  return searchPolicy.some((entry) => entry.path === path && entry.indexable);
}
