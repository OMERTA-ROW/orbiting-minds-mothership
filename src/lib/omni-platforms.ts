import { z } from "zod";
import { assertNonSensitive } from "./beta";

export const socialPlatforms = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "x",
  "pinterest",
] as const;
const safe = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .superRefine((v, ctx) => {
      try {
        assertNonSensitive(v);
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          message: e instanceof Error ? e.message : "Sensitive content",
        });
      }
    });
export const socialContent = z
  .object({
    platform: z.enum(socialPlatforms),
    accountLabel: safe(2, 100),
    title: safe(2, 100),
    body: safe(1, 3000),
    altText: safe(0, 500),
    hashtags: safe(0, 300),
    license: safe(2, 500),
    targetDate: z.union([z.literal(""), z.string().datetime()]),
    timezone: z.literal("UTC"),
    rights: z.literal(true),
    privacy: z.literal(true),
  })
  .strict();
export type SocialContent = z.infer<typeof socialContent>;
export const socialSave = z
  .object({
    projectId: z.string().uuid(),
    id: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
    content: socialContent,
    consent: z.literal(true),
  })
  .strict()
  .refine((v) => !!v.id === !!v.revision, "Saved ID and current revision must match");
export const socialAction = z
  .object({
    action: z.enum(["review", "stop", "stop_all"]),
    id: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
    approve: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action !== "stop_all" && (!v.id || !v.revision))
      ctx.addIssue({ code: "custom", message: "Select an exact saved version" });
    if (v.action === "review" && v.approve !== true)
      ctx.addIssue({ code: "custom", message: "Human review required" });
  });
export function socialExport(content: unknown, state: string) {
  const v = socialContent.parse(content);
  return {
    content: v,
    state,
    account: null,
    connection: "NOT CONNECTED",
    scheduled: false,
    autopilot: false,
    receipt: null,
    postUrl: null,
    mediaIncluded: false,
    formatQa: "NOT RUN",
    cost: "UNKNOWN / no provider call",
    dateMeaning: "UTC planning intention only",
    rules: [],
  };
}
export function calendarPlans<T extends { content: unknown }>(rows: T[]) {
  return rows
    .filter((v) => {
      const c = socialContent.safeParse(v.content);
      return c.success && !!c.data.targetDate;
    })
    .sort((a, b) =>
      socialContent
        .parse(a.content)
        .targetDate.localeCompare(socialContent.parse(b.content).targetDate),
    );
}
export function requireHumanDeveloperApproval(action: string) {
  return ["production deploy", "billing", "secrets", "permissions", "deletion"].includes(action);
}
export const developerPlanSchema = z
  .object({
    projectId: z.string().uuid(),
    provider: z.enum(["github", "gitlab", "bitbucket", "actions", "vercel", "figma", "notion"]),
    target: safe(2, 200),
    intent: safe(10, 1500),
    consent: z.literal(true),
  })
  .strict();
