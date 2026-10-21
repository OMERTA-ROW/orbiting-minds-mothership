import { z } from "zod";
import { assertNonSensitive } from "./beta";
import { mediaConsent } from "./quantum";

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .superRefine((v, ctx) => {
      try {
        assertNonSensitive(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Remove sensitive or excluded project content." });
      }
    });
export const branches = ["book", "animation", "podcast", "game", "score", "website"] as const;
export const canonSchema = z
  .object({
    name: text(2, 100),
    premise: text(10, 1500),
    characters: text(2, 2000),
    rules: text(2, 2000),
    provenance: text(10, 1500),
    branches: z
      .array(z.enum(branches))
      .min(1)
      .max(6)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export type Canon = z.infer<typeof canonSchema>;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const initialCanon: Canon = {
  name: "The Lantern Atlas",
  premise: "An original fictional crew maps lost constellations and returns each borrowed light.",
  characters:
    "Ira: a patient mapmaker. Pip: a fictional mechanical bird. No real people or borrowed characters.",
  rules: "Light may be borrowed, never owned. Each journey restores a forgotten place.",
  provenance:
    "Fictional editable example. Replace with creator attribution and actual license/rights sources before review.",
  branches: ["podcast", "game", "website"],
};
export const canonInput = z
  .object({ projectId: z.string().uuid(), content: canonSchema, consent: mediaConsent })
  .strict();
export const releaseChannels = [
  "rss",
  "owned-site",
  "video",
  "social",
  "music",
  "book",
  "game",
] as const;
// URL declarations are never fetched, verified or converted into connection grants.
export const ownedHttps = z
  .string()
  .url()
  .max(500)
  .superRefine((v, ctx) => {
    let u: URL;
    try { u = new URL(v); } catch { ctx.addIssue({ code: "custom", message: "Enter a complete public HTTPS URL." }); return; }
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.port ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|example|invalid)$/.test(host) ||
      /(^|\.)supabase\.(co|com)$/.test(host) ||
      host.endsWith(".lovable.app")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Use an owned public HTTPS site, without credentials, query, fragment or private storage URLs.",
      });
  });
export const releaseSchema = z
  .object({
    channel: z.enum(releaseChannels),
    title: text(2, 140),
    description: text(10, 3000),
    credits: text(2, 1500),
    license: text(2, 500),
    explicit: z.boolean(),
    siteUrl: z.union([z.literal(""), ownedHttps]),
    assetId: z.string().uuid().nullable(),
    canonId: z.string().uuid().nullable(),
    targetDate: z.union([z.literal(""), z.string().datetime()]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.channel === "rss" && (!v.assetId || !v.siteUrl))
      ctx.addIssue({
        code: "custom",
        message: "RSS requires your private WAV and an owned-site destination declaration.",
      });
  });
export type ReleaseDraft = z.infer<typeof releaseSchema>;
export const initialRelease: ReleaseDraft = {
  channel: "rss",
  title: "Episode one",
  description: "An original creator-owned episode prepared for human review.",
  credits: "Add creator and contributor credits",
  license: "Declare the actual license and source rights",
  explicit: false,
  siteUrl: "",
  assetId: null,
  canonId: null,
  targetDate: "",
};
export const releaseInput = z
  .object({ projectId: z.string().uuid(), content: releaseSchema, consent: mediaConsent })
  .strict();
export const releaseAction = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["review", "revoke", "prepare"]),
    consent: mediaConsent.optional(),
    approve: z.boolean().optional(),
    ownedSite: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action !== "revoke" && (!v.consent || v.approve !== true))
      ctx.addIssue({
        code: "custom",
        message: "Explicit rights/privacy and human export approval required.",
      });
  });
export function assertReleaseAction(
  state: string,
  action: string,
  approved: boolean,
  paused: boolean,
) {
  if (action === "revoke") return;
  if (!approved || paused) throw new Error("Approved, unpaused media account required.");
  if (state === "REVOKED") throw new Error("Revoked release; create a new draft.");
  if (action === "prepare" && !["REVIEWED", "BUNDLE_PREPARED"].includes(state))
    throw new Error("Review the exact saved draft first.");
}
export function branchPlan(canon: Canon) {
  const v = canonSchema.parse(canon);
  return v.branches.map((kind) => ({
    kind,
    canon: v.name,
    status: "EDITABLE PLAN / NOT EXECUTED",
    rights: v.provenance,
    steps:
      kind === "podcast"
        ? [
            "Recording and voice consent",
            "Private bounded WAV radio cleanup",
            "Manual chapters and show notes",
            "RSS bundle review",
          ]
        : kind === "game"
          ? [
              "Original concept and mechanics",
              "Canon and asset license inventory",
              "Unity/Blender adapter and build tests: NOT CONNECTED",
              "Trailer and release package: PLANNED",
            ]
          : [
              "Canon continuity",
              "Rights attribution",
              "Human editorial review",
              "Authorized production: PLANNED",
            ],
  }));
}
export function channelEvidence(channel: (typeof releaseChannels)[number]) {
  return {
    channel,
    connection: "NOT CONNECTED",
    capability:
      channel === "rss"
        ? "Validated RSS + WAV manual bundle"
        : channel === "owned-site"
          ? "Metadata + canon manual export; Web Forge HTML exported separately"
          : "Metadata + canon manual export only",
    providerCost: "UNKNOWN / no provider call",
    autopublish: false,
    receipt: null,
  };
}
const xml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
export function rssXml(draft: ReleaseDraft, id: string, bytes: number, createdAt: string) {
  const d = releaseSchema.parse(draft);
  z.string().uuid().parse(id);
  z.string().datetime({ offset: true }).parse(createdAt);
  z.number()
    .int()
    .min(44)
    .max(4 * 1024 * 1024)
    .parse(bytes);
  if (d.channel !== "rss" || !d.assetId) throw new Error("A bounded WAV RSS draft is required.");
  const base = `${d.siteUrl.replace(/\/$/, "")}/`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>${xml(d.title)}</title><link>${xml(base)}</link><description>${xml(d.description)}</description><language>en</language><copyright>${xml(d.credits)} — ${xml(d.license)}</copyright><itunes:explicit>${d.explicit ? "true" : "false"}</itunes:explicit><item><title>${xml(d.title)}</title><description>${xml(d.description)}</description><guid isPermaLink="false">urn:uuid:${id}</guid><pubDate>${new Date(createdAt).toUTCString()}</pubDate><enclosure url="${xml(base)}audio/${id}.wav" length="${bytes}" type="audio/wav"/></item></channel></rss>`;
}
