/**
 * Areas that only ever had simulated, sample or fictional content. The owner removed
 * demo mode (2026-11-20): these addresses now show an honest "not connected" page,
 * never the old samples. Pure data so the page, the home list and tests share it.
 * Each entry says what a real version would need and, when one exists, which working
 * page to use instead. Browser-saved records from the old screens are left in place.
 */

/** Working pages a retired area may point to instead. */
export type WorkingPath =
  | "/"
  | "/auth"
  | "/beta"
  | "/beta-omni"
  | "/quantum-studio"
  | "/knowledge-brief"
  | "/omni-terminal"
  | "/omni-dock"
  | "/omni-api-keys"
  | "/activation-approvals"
  | "/account-security"
  | "/members"
  | "/launch-control";

export type RetiredArea = {
  path: string;
  name: string;
  /** What a real version would need. Plain words, no promises. */
  needs: string;
  instead?: { to: WorkingPath; label: string };
};

const terminal = { to: "/omni-terminal", label: "Open OMNI Terminal" } as const;
const chat = { to: "/beta-omni", label: "Open OMNI chat" } as const;
const projects = { to: "/beta", label: "Open My projects" } as const;
const dock = { to: "/omni-dock", label: "Open Docking Bay" } as const;
const approvals = { to: "/activation-approvals", label: "Open Activation approvals" } as const;
const dashboard = { to: "/omni-api-keys", label: "Open Owner dashboard" } as const;
const media = { to: "/quantum-studio", label: "Open Quantum Studio" } as const;
const brief = { to: "/knowledge-brief", label: "Open Daily Knowledge Brief" } as const;