export function developerPlan(input: unknown) {
  const v = developerPlanSchema.parse(input);
  return {
    ...v,
    state: "PROPOSED",
    connectedAccount: null,
    targetVerification: "OWNER DECLARATION / NOT READ",
    branch: null,
    pullRequest: null,
    testRun: null,
    deploy: false,
    credentialsIncluded: false,
    humanAlwaysRequired: ["production deploy", "billing", "secrets", "permissions", "deletion"],
    cost: "UNKNOWN / no provider call",
  };
}
export type PlatformEntry = {
  id: string;
  name: string;
  group: "social" | "developer";
  status: "NOT CONNECTED" | "NOT SUPPORTED";
  available: string;
  scopes: string;
  limits: string;
  source: string;
};
export const platformCatalog: PlatformEntry[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    group: "social",
    status: "NOT CONNECTED",
    available: "Eligible member publishing via official API",
    scopes: "openid, profile; w_member_social for member posts. Organization access is separate.",
    limits:
      "Per-user client missing. Configure Share on LinkedIn, consent and test member first; no provider receipt verified.",
    source: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access",
  },
  {
    id: "youtube",
    name: "YouTube",
    group: "social",
    status: "NOT CONNECTED",
    available: "Official video upload for eligible channels",
    scopes: "https://www.googleapis.com/auth/youtube.upload",
    limits:
      "Encoded video required, not standalone WAV. OAuth, quota and audit apply; unverified API-project uploads can be private-only. No app-user adapter configured.",
    source: "https://developers.google.com/youtube/v3/docs/videos/insert",
  },
  {
    id: "instagram",
    name: "Instagram",
    group: "social",
    status: "NOT CONNECTED",
    available: "Professional-account content publishing",
    scopes:
      "Depends on login: Instagram Login instagram_business_basic / instagram_business_content_publish; Facebook Login instagram_basic / instagram_content_publish plus required Page scopes.",
    limits:
      "Professional-account eligibility, selected login flow, Meta App Review and media constraints must be verified. Consumer-account publishing is unsupported.",
    source: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },
  {
    id: "facebook",
    name: "Facebook Pages",
    group: "social",
    status: "NOT CONNECTED",
    available: "Eligible Page posts, not arbitrary personal-profile posts",
    scopes:
      "Page publishing commonly pages_manage_posts plus discovery/read permissions; confirm exact current login/product requirements.",
    limits:
      "Managed Page, required tasks and Meta App Review needed. App-role test first; no active app adapter.",
    source: "https://developers.facebook.com/docs/pages-api/posts",
  },
  {
    id: "tiktok",
    name: "TikTok",
    group: "social",
    status: "NOT CONNECTED",
    available: "Eligible Content Posting / Direct Post",
    scopes: "video.publish for Direct Post; creator authorization and explicit preview consent",
    limits:
      "Creator privacy options and supported media required; unaudited Direct Post is private-only and capped. No per-user adapter configured.",
    source: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
  {
    id: "x",
    name: "X",
    group: "social",
    status: "NOT CONNECTED",
    available: "Eligible user-authorized post creation",
    scopes:
      "tweet.read, tweet.write, users.read; offline.access only if approved renewable access needed",
    limits:
      "Developer account access/pricing and current limits must be checked; no integration, posting or billing active.",
    source: "https://docs.x.com/x-api/posts/create-post",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    group: "social",
    status: "NOT CONNECTED",
    available: "Eligible Pin creation",
    scopes: "pins:write and appropriate board read access; confirm current product access",
    limits:
      "Trial/Standard eligibility and supported media required. Trial visibility is limited; no adapter configured.",
    source: "https://developers.pinterest.com/docs/getting-started/authentication/",
  },
  {
    id: "github",
    name: "GitHub",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Authorized repository / issue / PR context",
    scopes:
      "OAuth read:user; repo for private repos is broad read/write, not read-only. Prefer reviewed least-privilege GitHub App for granular repo access.",
    limits:
      "Per-user client missing; select exact repository and explicit read scope before branches/PRs. Git sync is separate and managed in Lovable settings.",
    source: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps",
  },
  {
    id: "gitlab",
    name: "GitLab",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Authorized projects / issues / merge requests",
    scopes: "read_api / read_repository for selected reads; api write access needs separate review",
    limits: "Per-user client missing; exact project and tenant/version API permissions required.",
    source: "https://docs.gitlab.com/integration/oauth_provider/",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Official repository / pull-request APIs",
    scopes:
      "repository / pullrequest reads; write scopes separately reviewed per current OAuth API",
    limits:
      "No active adapter. Exact repository and supported app credential flow required; custom per-user OAuth requires owner choice first.",
    source: "https://developer.atlassian.com/cloud/bitbucket/rest/intro/",
  },
  {
    id: "actions",
    name: "GitHub Actions / CI",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Build context and approved workflow dispatch",
    scopes:
      "Actions read; Actions write for workflow dispatch. Job GITHUB_TOKEN permissions remain independently bounded.",
    limits:
      "Choose exact workflow/ref; inspect for deploy/secret/billing steps before approval. Runners are not a proven isolated sandbox.",
    source: "https://docs.github.com/en/rest/actions/workflows",
  },
  {
    id: "vercel",
    name: "Vercel",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Authorized project/deployment API",
    scopes:
      "Exact team/project credential capability depends on official integration setup; not verified here",
    limits:
      "No project selected or credential configured. Preview and production deployments require explicit human approval; never invoke a deploy hook from a draft.",
    source: "https://vercel.com/docs/rest-api",
  },
  {
    id: "figma",
    name: "Figma Desktop",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Read-only design context through Lovable desktop MCP",
    scopes: "Local MCP authorization; no write-back in this Lovable connection",
    limits:
      "Open Figma Desktop → Dev Mode (Shift+D) → Enable desktop MCP server → Lovable Settings / Connectors / Local MCP servers. No server visible this session.",
    source: "https://docs.lovable.dev/integrations/desktop-app",
  },
  {
    id: "notion",
    name: "Notion",
    group: "developer",
    status: "NOT CONNECTED",
    available: "Explicitly shared pages/data sources",
    scopes: "No OAuth scope list; integration capabilities and selected shared pages govern access",
    limits:
      "Per-user client missing. Blueprint was read once through the founder's chat connection, not a connected runtime workspace. Never automatically expose it to app users.",
    source: "https://developers.notion.com/reference/capabilities",
  },
];
