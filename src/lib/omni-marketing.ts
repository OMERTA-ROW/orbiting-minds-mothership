import { z } from "zod";

/** Omni Marketing vertical slice: pure, validated, local-first. No provider is connected. */
export const MAX_BRIEF_BYTES = 200_000;
export const ACCEPTED_TYPES = [".txt", ".md", ".markdown", ".json"] as const;
export const PLANNED_TYPES = [".pdf", ".docx", "audio/video", ".zip"] as const;

export const markets = [
  "music",
  "movie",
  "game",
  "book",
  "website",
  "ecommerce",
  "app",
  "service",
  "course",
  "event",
  "custom",
] as const;
export type Market = (typeof markets)[number];

export const jobStates = [
  "queued",
  "running",
  "blocked",
  "failed",
  "cancelled",
  "submitted",
  "published",
  "measured",
] as const;
export type JobState = (typeof jobStates)[number];

export type IntakeResult =
  | { ok: true; name: string; bytes: number; text: string; digest: string; flags: string[] }
  | { ok: false; name: string; error: string };

const INJECTION =
  /(ignore (all|previous) instructions|system prompt|run this command|execute|sudo |rm -rf|api[_ -]?key|password)/i;

export async function digestText(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Validates an uploaded brief. Never executes or obeys content; embedded instructions are only flagged. */
export async function intakeFile(name: string, bytes: number, text: string): Promise<IntakeResult> {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (!(ACCEPTED_TYPES as readonly string[]).includes(ext))
    return {
      ok: false,
      name,
      error: `Unsupported type ${ext || "(none)"}. Accepted now: ${ACCEPTED_TYPES.join(", ")}.`,
    };
  if (bytes > MAX_BRIEF_BYTES)
    return { ok: false, name, error: `File is ${bytes} bytes; limit is ${MAX_BRIEF_BYTES}.` };
  if (!text.trim()) return { ok: false, name, error: "File is empty or unreadable." };
  if (ext === ".json") {
    try {
      JSON.parse(text);
    } catch {
      return { ok: false, name, error: "JSON brief could not be parsed." };
    }
  }
  const flags: string[] = [];
  if (INJECTION.test(text))
    flags.push(
      "Embedded instruction-like or secret-like text found; treated as untrusted data and ignored.",
    );
  return { ok: true, name, bytes, text, digest: await digestText(text), flags };
}

const KEYWORDS: Record<Market, string[]> = {
  music: ["album", "single", "track", "ep", "vinyl", "tour", "song"],
  movie: ["film", "movie", "trailer", "screening", "premiere"],
  game: ["game", "steam", "playtest", "wishlist", "level"],
  book: ["book", "novel", "kdp", "ingramspark", "author", "coloring"],
  website: ["website", "landing page", "domain", "seo"],
  ecommerce: ["shop", "store", "product", "sku", "inventory", "shipping"],
  app: ["app", "saas", "trial", "subscription", "onboarding"],
  service: ["service", "booking", "clients", "local", "consult"],
  course: ["course", "lesson", "enroll", "cohort"],
  event: ["event", "ticket", "venue", "conference"],
  custom: [],
};

export type Fact = { key: string; value: string; evidence: string; confidence: number };

export function understand(text: string) {
  const lower = text.toLowerCase();
  const scores = markets.map((m) => ({
    m,
    s: KEYWORDS[m].filter((k) => lower.includes(k)).length,
  }));
  scores.sort((a, b) => b.s - a.s);
  const top = scores[0]!;
  const market: Market = top.s ? top.m : "custom";
  const facts: Fact[] = [];
  const line = (re: RegExp, key: string) => {
    const hit = text.split(/\r?\n/).find((l) => re.test(l));
    if (hit)
      facts.push({
        key,
        value: hit
          .replace(re, "")
          .replace(/^[\s:#*-]+/, "")
          .trim(),
        evidence: hit.trim().slice(0, 160),
        confidence: 0.9,
      });
  };
  line(/^\s*#?\s*(title|name)\s*:/i, "title");
  line(/^\s*(audience|target)\s*:/i, "audience");
  line(/^\s*(price|pricing)\s*:/i, "price");
  line(/^\s*(release|launch)( date)?\s*:/i, "launch");
  line(/^\s*(rights|license)\s*:/i, "rights");
  line(/^\s*(destinations?|channels?)\s*:/i, "destinations");
  const priv = /\b(private|confidential|do not publish|unreleased)\b/i.test(text);
  const missing = ["title", "audience", "rights", "destinations"].filter(
    (k) => !facts.some((f) => f.key === k),
  );
  return {
    market,
    marketConfidence: top.s ? Math.min(0.95, 0.4 + top.s * 0.15) : 0.2,
    facts,
    missing,
    privateRestriction: priv,
  };
}

export type Route = {
  id: string;
  name: string;
  contribution: number;
  cost: number;
  speed: number;
  readiness: number;
  fit: number;
  uncertainty: number;
};

const ROUTES: Record<Market, [string, string, string]> = {
  music: [
    "Pre-save + streaming release",
    "Vinyl preorder with lead-time + merch bundle",
    "Sync pitch pipeline",
  ],
  movie: [
    "Trailer + festival/screening ticketing",
    "Digital rental/purchase window",
    "Territory licensing outreach",
  ],
  game: [
    "Demo/playtest + wishlist drive",
    "Creator/community key campaign",
    "Launch sale + update cadence",
  ],
  book: [
    "Sample + preorder",
    "Advance reader copies with ethical review requests",
    "Author events + series read-through",
  ],
  website: [
    "Conversion landing page + search metadata",
    "Lead magnet + email signup",
    "Search content + experiments",
  ],
  ecommerce: [
    "Hero product + margin-based bundle",
    "Lifecycle email for repeat purchase",
    "Catalog creative refresh",
  ],
  app: [
    "Waitlist funnel",
    "Free trial + onboarding activation",
    "Demo-led subscription conversion",
  ],
  service: [
    "Service pages + booking",
    "Case studies + qualified lead form",
    "Local discovery listing",
  ],
  course: ["Free sample lesson + enrollment", "Timed cohort launch", "Speaker/partner webinars"],
  event: ["Early-bird tickets", "Speaker-led promotion", "Community partner allocations"],
  custom: [
    "Define conversion event + landing page",
    "Owned email list build",
    "Small paid test (disabled until policy)",
  ],
};

/** Deterministic heuristic scores (0–1). These are planning estimates, not market research. */
export function compareStrategies(market: Market, readinessGaps: number): Route[] {
  const base = 1 - Math.min(readinessGaps, 4) * 0.15;
  return ROUTES[market].map((name, i) => ({
    id: `${market}-${i}`,
    name,
    contribution: [0.6, 0.7, 0.5][i]!,
    cost: [0.2, 0.5, 0.3][i]!,
    speed: [0.8, 0.5, 0.4][i]!,
    readiness: +(base - i * 0.05).toFixed(2),
    fit: [0.8, 0.65, 0.55][i]!,
    uncertainty: [0.4, 0.55, 0.7][i]!,
  }));
}
export const routeScore = (r: Route) =>
  +(r.contribution + r.speed + r.readiness + r.fit - r.cost - r.uncertainty).toFixed(3);
export const selectRoute = (routes: Route[]) =>
  [...routes].sort((a, b) => routeScore(b) - routeScore(a))[0]!;

export type Asset = { kind: string; title: string; body: string; version: number };

export function draftAssets(
  title: string,
  market: Market,
  route: Route,
  preferences: string[] = [],
): Asset[] {
  const t = title || "Untitled project";
  const a = (kind: string, body: string): Asset => ({
    kind,
    title: `${kind} · ${t}`,
    body,
    version: 1,
  });
  return [
    a(
      "Landing page",
      `# ${t}\n\n${route.name}. Primary call to action defined by the conversion event. Accessible headings, alt text and search metadata required before launch.`,
    ),
    a(
      "Listing metadata",
      `Title: ${t}\nCategory: ${market}\nDescription: draft — fill from verified facts only.`,
    ),
    a("Campaign copy", `Announcing ${t}. ${route.name}. Link: [verify before use]`),
    a(
      "Email draft",
      `Subject: ${t} is coming\n\nFor subscribers who opted in only. Unsubscribe link required.`,
    ),
    a(
      "Social variants",
      `Short: ${t} — ${route.name}.\nLong: Behind the scenes of ${t}. Alt text required for images.`,
    ),
    a("Press kit", `${t}: summary, credits, rights statement, contact. Unverified claims removed.`),
    a("Launch calendar", `T-14 prepare · T-7 announce · T-0 launch · T+7 measure (UTC)`),
    ...preferences.map((p) => a("Owner preference", p)),
  ];
}

export function bookPreferences(text: string): string[] {
  const out: string[] = [];
  if (/coloring/i.test(text)) out.push("Coloring book: Amazon KDP only (owner preference).");
  if (/trapavelli/i.test(text))
    out.push("Trapavelli: private IngramSpark distribution; no public promotion.");
  return out;
}

export const policySchema = z.object({
  enabled: z.boolean(),
  channels: z.array(z.string().min(1)).max(50),
  visibility: z.enum(["private", "public"]),
  dailySpendCap: z.number().min(0).max(0, "Spending is disabled in this build."),
  totalSpendCap: z.number().min(0).max(0, "Spending is disabled in this build."),
  discountFloorPct: z.number().min(0).max(90),
  startUtc: z.string(),
  endUtc: z.string(),
});
export type Policy = z.infer<typeof policySchema>;

export type ValidationIssue = { check: string; ok: boolean; detail: string };
export function validateCampaign(c: {
  facts: Fact[];
  privateRestriction: boolean;
  assets: Asset[];
  policy: Policy;
}): ValidationIssue[] {
  const has = (k: string) => c.facts.some((f) => f.key === k && f.value);
  const linkPlaceholders = c.assets.some((a) => a.body.includes("[verify before use]"));
  return [
    {
      check: "Rights declared",
      ok: has("rights"),
      detail: has("rights") ? "Declared in brief (not verified)." : "No rights line in brief.",
    },
    {
      check: "Links verified",
      ok: !linkPlaceholders,
      detail: linkPlaceholders ? "Placeholder links remain." : "No placeholders.",
    },
    {
      check: "Price/offer consistent",
      ok: has("price"),
      detail: has("price") ? "Price stated." : "No price stated.",
    },
    {
      check: "Visibility respects restriction",
      ok: !(c.privateRestriction && c.policy.visibility === "public"),
      detail: c.privateRestriction ? "Brief marks project private." : "No restriction.",
    },
    {
      check: "Destinations configured",
      ok: c.policy.channels.length > 0,
      detail: `${c.policy.channels.length} channel(s).`,
    },
  ];
}

export type Adapter = { id: string; name: string; connected: false; prerequisite: string };
export const ADAPTERS: Adapter[] = [
  {
    id: "linkedin",
    name: "LinkedIn posts",
    connected: false,
    prerequisite:
      "Owner-authorized LinkedIn app with w_member_social scope and a test member account.",
  },
  {
    id: "youtube",
    name: "YouTube upload",
    connected: false,
    prerequisite: "Google OAuth client with youtube.upload scope and verified test channel.",
  },
  {
    id: "email",
    name: "Email campaign",
    connected: false,
    prerequisite: "Verified sending domain plus consented subscriber list.",
  },
  {
    id: "website",
    name: "Website deploy",
    connected: false,
    prerequisite: "Separate owner publish approval; domain DNS verification.",
  },
];

export type Job = {
  id: string;
  channel: string;
  idempotencyKey: string;
  state: JobState;
  detail: string;
  externalId: null;
  at: string;
};

/** Execution: every adapter is unconnected, so jobs become blocked with the exact prerequisite. Never submitted/published. */
export function planJobs(
  campaignId: string,
  policy: Policy,
  existing: Job[],
  privateRestriction: boolean,
  now: string,
): { jobs: Job[]; error?: string } {
  const p = policySchema.safeParse(policy);
  if (!p.success) return { jobs: existing, error: p.error.issues[0]?.message ?? "Invalid policy" };
  if (!policy.enabled) return { jobs: existing, error: "Execution policy is not enabled." };
  if (privateRestriction && policy.visibility === "public")
    return { jobs: existing, error: "Project is private; public execution refused." };
  const jobs = [...existing];
  for (const ch of policy.channels) {
    const key = `${campaignId}:${ch}:v1`;
    if (jobs.some((j) => j.idempotencyKey === key && j.state !== "cancelled")) continue;
    const ad = ADAPTERS.find((a) => a.id === ch);
    jobs.push({
      id: `${key}:${jobs.length}`,
      channel: ch,
      idempotencyKey: key,
      state: "blocked",
      detail: ad
        ? `Blocked: ${ad.prerequisite}`
        : "Blocked: unsupported destination; manual handoff.",
      externalId: null,
      at: now,
    });
  }
  return { jobs };
}

const TERMINAL: JobState[] = ["cancelled", "published", "measured", "failed"];
export function cancelJobs(jobs: Job[], now: string): Job[] {
  return jobs.map((j) =>
    TERMINAL.includes(j.state)
      ? j
      : { ...j, state: "cancelled", detail: "Cancelled by owner.", at: now },
  );
}
export function revokeChannel(policy: Policy, jobs: Job[], channel: string, now: string) {
  return {
    policy: { ...policy, channels: policy.channels.filter((c) => c !== channel) },
    jobs: jobs.map((j) =>
      j.channel === channel && !TERMINAL.includes(j.state)
        ? { ...j, state: "cancelled" as const, detail: "Access revoked.", at: now }
        : j,
    ),
  };
}

export type Campaign = {
  id: string;
  createdAt: string;
  source: { name: string; bytes: number; digest: string; flags: string[] };
  original: string;
  market: Market;
  facts: Fact[];
  missing: string[];
  privateRestriction: boolean;
  routes: Route[];
  selected: string;
  assets: Asset[];
  policy: Policy;
  jobs: Job[];
  log: string[];
};

/** Clone keeps structure, clears credentials/permissions/actuals/rights. */
export function cloneCampaign(c: Campaign, id: string, now: string): Campaign {
  return {
    ...c,
    id,
    createdAt: now,
    facts: c.facts.filter((f) => f.key !== "rights"),
    policy: { ...c.policy, enabled: false, channels: [] },
    jobs: [],
    log: [`${now} cloned from ${c.id}; permissions, rights and actuals cleared`],
  };
}

export const STORE_KEY = "evolution.omni-marketing.v1";
const storeSchema = z.object({ version: z.literal(1), campaigns: z.array(z.any()) });
export function loadStore(raw: string | null): Campaign[] {
  if (!raw) return [];
  try {
    const p = storeSchema.safeParse(JSON.parse(raw));
    return p.success ? (p.data.campaigns as Campaign[]) : [];
  } catch {
    return [];
  }
}
export const saveStore = (c: Campaign[]) => JSON.stringify({ version: 1, campaigns: c });
