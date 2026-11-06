import type { AccountabilityInput } from "./accountability";
import { artifactDigest } from "./trusted-release";
import { compareVaultCopy, syntaxReview } from "./code-vault";
import { codeContributions } from "@/data/evolution";
export async function compareAccountabilityArtifacts(v: AccountabilityInput) {
  if (!v.baselineText || !v.observedText)
    throw new Error(
      "Both supplied sample texts are required; no execution artifact is obtained here.",
    );
  const calculated = await artifactDigest(v.baselineText);
  const comparison = await compareVaultCopy(
    v.baselineText,
    v.baselineHash || calculated,
    v.observedText,
  );
  const code = codeContributions.find((c) => c.id === v.codeId);
  const syntax = code ? await syntaxReview(v.observedText, code.language) : null;
  const baselineMatches = v.baselineHash ? comparison.originalDigest === v.baselineHash : null;
  const observedMatches = v.observedHash ? comparison.copyDigest === v.observedHash : null;
  return {
    comparison,
    baselineMatches,
    observedMatches,
    syntax,
    status:
      baselineMatches === false || observedMatches === false || !comparison.matchesOrigin
        ? "MODIFIED / UNVERIFIED"
        : "HASH MATCH / UNSIGNED DEMO",
    signatureVerified: false as const,
    executionVerified: false as const,
    rootCauseVerified: false as const,
  };
}
