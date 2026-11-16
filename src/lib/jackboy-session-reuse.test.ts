import { describe, expect, it } from "vitest";
import {
  HANDSHAKE_BUCKET_MS,
  JackboyLink,
  JackboyLinkError,
  handshakeIdFor,
  refusalStage,
} from "./jackboy-link.server";
import { FakeJackboy, fakeLinkConfig } from "@/test/support/fake-jackboy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("shared Jackboy session (idempotent handshake ID)", () => {
  it("derives one valid UUID per 4-minute window, keyed to the link", () => {
    const c = fakeLinkConfig();
    const t = Math.floor(Date.now() / HANDSHAKE_BUCKET_MS) * HANDSHAKE_BUCKET_MS;
    expect(handshakeIdFor(c, t)).toMatch(UUID);
    expect(handshakeIdFor(c, t + HANDSHAKE_BUCKET_MS - 1)).toBe(handshakeIdFor(c, t));
    expect(handshakeIdFor(c, t + HANDSHAKE_BUCKET_MS)).not.toBe(handshakeIdFor(c, t));
    expect(handshakeIdFor({ ...c, secret: "z".repeat(48) }, t)).not.toBe(handshakeIdFor(c, t));
  });

  it("separate requests in the same window reuse one session instead of opening new ones", async () => {
    const fake = new FakeJackboy();
    const c = fakeLinkConfig();
    for (let i = 0; i < 12; i++)
      await new JackboyLink(c, async () => {}, { fetch: fake.fetch }).safety();
    expect(fake.sessions.size).toBe(1);
  });

  it("without reuse, the twelve reads would hit Jackboy's eight-session limit", async () => {
    const fake = new FakeJackboy();
    fake.idempotentUnavailable = true;
    const c = fakeLinkConfig();
    const events: string[] = [];
    const read = () =>
      new JackboyLink(c, async (e) => void events.push(e), { fetch: fake.fetch }).safety();
    for (let i = 0; i < 8; i++) await read();
    await expect(read()).rejects.toMatchObject({ code: "session_limit", status: 429 });
    // The fallback is audited every time, never silent.
    expect(events.filter((e) => e === "handshake_reuse_unavailable").length).toBe(9);
  });

  it("rotates to a new ID only on a signed expired/conflict refusal", async () => {
    const fake = new FakeJackboy();
    const c = fakeLinkConfig();
    fake.conflictHandshakeIds.add(handshakeIdFor(c, Date.now()));
    const events: string[] = [];
    await new JackboyLink(c, async (e) => void events.push(e), { fetch: fake.fetch }).safety();
    expect(events).toContain("handshake_id_rotated");
    expect(fake.sessions.size).toBe(1);
  });

  it("an unsigned conflict does not rotate (fails closed)", async () => {
    const c = fakeLinkConfig();
    const unsigned = async () =>
      new Response(JSON.stringify({ error: "handshake_id_expired_or_conflict" }), { status: 409 });
    await expect(
      new JackboyLink(c, async () => {}, { fetch: unsigned }).connect(),
    ).rejects.toBeInstanceOf(JackboyLinkError);
  });

  it("a disabled link is not retried as a legacy handshake", async () => {
    let calls = 0;
    const disabled = async () => {
      calls++;
      return new Response(JSON.stringify({ error: "link_disabled" }), { status: 503 });
    };
    await expect(
      new JackboyLink(fakeLinkConfig(), async () => {}, { fetch: disabled }).connect(),
    ).rejects.toMatchObject({ code: "link_disabled" });
    expect(calls).toBe(1);
  });
});

describe("Jackboy refusal stage", () => {
  it("keeps only allowlisted stages", () => {
    expect(refusalStage(JSON.stringify({ error: "x", stage: "verification" }))).toBe("verification");
    expect(refusalStage(JSON.stringify({ error: "x", stage: "elsewhere" }))).toBeUndefined();
    expect(refusalStage("not json")).toBeUndefined();
  });
});
