import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const ownerId = "f1b3d943-c6ee-4ed1-abce-f08ba1493734";
  const sessionId = "f1b3d943-c6ee-4ed1-abce-f08ba1493735";
  const jobId = "f1b3d943-c6ee-4ed1-abce-f08ba1493736";
  const state = { sessionOwner: ownerId, sessionAgent: "omni", jobMatches: true };
  const updates = vi.fn();
  const db = {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (name: string, value: string) => {
          filters[name] = value;
          return query;
        },
        maybeSingle: async () => {
          if (table === "omni_agent_steps")
            return {
              data: {
                job_id: jobId,
                remote_id: "cmd",
                session_id: sessionId,
                agent_id: "omni",
              },
              error: null,
            };
          if (table === "omni_workspace_approvals") return { data: null, error: null };
          if (table === "omni_workspace_sessions")
            return {
              data: { owner_id: state.sessionOwner, agent_id: state.sessionAgent },
              error: null,
            };
          if (table === "omni_agent_jobs") {
            const matches =
              state.jobMatches &&
              filters["id"] === jobId &&
              filters["session_id"] === sessionId &&
              filters["agent_id"] === "omni";
            return { data: matches ? { id: jobId } : null, error: null };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      };
      return query;
    },
  };
  const admin = {
    from: () => {
      const query = Object.assign(Promise.resolve({ error: null }), { eq: () => query });
      return { update: updates.mockReturnValue(query) };
    },
  };
  return {
    ownerId,
    sessionId,
    jobId,
    state,
    db,
    admin,
    updates,
    requireOwner: vi.fn(),
    gateFor: vi.fn(),
    activeSession: vi.fn(),
    relay: vi.fn(),
    audit: vi.fn(),
    ingest: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mocks.admin }));
vi.mock("@/lib/razul-owner.server", () => ({ requireRazulOwner: mocks.requireOwner }));
vi.mock("@/lib/omni-passkey.server", () => ({}));
vi.mock("@/lib/omni-workspace.server", () => ({
  gateFor: mocks.gateFor,
  activeSession: mocks.activeSession,
  relay: mocks.relay,
  audit: mocks.audit,
  ingest: mocks.ingest,
}));

import { decideStep } from "@/lib/omni-workspace.functions";

describe("workspace decision binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.sessionOwner = mocks.ownerId;
    mocks.state.sessionAgent = "omni";
    mocks.state.jobMatches = true;
    mocks.gateFor.mockResolvedValue({ gate: { open: true }, link: {} });
    mocks.activeSession.mockResolvedValue({ agent: { id: "omni" } });
    mocks.relay.mockResolvedValue({ steps: [] });
  });

  const decide = () =>
    Reflect.apply(decideStep, undefined, [
      {
        context: { supabase: mocks.db, userId: mocks.ownerId, claims: {} },
        data: { stepId: "step", approve: true },
      },
    ]);

  it("sends the owner, session and job in the signed relay payload", async () => {
    expect(await decide()).toMatchObject({ ok: true });
    expect(mocks.relay).toHaveBeenCalledWith(
      {},
      "step.decide",
      expect.objectContaining({
        ownerId: mocks.ownerId,
        sessionId: mocks.sessionId,
        jobId: mocks.jobId,
        stepId: "cmd",
        approve: true,
      }),
    );
  });

  it("does not mutate or relay another owner's decision", async () => {
    mocks.state.sessionOwner = "f1b3d943-c6ee-4ed1-abce-f08ba1493737";
    expect(await decide()).toMatchObject({ ok: false, message: expect.stringMatching(/owner/) });
    expect(mocks.updates).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("does not mutate or relay a job that does not match the session and agent", async () => {
    mocks.state.jobMatches = false;
    expect(await decide()).toMatchObject({ ok: false, message: expect.stringMatching(/job/) });
    expect(mocks.updates).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("does not mutate or relay a decision for a different session agent", async () => {
    mocks.state.sessionAgent = "other";
    expect(await decide()).toMatchObject({ ok: false, message: expect.stringMatching(/agent/) });
    expect(mocks.updates).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});