export const retiredAreas = [
  {
    path: "/omni",
    name: "OMNI conversation",
    needs: "Replaced by the real OMNI chat.",
    instead: chat,
  },
  {
    path: "/omnibridge",
    name: "OmniBridge",
    needs: "Replaced by the real OMNI chat.",
    instead: chat,
  },
  {
    path: "/voice",
    name: "Mothership Voice",
    needs: "Voice now lives in the real OMNI chat.",
    instead: chat,
  },
  {
    path: "/omni-models",
    name: "Model choices",
    needs:
      "Connected model providers and a runner. Neither is connected, so plans saved here did nothing.",
    instead: terminal,
  },
  {
    path: "/omni-agents",
    name: "OMNI agent registry",
    needs: "Real agents are listed with their verified status in OMNI Terminal.",
    instead: terminal,
  },
  {
    path: "/agents",
    name: "Agent network",
    needs: "Real agents are listed with their verified status in OMNI Terminal.",
    instead: terminal,
  },
  {
    path: "/command-nexus",
    name: "Command Nexus",
    needs: "Real commands go through OMNI Terminal's own checks.",
    instead: terminal,
  },
  {
    path: "/omni-gateway",
    name: "Coding gateway",
    needs:
      "CODE work goes through Jackboy only after Activation steps 9 and 10. Records here were browser-only and did nothing.",
    instead: approvals,
  },
  {
    path: "/sandbox",
    name: "Sandbox lab",
    needs:
      "A connected sandbox host. The manual terminal in OMNI Terminal shows its real setup status.",
    instead: terminal,
  },
  {
    path: "/guardian",
    name: "Guardian",
    needs: "Real stops and audit are in OMNI Terminal.",
    instead: terminal,
  },
  {
    path: "/incident-archives",
    name: "Incident archives",
    needs: "Real audit records are in OMNI Terminal.",
    instead: terminal,
  },
  {
    path: "/agent-debrief",
    name: "Agent debrief",
    needs: "Real audit records are in OMNI Terminal.",
    instead: terminal,
  },
  {
    path: "/guardian-incidents",
    name: "Incident accountability",
    needs: "Real audit records are in OMNI Terminal.",
    instead: terminal,
  },
  {
    path: "/report-incident",
    name: "Report an incident",
    needs: "A real reporting inbox, which isn't connected.",
  },
  {
    path: "/approval-ledger",
    name: "Approval ledger",
    needs: "Real owner decisions are recorded in Activation approvals.",
    instead: approvals,
  },
  {
    path: "/trust",
    name: "Trust & certification",
    needs: "Real signing and an independent reviewer. Neither is connected.",
  },
  { path: "/releases", name: "Release galaxy", needs: "Signed releases, which aren't set up." },
  { path: "/code-vault", name: "Code vault", needs: "Real code signing, which isn't set up." },
  {
    path: "/dashboard",
    name: "Dashboard",
    needs: "The real owner dashboard shows live connection status.",
    instead: dashboard,
  },
  {
    path: "/mothership",
    name: "Mothership overview",
    needs: "The real owner dashboard shows live connection status.",
    instead: dashboard,
  },
  {
    path: "/sdk",
    name: "SDK and API docs",
    needs: "Real API keys and the health check are on the owner dashboard.",
    instead: dashboard,
  },
  {
    path: "/devices",
    name: "My devices",
    needs: "Real devices pair through the Docking Bay.",
    instead: dock,
  },
  {
    path: "/fleet",
    name: "Fleet control",
    needs: "Real devices pair through the Docking Bay.",
    instead: dock,
  },
  {
    path: "/care",
    name: "Evolution CARE",
    needs: "Signed desktop software, which doesn't exist yet.",
    instead: dock,
  },
  {
    path: "/care-agent",
    name: "Native agent",
    needs: "Signed desktop software, which doesn't exist yet.",
    instead: dock,
  },
  {
    path: "/updates",
    name: "Update engine",
    needs: "Signed desktop software, which doesn't exist yet.",
  },
  {
    path: "/pilot",
    name: "Evolution Pilot",
    needs: "Signed desktop software, which doesn't exist yet.",
  },
  {
    path: "/security-report",
    name: "Health & security report",
    needs: "Your sign-in security is on Account security.",
    instead: { to: "/account-security", label: "Open Account security" },
  },
  {
    path: "/code-exchange",
    name: "Code exchange",
    needs: "Shared accounts and repository access, which aren't connected.",
    instead: projects,
  },
  {
    path: "/commons",
    name: "Commons",
    needs: "Shared accounts, which aren't connected.",
    instead: projects,
  },
  {
    path: "/pulse",
    name: "Pulse",
    needs: "Real recorded activity, which isn't connected.",
    instead: projects,
  },
  {
    path: "/challenges",
    name: "Grand challenges",
    needs: "Real submissions and reviewers, which aren't connected.",
  },
  {
    path: "/open-call",
    name: "Open call",
    needs: "Real submissions and reviewers, which aren't connected.",
  },
  {
    path: "/embassy",
    name: "Agent embassy",
    needs: "Real outside agents, which aren't connected.",
  },
  {
    path: "/agent-lounge",
    name: "Welcome lounge",
    needs: "People join through owner invitations.",
    instead: { to: "/members", label: "Open Members & invitations" },
  },
  {
    path: "/join",
    name: "Join",
    needs: "People join through owner invitations.",
    instead: { to: "/auth", label: "Sign in" },
  },
  {
    path: "/omni-marketing",
    name: "OMNI marketing",
    needs: "Approved marketing accounts, which aren't connected.",
  },
  {
    path: "/angel-tech",
    name: "Angel Tech",
    needs: "Approved outreach accounts, which aren't connected.",
  },
  {
    path: "/omni-rights",
    name: "OMNI rights",
    needs: "A real rights registry, which isn't connected.",
  },
  {
    path: "/omni-legal",
    name: "Omni Legal",
    needs: "Real case files and a reviewing lawyer. Neither is connected.",
  },
  {
    path: "/entertainment",
    name: "Entertainment galaxy",
    needs: "Real private media lives in Quantum Studio.",
    instead: media,
  },
  {
    path: "/cartoon-galaxy",
    name: "Cartoon galaxy",
    needs: "Real private media lives in Quantum Studio.",
    instead: media,
  },
  {
    path: "/discovery",
    name: "Discovery radar",
    needs: "Real daily findings are in the Knowledge Brief.",
    instead: brief,
  },
  {
    path: "/knowledge-fusion",
    name: "Knowledge fusion",
    needs: "Real daily findings are in the Knowledge Brief.",
    instead: brief,
  },
  {
    path: "/digital-twin",
    name: "Digital twin lab",
    needs: "A real test environment, which isn't connected.",
  },
  {
    path: "/robotics",
    name: "Robotics & mobility lab",
    needs: "Real hardware and safety testing. Neither is connected.",
  },
  {
    path: "/physical-safety",
    name: "Physical safety lock",
    needs: "Real hardware and safety testing. Neither is connected.",
  },
  {
    path: "/experiment-replay",
    name: "Experiment replay",
    needs: "Real recorded experiments, which don't exist yet.",
  },
  {
    path: "/impact-scorecard",
    name: "Impact scorecard",
    needs: "Real measured results, which don't exist yet.",
  },
  {
    path: "/marketplace",
    name: "Creator marketplace",
    needs: "Payments and seller accounts. Neither is connected.",
  },
  {
    path: "/compute-grid",
    name: "Compute grid",
    needs: "Real compute providers, which aren't connected.",
  },
  {
    path: "/universe",
    name: "Universe",
    needs: "Real connected projects, which aren't listed yet.",
  },
  { path: "/arena", name: "Racing arena", needs: "Not planned as a real feature." },
  { path: "/partnerships", name: "Partnerships", needs: "No partnerships are in place." },
  {
    path: "/roadmap",
    name: "Roadmap",
    needs: "Dated readiness checks are in Launch readiness.",
    instead: { to: "/launch-control", label: "Open Launch readiness" },
  },
] as const satisfies readonly RetiredArea[];

/** Detail pages under a retired area use the parent's entry. */
const DETAIL_PARENTS: Record<string, string> = {
  "/capsules/": "/open-call",
  "/challenges/": "/challenges",
  "/code-exchange/": "/code-exchange",
  "/guardian-incidents/": "/guardian-incidents",
  "/incident-archives/": "/incident-archives",
  "/robotics/": "/robotics",
};

const byPath = new Map<string, RetiredArea>(retiredAreas.map((a) => [a.path, a]));

export function retiredArea(pathname: string): RetiredArea | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const direct = byPath.get(path);
  if (direct) return direct;
  const parent = Object.entries(DETAIL_PARENTS).find(([p]) => path.startsWith(p))?.[1];
  return parent ? byPath.get(parent) : undefined;
}

/**
 * Browser storage written by the old screens. Kept, never deleted, and offered as a
 * download so nothing typed into them is lost. Sign-in sessions are never included.
 */
export function savedBrowserRecords(storage: Pick<Storage, "length" | "key" | "getItem">) {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !/^(evo|evolution|omni)[.\-:]/i.test(key)) continue;
    if (/auth|token|session|signin|recovery|invite|key/i.test(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}
