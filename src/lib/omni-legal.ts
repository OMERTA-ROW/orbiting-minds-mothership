import { legalSources } from "@/data/omni-legal-sources";

export type Jurisdiction = "federal" | "state" | "local";
export type PreparationState = "draft" | "ready-for-review";
export type FilingState = PreparationState | "submitted" | "accepted" | "rejected";
export type LegalDraft = {
  jurisdiction: Jurisdiction;
  region: string;
  court: string;
  caseNumber: string;
  documentTitle: string;
  partyA: string;
  partyB: string;
  body: string;
  privacyReviewed: boolean;
  exhibits: { id: string; title: string; original: string }[];
};
export type RequirementLink = {
  sourceId: string;
  codePath: string;
  testPath: string;
  applicability: "unresolved" | "reviewed";
  question: string;
};
export type LegalAuditEvent = {
  sequence: number;
  at: string;
  action: "sample-loaded" | "draft-edited" | "packet-prepared" | "exported" | "reset";
  jurisdiction: Jurisdiction;
  state: PreparationState;
};

export const transmissionGate = Object.freeze({
  enabled: false,
  status: "UNAVAILABLE",
  reason:
    "No supported authenticated court integration, scoped case access, authentic receipt verification or explicit transmission confirmation. Preparation/export only.",
});

export function sampleLegalDraft(): LegalDraft {
  return {
    jurisdiction: "federal",
    region: "",
    court: "",
    caseNumber: "",
    documentTitle: "Synthetic civil pleading",
    partyA: "Fictional Example A",
    partyB: "Fictional Example B",
    body: "1. This is a synthetic drafting exercise, not a real dispute.\n2. The example concerns a fictional delivery agreement.\n3. Requested relief and legal basis need responsible human review.",
    privacyReviewed: false,
    exhibits: [
      {
        id: "A",
        title: "Fictional delivery note",
        original:
          "SYNTHETIC EXHIBIT A\nAn imaginary parcel was recorded as delivered in this training example. No real people, transactions or case evidence.",
      },
      {
        id: "B",
        title: "Fictional correspondence",
        original:
          "SYNTHETIC EXHIBIT B\nExample A asks Example B to review an imaginary delivery. Not a real message and never sent.",
      },
    ],
  };
}

/** Any edited reviewed content requires a fresh privacy declaration. */
export function updateLegalDraft(draft: LegalDraft, patch: Partial<LegalDraft>): LegalDraft {
  const contentChanged = Object.keys(patch).some((key) => key !== "privacyReviewed");
  return { ...draft, ...patch, ...(contentChanged ? { privacyReviewed: false } : {}) };
}

