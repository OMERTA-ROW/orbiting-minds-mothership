import { describe, expect, it } from "vitest";
import {
  canSend,
  candidateDeadline,
  copyrightChecklist,
  ingestEmail,
  rightsPath,
  specimenFlags,
  visibleTo,
  type Matter,
} from "@/lib/omni-rights";

const base = (id: string, clientId: string, ref: string): Matter => ({
  id,
  clientId,
  module: "trademark",
  title: "Fictional Mark",
  mark: "NOVAQUILL",
  goods: "Notebooks",
  jurisdiction: "US",
  state: "prepared",
  reference: ref,
  trustedSenders: ["notices@example.test"],
  contributions: [],
  files: [],
  messages: [],
  drafts: [],
  deadlines: [],
  history: [],
});
const msg = {
  id: "m1",
  from: "notices@example.test",
  subject: "Status for SN-0001",
  body: "Please confirm",
};

describe("Omni rights", () => {
  it("files to the trademark matter folder", () =>
    expect(rightsPath("Books", "Quill", base("tm1", "a", "SN-0001"), "Specimens")).toBe(
      "Omni Projects/Books/Quill/Rights/Trademarks/tm1/Specimens",
    ));
  it("flags missing URL/date and mockups", () => {
    expect(
      specimenFlags(base("x", "a", "r"), {
        name: "s",
        sha256: "h",
        folder: "Specimens",
        mockup: true,
      }),
    ).toHaveLength(3);
    expect(
      specimenFlags(base("x", "a", "r"), {
        name: "s",
        sha256: "h",
        folder: "Specimens",
        sourceUrl: "https://example.com",
        capturedAt: "2026-10-25T00:00:00Z",
      }),
    ).toEqual([]);
  });
  it("fee check is never auto-satisfied", () =>
    expect(copyrightChecklist(base("x", "a", "r")).at(-1)!.ok).toBe(false));
  it("email goes to the correct client matter and drafts a reply", () => {
    const r = ingestEmail([base("tm1", "a", "SN-0001"), base("tm2", "b", "SN-0001")], "a", msg);
    expect(r.matched).toBe("tm1");
    expect(r.matters[1]!.messages).toHaveLength(0);
    expect(r.matters[0]!.drafts).toHaveLength(1);
  });
  it("duplicate email is not refiled", () => {
    const once = ingestEmail([base("tm1", "a", "SN-0001")], "a", msg).matters;
    expect(ingestEmail(once, "a", msg).matters[0]!.messages).toHaveLength(1);
  });
  it("untrusted sender is held", () =>
    expect(
      ingestEmail([base("tm1", "a", "SN-0001")], "a", { ...msg, from: "x@evil.test" }).matched,
    ).toBeNull());
  it("legal content cannot auto-send", () =>
    expect(canSend("Response to office action", true).ok).toBe(false));
  it("no mailbox means blocked", () =>
    expect(canSend("Thanks, received.", false).reason).toMatch(/no client mailbox/));
  it("candidate deadlines are unconfirmed", () =>
    expect(candidateDeadline("Reply", "2026-12-01", "notice.pdf").confirmed).toBe(false));
  it("clients only see their own matters", () =>
    expect(visibleTo([base("1", "a", "r"), base("2", "b", "r")], "a").map((m) => m.id)).toEqual([
      "1",
    ]));
});
