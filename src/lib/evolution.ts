import { z } from "zod";
import { assertNonSensitive, betaProjectInput } from "./beta";

export const evolutionProjectInput = betaProjectInput;
const safe = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .superRefine((value, ctx) => {
      try {
        assertNonSensitive(value);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Remove sensitive data.",
        });
      }
    });
const gitPath = safe(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/)
  .refine(
    (value) => !/\.\.|\/\/|\/\.|\.$|\/$/.test(value),
    "Use a relative path without traversal or hidden segments.",
  );
export const evolutionConfigInput = z
  .object({
    projectId: z.string().uuid(),
    expectedRevision: z.number().int().min(0),
    sourceUrl: safe(500).refine(
      (value) => value === "" || /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._/-]+$/.test(value),
      "Use an HTTPS repository address without credentials, query or fragment.",
    ),
    branch: gitPath,
    buildCommand: safe(500),
    outputDirectory: gitPath,
  })
  .strict();

export const EVOLUTION_NAV = [
  { label: "Home", to: "/" },
  { label: "My Projects", to: "/projects" },
  { label: "Neuro", to: "/neuro" },
  { label: "Repositories", to: "/repositories" },
  { label: "Pull Requests", to: "/pull-requests" },
  { label: "Actions", to: "/actions" },
  { label: "Migrations", to: "/migrations" },
  { label: "Deployments", to: "/deployments" },
  { label: "Settings", to: "/settings" },
] as const;

// No operational adapter is connected. Never infer readiness from legacy OMNI settings.
export const EVOLUTION_CAPABILITIES = {
  repositoryImport: false,
  buildExecution: false,
  stagingDeployment: false,
  productionDeployment: false,
  repositoryMerge: false,
  migrationExecution: false,
} as const;
export const EVOLUTION_BLOCKERS = {
  git: "No independent Git host is connected. Review a maintained private Git service, durable volume, backups, branch protection and scoped server credentials before importing.",
  reviews:
    "No Git review service is connected. Reviews and merges require protected branches and repository-specific owner authorization.",
  builds:
    "Locked pending sandbox. PR #28 merged the quarantine, not a verified execution service. An isolated runner, durable logs, cancellation/Stop evidence and owner-reviewed release are still required.",
  migrations:
    "No project database or backup/restore service is connected. Project migration execution needs a selected target, immutable checksums, dry-run support and a recovery test.",
  staging:
    "No staging deployment service is connected. Staging and rollback need immutable artifacts, release history and a verified previous release; production remains locked.",
} as const;
