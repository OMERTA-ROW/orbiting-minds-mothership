import { z } from "zod";

export const jackboyLinkRequestSchema = z
  .object({
    action: z.enum(["handshake", "submit", "run", "status", "cancel"]),
    projectId: z.string().uuid(),
    approvalId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    confirm: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => (value.action === "handshake") === (value.jobId === undefined))
  .refine((value) => !["submit", "run"].includes(value.action) || value.confirm === true);

export function assertJackboyLinkScope(
  request: z.infer<typeof jackboyLinkRequestSchema>,
  callerId: string,
  configuration: {
    owner?: string | undefined;
    project?: string | undefined;
    approval?: string | undefined;
    selfTestEnabled?: string | undefined;
  },
) {
  if (
    !callerId ||
    callerId !== configuration.owner ||
    request.projectId !== configuration.project ||
    request.approvalId !== configuration.approval
  )
    throw new Error("Jackboy link owner, project or approval does not match.");
  if (
    (request.action === "submit" || request.action === "run") &&
    configuration.selfTestEnabled !== "true"
  )
    throw new Error("Protocol self-test is disabled.");
}
