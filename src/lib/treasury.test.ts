import { describe, expect, it } from "vitest";
import { summarizeOmniLedger } from "./treasury";

describe("summarizeOmniLedger", () => {
  const now = new Date("2026-11-19T13:00:00.000Z");

  it("sums integer cents by UTC day, month, agent, and all time", () => {
    expect(
      summarizeOmniLedger(
        [
          { agent_id: "omni", cents: 99, created_at: "2026-11-19T12:00:00.000Z" },
          { agent_id: "omni", cents: 101, created_at: "2026-11-01T00:00:00.000Z" },
          { agent_id: "jax", cents: 500, created_at: "2026-10-31T23:59:59.000Z" },
        ],
        now,
      ),
    ).toEqual({
      totalCents: 700,
      dayCents: 99,
      monthCents: 200,
      byAgent: {
        omni: { totalCents: 200, dayCents: 99, monthCents: 200 },
        jax: { totalCents: 500, dayCents: 0, monthCents: 0 },
      },
    });
  });

  it("rejects amounts and timestamps that cannot be trusted", () => {
    expect(() =>
      summarizeOmniLedger([{ agent_id: "omni", cents: -1, created_at: now.toISOString() }], now),
    ).toThrow("invalid amount");
    expect(() =>
      summarizeOmniLedger([{ agent_id: "omni", cents: 1, created_at: "not-a-date" }], now),
    ).toThrow("invalid timestamp");
    expect(() =>
      summarizeOmniLedger(
        [{ agent_id: "omni", cents: 1, created_at: "2026-11-20T00:00:00.000Z" }],
        now,
      ),
    ).toThrow("invalid timestamp");
  });
});
