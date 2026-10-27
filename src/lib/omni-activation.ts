export type OmniReadinessInput = {
  emailVerified: boolean;
  aiApproved: boolean;
  paused: boolean;
  ownedProjects: number;
  providerConfigured: boolean;
  providerStateReadable: boolean;
  providerBlocked: boolean;
  membership: "owner" | "admin" | "tester" | "unassigned" | "unavailable";
};

/** Readiness is permission/configuration evidence, never a successful model call. */
export function omniReadiness(input: OmniReadinessInput) {
  const blockers: string[] = [];
  if (input.membership === "unavailable" || input.membership === "unassigned")
    blockers.push(
      "Activate protected owner/member setup and confirm an assigned private membership.",
    );
  if (!input.emailVerified) blockers.push("Confirm your account email.");
  if (!input.aiApproved) blockers.push("Founder AI approval is required for this account.");
  if (input.paused) blockers.push("Account AI is paused; review before resuming.");
  if (input.ownedProjects < 1) blockers.push("Select or create a private project in your account.");
  if (!input.providerConfigured)
    blockers.push(
      "Lovable AI service configuration is missing; use Project Settings → Secrets, never chat.",
    );
  if (!input.providerStateReadable)
    blockers.push("AI availability could not be checked; no request may start.");
  if (input.providerBlocked)
    blockers.push("A saved provider block requires owner review; no automatic retry or reset.");
  return {
    state: blockers.length ? ("Blocked" as const) : ("Ready for reviewed request" as const),
    blockers,
    membership: input.membership,
    ownerAccounts:
      input.membership === "unavailable"
        ? "Blocked · owner/invitation setup not activated"
        : input.membership === "unassigned"
          ? "Blocked · no assigned membership"
          : "Verified membership",
    inferenceVerified: false as const,
    nativeConnected: false as const,
    executionAllowed: false as const,
    agents: "OMNI text agent built · activation and persisted inference not verified" as const,
  };
}
export type OmniReadiness = ReturnType<typeof omniReadiness> & { checkedAt: string; model: string };
