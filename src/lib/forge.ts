import { z } from "zod";
import { mediaConsent } from "./quantum";
import { assertNonSensitive } from "./beta";

const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .superRefine((v, c) => {
      try {
        assertNonSensitive(v);
      } catch {
        c.addIssue({ code: "custom", message: "Remove sensitive or excluded project content." });
      }
    });
export const radioCue = z
  .object({
    start: z.number().finite().min(0).max(30),
    end: z.number().finite().min(0).max(30),
    action: z.enum(["silence", "tone", "cut"]),
    reviewed: z.literal(true),
  })
  .strict()
  .refine((v) => v.end > v.start, "Cue end must follow start");
export const radioSettings = z
  .object({
    label: z.enum([
      "Clean edit",
      "Explicit source",
      "Radio short",
      "Instrumental source",
      "Jingle / podcast",
    ]),
    cues: z.array(radioCue).max(12),
    fadeMs: z.number().int().min(0).max(100),
    channels: z.enum(["keep", "mono"]),
    maxSeconds: z.number().finite().min(0.01).max(30),
    maxSamplePeakDb: z.number().finite().min(-24).max(0),
    instrumentalSource: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.label !== "Instrumental source" || v.instrumentalSource,
    "Instrumental output requires an actual instrumental source; no stems are generated",
  )
  .refine(
    (v) => v.label !== "Explicit source" || v.cues.length === 0,
    "Explicit source preserves the submitted content",
  );
export const radioInput = z
  .object({
    id: z.string().uuid(),
    settings: radioSettings,
    consent: mediaConsent,
    approve: z.literal(true),
  })
  .strict();
export type RadioSettings = z.infer<typeof radioSettings>;
export const defaultRadioSettings: RadioSettings = {
  label: "Clean edit",
  cues: [],
  fadeMs: 10,
  channels: "keep",
  maxSeconds: 30,
  maxSamplePeakDb: 0,
  instrumentalSource: false,
};
export const webContent = z
  .object({
    brand: safeText(2, 100),
    category: z.enum(["Artist", "Show", "Book", "Original cartoon"]),
    headline: safeText(2, 140),
    description: safeText(10, 300),
    about: safeText(10, 1500),
    credits: safeText(2, 500),
    cta: safeText(2, 60),
    theme: z.enum(["gold", "forest", "rose"]),
    audioAssetId: z.string().uuid().nullable(),
  })
  .strict();
export type WebContent = z.infer<typeof webContent>;
export const webInput = z
  .object({ projectId: z.string().uuid(), content: webContent, consent: mediaConsent })
  .strict();
export const forgeReviewInput = z
  .object({ id: z.string().uuid(), consent: mediaConsent, approve: z.literal(true) })
  .strict();
export const forgeId = z.object({ id: z.string().uuid() }).strict();
export const initialWebContent: WebContent = {
  brand: "Your original project",
  category: "Artist",
  headline: "A new release",
  description: "A creator-owned release, with its story and credits ready for your review.",
  about:
    "Write the story of your original work here. Replace this sample copy before approving an export.",
  credits: "Add the creators and rights attribution for this release.",
  cta: "Explore the story",
  theme: "gold",
  audioAssetId: null,
};
export async function forgeDigest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function webDiff(previous: WebContent | null, current: WebContent) {
  return Object.keys(current)
    .filter(
      (key) => !previous || previous[key as keyof WebContent] !== current[key as keyof WebContent],
    )
    .map((key) => ({
      field: key,
      before: previous?.[key as keyof WebContent] ?? null,
      after: current[key as keyof WebContent],
    }));
}