/** Convenience redaction only. Names/minors/free-form identifiers cannot be detected reliably. */
export function redactLegalText(text: string): { text: string; count: number } {
  let count = 0;
  let output = text;
  for (const pattern of [
    /\b\d{3}-\d{2}-\d{4}\b/g,
    /\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g,
    /\b(?:account|acct)\s*(?:number|no\.?)?\s*[:#=]?\s*\d[\d -]{5,}\d\b/gi,
    /\b(?:token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s]+/gi,
  ]) {
    output = output.replace(pattern, () => {
      count++;
      return "[REDACTED]";
    });
  }
  return { text: output, count };
}

export function sourceChecklist(draft: LegalDraft) {
  const federal = draft.jurisdiction === "federal";
  return [
    {
      id: "court",
      label: "Exact court and jurisdiction",
      sourceId: federal ? "court-directory" : null,
      satisfied: Boolean(draft.court.trim()) && (federal || Boolean(draft.region.trim())),
      note: federal
        ? "Federal civil rules only; venue and subject-matter jurisdiction are not determined."
        : "State/local sources unavailable in this slice. Federal rules are not applied to this selection.",
    },
    {
      id: "caption",
      label: "Caption, case/file number & pleading designation",
      sourceId: federal ? "frcp-10" : null,
      satisfied: Boolean(
        draft.caseNumber.trim() &&
        draft.partyA.trim() &&
        draft.partyB.trim() &&
        draft.documentTitle.trim(),
      ),
      note: "For a new matter, case-number handling must be checked with the court; no number invented.",
    },
    {
      id: "privacy",
      label: "Redaction & human privacy review",
      sourceId: federal ? "frcp-5.2" : null,
      satisfied: draft.privacyReviewed,
      note: "Pattern redaction is incomplete. Review minors, identifiers, exceptions, sealed material and court orders manually.",
    },
    {
      id: "local",
      label: "Current local rules, standing orders & PDF limits",
      sourceId: federal ? "28-usc-2071" : null,
      satisfied: false,
      note: "Unresolved: court-specific format, accessibility, attachments and filing procedure not verified. Section 2071 provides rulemaking authority, not case-specific requirements.",
    },
    {
      id: "signature",
      label: "Responsible human signature & reasonable inquiry",
      sourceId: federal ? "frcp-11" : null,
      satisfied: false,
      note: "Not signed. Human factual, legal and procedural review remains required.",
    },
    {
      id: "deadlines",
      label: "Deadline, triggering event & service requirements",
      sourceId: null,
      satisfied: false,
      note: "UNVERIFIED — no deadline calculated, no service performed; court rules and trigger evidence required.",
    },
  ];
}

export function missingInformation(draft: LegalDraft): string[] {
  const fields: [string, string][] = [
    ["Exact court", draft.court],
    ["Document title", draft.documentTitle],
    ["First party", draft.partyA],
    ["Second party", draft.partyB],
    ["Draft body", draft.body],
    ["Case/file number or reviewed new-case handling", draft.caseNumber],
  ];
  const missing = fields.filter(([, value]) => !value.trim()).map(([label]) => label);
  if (draft.jurisdiction !== "federal" && !draft.region.trim()) missing.push("State/local region");
  if (!draft.privacyReviewed) missing.push("Human privacy review");
  return missing;
}

/** Ready FOR review is never ready to file, legal sufficiency or acceptance. */
export function preparationState(draft: LegalDraft): PreparationState {
  return missingInformation(draft).length === 0 ? "ready-for-review" : "draft";
}

/** No producer of authenticated court/provider evidence exists in this slice. */
export function requestFilingTransition(
  current: PreparationState,
  requested: FilingState,
): { state: PreparationState; allowed: boolean; reason: string } {
  if (requested === "submitted" || requested === "accepted" || requested === "rejected")
    return { state: current, allowed: false, reason: transmissionGate.reason };
  return {
    state: current,
    allowed: false,
    reason: "Preparation state is derived from the draft, not user-supplied status.",
  };
}

export function initialRequirementLinks(): RequirementLink[] {
  return [
    {
      sourceId: "28-usc-2071",
      codePath: "src/lib/omni-legal.ts#sourceChecklist",
      testPath: "src/test/omni-legal.test.ts",
      applicability: "unresolved",
      question:
        "Which court rules and effective dates govern this matter? This statute does not establish substantive software requirements or legal compliance.",
    },
    {
      sourceId: "frcp-5.2",
      codePath: "src/lib/omni-legal.ts#redactLegalText",
      testPath: "src/test/omni-legal.test.ts",
      applicability: "unresolved",
      question:
        "Does this product handle court filings? Review rule scope, exceptions, minors and manual redaction; this pattern filter alone is insufficient.",
    },
    {
      sourceId: "frcp-11",
      codePath: "src/lib/omni-legal.ts#requestFilingTransition",
      testPath: "src/test/omni-legal.test.ts",
      applicability: "unresolved",
      question:
        "Who is responsible for factual/legal inquiry and signature? No model or local approval can certify compliance.",
    },
  ];
}

export function reviewRequirement(link: RequirementLink, jurisdiction: Jurisdiction) {
  const source = legalSources.find((s) => s.id === link.sourceId);
  const problems: string[] = [];
  if (!source) problems.push("Unknown official source");
  if (source?.status === "proposal") problems.push("Proposal is not enacted/effective law");
  if (jurisdiction !== "federal")
    problems.push("Federal rule applicability to state/local software is unresolved");
  if (!source?.effectiveDate) problems.push("Rule-specific effective date needs verification");
  if (link.applicability !== "reviewed")
    problems.push("Applicability not reviewed by a responsible human");
  if (!link.codePath.trim() || !link.testPath.trim()) problems.push("Code/test reference missing");
  if (link.question.trim()) problems.push(link.question);
  return {
    source,
    problems,
    claim:
      "Traceability only — not automatic legal compliance; test references do not prove tests ran.",
  };
}

/** Fixed metadata only; no draft/exhibit contents, names, paths or credentials. Session-local and editable, not trusted audit. */
export function appendLegalAudit(
  events: LegalAuditEvent[],
  action: LegalAuditEvent["action"],
  draft: LegalDraft,
  at = new Date().toISOString(),
): LegalAuditEvent[] {
  return [
    ...events,
    {
      sequence: (events.at(-1)?.sequence ?? 0) + 1,
      at,
      action,
      jurisdiction: draft.jurisdiction,
      state: preparationState(draft),
    },
  ].slice(-100);
}
