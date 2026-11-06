/** Rights workspace (local). Organises matters; never files, pays, signs or sends. Not legal advice or representation. */
export type Module = "copyright" | "trademark" | "copywriting";
export type MatterState =
  "prepared" | "submitted" | "receipt-confirmed" | "pending-action" | "registered";
export type RightsFile = {
  name: string;
  sha256: string;
  folder:
    | "Originals"
    | "Evidence"
    | "Specimens"
    | "Drafts"
    | "Submitted"
    | "Receipts"
    | "Certificates"
    | "Correspondence";
  sourceUrl?: string | undefined;
  capturedAt?: string | undefined;
  mockup?: boolean | undefined;
};
export type Contribution = { who: string; kind: "human" | "ai"; part: string };
export type Matter = {
  id: string;
  clientId: string;
  module: Module;
  title: string;
  mark?: string;
  goods?: string;
  jurisdiction: "US";
  state: MatterState;
  reference?: string;
  trustedSenders: string[];
  contributions: Contribution[];
  files: RightsFile[];
  messages: { id: string; from: string; subject: string; body: string }[];
  drafts: string[];
  deadlines: Deadline[];
  history: string[];
};
export type Deadline = {
  label: string;
  date: string;
  source: string;
  timezone: string;
  confirmed: boolean;
};

export const rightsPath = (
  category: string,
  project: string,
  m: Matter,
  folder: RightsFile["folder"],
) =>
  `Omni Projects/${category}/${project}/Rights/${m.module === "trademark" ? "Trademarks" : m.module === "copyright" ? "Copyright" : "Licenses"}/${m.id}/${folder}`;

export const ADAPTERS = [
  {
    id: "copyright-office",
    name: "U.S. Copyright Office",
    url: "https://www.copyright.gov/registration/",
    status: "Portal handoff only — no tested filing API",
  },
  {
    id: "uspto",
    name: "USPTO Trademarks",
    url: "https://www.uspto.gov/trademarks",
    status: "Portal handoff only — no tested filing API",
  },
  {
    id: "mailbox",
    name: "Client mailbox",
    url: "",
    status: "Blocked — no client mailbox connected",
  },
] as const;

/** Specimen review flags. Passing flags is not USPTO acceptance. */
export function specimenFlags(m: Matter, f: RightsFile): string[] {
  const out: string[] = [];
  if (f.mockup) out.push("Conceptual mockup — cannot be a specimen.");
  if (!f.sourceUrl) out.push("Missing source URL.");
  if (!f.capturedAt) out.push("Missing access/capture date.");
  else if (Date.parse(f.capturedAt) > Date.now()) out.push("Capture date is in the future.");
  if (!m.mark) out.push("No mark recorded for this matter.");
  if (!m.goods) out.push("No goods/services recorded.");
  return out;
}

export function copyrightChecklist(m: Matter): { item: string; ok: boolean }[] {
  return [
    { item: "Author(s) listed", ok: m.contributions.length > 0 },
    {
      item: "AI-generated parts identified separately",
      ok:
        m.contributions.every((c) => c.kind === "human") ||
        m.contributions.some((c) => c.kind === "ai"),
    },
    { item: "Deposit copy in Originals", ok: m.files.some((f) => f.folder === "Originals") },
    { item: "Fees and current rules checked on copyright.gov", ok: false },
  ];
}

/** Ingest an email: only matches a matter of the same client by reference AND trusted sender; content is untrusted. */
export function ingestEmail(
  matters: Matter[],
  clientId: string,
  msg: { id: string; from: string; subject: string; body: string },
): { matters: Matter[]; matched: string | null; reason: string } {
  const target = matters.find(
    (m) =>
      m.clientId === clientId && m.reference && `${msg.subject} ${msg.body}`.includes(m.reference),
  );
  if (!target)
    return {
      matters,
      matched: null,
      reason: "No matter reference found for this client; held for review.",
    };
  if (!target.trustedSenders.includes(msg.from.toLowerCase()))
    return { matters, matched: null, reason: "Sender not in trusted records; held for review." };
  if (target.messages.some((x) => x.id === msg.id))
    return { matters, matched: target.id, reason: "Duplicate message ignored." };
  const draft = `Draft acknowledgment for ${target.reference}: Thank you, we received your message "${msg.subject}". (Not sent; not an official response.)`;
  const updated = {
    ...target,
    messages: [...target.messages, msg],
    drafts: [...target.drafts, draft],
    history: [...target.history, `email ${msg.id} filed to Correspondence`],
  };
  return {
    matters: matters.map((m) => (m.id === target.id ? updated : m)),
    matched: target.id,
    reason: "Filed and draft prepared.",
  };
}

const RESTRICTED =
  /(office action|argument|amend|abandon|declar|sign|payment|fee|admit|final filing)/i;
/** Send policy: routine templates only, and only with a connected mailbox. Nothing connected here. */
export function canSend(draft: string, mailboxConnected: boolean): { ok: boolean; reason: string } {
  if (RESTRICTED.test(draft))
    return {
      ok: false,
      reason: "Legal/filing content requires applicant or representative review.",
    };
  if (!mailboxConnected)
    return { ok: false, reason: "Blocked: no client mailbox connected and authorized." };
  return { ok: true, reason: "Routine template within policy." };
}

/** Candidate deadlines are never authoritative until a reviewer confirms. */
export const candidateDeadline = (label: string, date: string, source: string): Deadline => ({
  label,
  date,
  source,
  timezone: "America/New_York",
  confirmed: false,
});

export const visibleTo = (matters: Matter[], clientId: string) =>
  matters.filter((m) => m.clientId === clientId);
