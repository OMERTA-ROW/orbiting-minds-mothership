/**
 * Browser-environment (jsdom) flow test: a signed-in owner sends a held OMNI
 * Terminal task to a MOCKED Jackboy endpoint through the real panel, the real
 * server handlers and the real signer. The mock independently verifies every
 * jackboy.omni-handoff/v1 rule with node:crypto and signs its replies. No
 * network, no real Jackboy, no real settings.
 */
import { createHash, createHmac } from "node:crypto";
import { useCallback, useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "fixture-only-handoff-secret-0123456789abcdef"; // never a real value
const ORIGIN = "https://jackboy-mock.example.com";
const CLIENT = "mothership-fixture";
const TASK = "7d3c1f0e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const PROJECT = "6e320e65-08ec-450b-8a26-61206b604513";
const OWNER = "40543e40-5202-4219-a852-ead1c659e9a9";

const s = vi.hoisted(() => ({
  ownerOk: true,
  stopEngaged: false,
  handoff: null as null | Record<string, unknown>,
  begin: vi.fn(),
  recordCalls: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-start", () => {
  const createServerFn = () => {
    let validate = (x: unknown) => x;
    const chain = {
      middleware: () => chain,
      inputValidator: (v: (x: unknown) => unknown) => ((validate = v), chain),
      // The browser calls fn({ data }); the "server" adds the signed-in owner context.
      handler: (fn: (a: unknown) => unknown) => async (args?: { data?: unknown }) =>
        JSON.parse(
          JSON.stringify(
            await fn({
              data: validate(args?.data),
              context: { supabase: db(), userId: OWNER, claims: { aal: "aal2" } },
            }),
          ),
        ),
    };
    return chain;
  };
  return { createServerFn, useServerFn: (fn: unknown) => fn };
});
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: () => undefined,
  getRequestHeader: () => "Bearer fixture-session",
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/razul-owner.server", () => ({
  requireRazulOwner: async () => {
    if (!s.ownerOk) throw new Error("Verified owner identity is required.");
  },
}));
vi.mock("@/lib/omni-terminal.server", () => ({
  assertEmergencyStopReleased: async () => {
    if (s.stopEngaged) throw new Error("Emergency Stop is engaged.");
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("omni_task_handoff_record");
      s.recordCalls.push(args);
      s.handoff = {
        task_id: args["_task"],
        job_kind: "test",
        jackboy_job_id: args["_job"],
        status: args["_status"],
        detail: args["_detail"],
        updated_at: "2026-11-12T06:30:00Z",
      };
      return { data: true, error: null };
    },
  },
}));

const TASK_ROW = {
  id: TASK,
  agent: "jackboy",
  kind: "code.test",
  state: "held",
  project_label: "Jackboy Dev Control",
  repository: "OMERTA-ROW/jackboy-dev-control",
  instructions: "Run the unit tests and report failures.",
};
function db() {
  return {
    rpc: async (name: string, args: unknown) => {
      expect(name).toBe("omni_task_handoff_begin");
      s.begin(args);
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "omni_terminal_tasks" ? TASK_ROW : s.handoff,
            error: null,
          }),
        }),
        order: () => ({ limit: async () => ({ data: s.handoff ? [s.handoff] : [], error: null }) }),
      }),
    }),
  };
}

import { TaskHandoff, type HandoffRow } from "@/components/omnibridge/TaskHandoff";
import { readTaskHandoffs } from "@/lib/jackboy-handoff.functions";

/** Mocked Jackboy: checks the exact v1 request rules, then signs its reply. */
type Mode = "ok" | "bad_proof" | "unsigned_503" | "signed_refusal";
function mockJackboy(mode: Mode = "ok") {
  const seen = new Set<string>();
  const requests: { headers: Record<string, string>; body: string }[] = [];
  const hmac = (m: string) => createHmac("sha256", SECRET).update(m).digest("hex");
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(Object.entries(init.headers as Record<string, string>));
    const body = String(init.body);
    requests.push({ headers, body });
    expect(url).toBe(`${ORIGIN}/api/public/omni-handoff/v1`);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-jackboy-contract"]).toBe("jackboy.omni-handoff/v1");
    expect(headers["x-jackboy-client"]).toBe(CLIENT);
    const ts = headers["x-jackboy-timestamp"]!;
    expect(ts).toMatch(/^\d{10}$/);
    expect(Math.abs(Number(ts) - Date.now() / 1000)).toBeLessThanOrEqual(60);
    const nonce = headers["x-jackboy-nonce"]!;
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(seen.has(nonce)).toBe(false);
    seen.add(nonce);
    const signing = `jackboy.omni-handoff/v1\nPOST\n/api/public/omni-handoff/v1\n${CLIENT}\n${ts}\n${nonce}\n${body}`;
    expect(headers["x-jackboy-signature"]).toBe(hmac(signing));
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(8192);
    const parsed = JSON.parse(body);
    if (parsed.action === "create") {
      expect(Object.keys(parsed).sort()).toEqual(
        ["action", "digest", "instructions", "kind", "projectId", "repo", "taskId"].sort(),
      );
      expect(parsed).toMatchObject({
        taskId: TASK,
        projectId: PROJECT,
        repo: "OMERTA-ROW/jackboy-dev-control",
        kind: "test",
        instructions: TASK_ROW.instructions,
      });
      expect(parsed.digest).toBe(createHash("sha256").update(TASK_ROW.instructions).digest("hex"));
    } else expect(parsed).toEqual({ action: "status", taskId: TASK });

    if (mode === "unsigned_503") return new Response("Service Unavailable", { status: 503 });
    const status = mode === "signed_refusal" ? 403 : parsed.action === "create" ? 201 : 200;
    const reply = JSON.stringify(
      mode === "signed_refusal"
        ? {
            contract: "jackboy.omni-handoff/v1",
            requestNonce: nonce,
            error: "project_not_authorized",
          }
        : {
            contract: "jackboy.omni-handoff/v1",
            requestNonce: nonce,
            jackboyJobId: "jb_fixture_1",
            status: parsed.action === "create" ? "queued" : "quarantined",
          },
    );
    const proof = hmac(`jackboy.omni-handoff/v1\nresponse\n${nonce}\n${status}\n${reply}`);
    return new Response(reply, {
      status,
      headers: {
        "content-type": "application/json",
        "x-jackboy-proof":
          mode === "bad_proof" ? proof.replace(/^./, (c) => (c === "0" ? "1" : "0")) : proof,
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

/** Owner panel as rendered in OMNI Terminal: settings read by the server, then the held task. */
function Harness() {
  const [state, setState] = useState<{ rows: HandoffRow[]; configured: boolean } | null>(null);
  const load = useCallback(async () => {
    const r = (await (readTaskHandoffs as unknown as () => Promise<Record<string, unknown>>)()) as {
      handoffs: HandoffRow[];
      configured: boolean;
    };
    setState({ rows: r.handoffs, configured: r.configured });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!state) return <p>Loading…</p>;
  return (
    <TaskHandoff
      task={TASK_ROW}
      handoff={state.rows.find((h) => h.task_id === TASK)}
      configured={state.configured}
      stopEngaged={s.stopEngaged}
      onChanged={load}
    />
  );
}

function configure(over: Partial<Record<string, string>> = {}) {
  const env = {
    JACKBOY_HANDOFF_ENABLED: "true",
    JACKBOY_HANDOFF_ORIGIN: ORIGIN,
    JACKBOY_HANDOFF_CLIENT_ID: CLIENT,
    JACKBOY_HANDOFF_HMAC_SECRET: SECRET,
    ...over,
  };
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? "");
}

beforeEach(() => {
  s.ownerOk = true;
  s.stopEngaged = false;
  s.handoff = null;
  s.recordCalls = [];
  s.begin.mockReset();
  for (const k of ["ENABLED", "ORIGIN", "CLIENT_ID", "HMAC_SECRET"])
    vi.stubEnv(`JACKBOY_HANDOFF_${k}`, "");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sendButton = () => screen.findByRole("button", { name: "Send to Jackboy" });

describe("signed-in owner handoff to a mocked Jackboy", () => {
  it("queues the held task, then shows Jackboy's signed status, without exposing the secret", async () => {
    configure();
    const jb = mockJackboy("ok");
    const { container } = render(<Harness />);
    const send = await sendButton();
    expect((screen.getByLabelText("Jackboy project id") as HTMLInputElement).value).toBe(PROJECT);
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(
      await screen.findByText("Sent. Approve it with your passkey in Jackboy."),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Queued in Jackboy · needs your passkey/)).toBeInTheDocument();
    expect(screen.getByText(/job jb_fixture_1/)).toBeInTheDocument();
    expect(s.begin).toHaveBeenCalledTimes(1);
    expect(s.recordCalls.at(-1)).toMatchObject({
      _status: "queued",
      _detail: "jackboy:queued",
      _job: "jb_fixture_1",
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText(/Quarantined by OMNI/)).toBeInTheDocument();
    expect(jb.fetchMock).toHaveBeenCalledTimes(2);

    // The secret never reaches the page, the request, or the saved record.
    expect(container.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify(jb.requests)).not.toContain(SECRET);
    expect(JSON.stringify(s.recordCalls)).not.toContain(SECRET);
  });

  it("discards a reply with a wrong proof as Not confirmed", async () => {
    configure();
    mockJackboy("bad_proof");
    render(<Harness />);
    fireEvent.click(await sendButton());
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Not confirmed · retry. Jackboy's reply was not signed correctly, so it was not trusted.",
      ),
    );
    expect(s.recordCalls.at(-1)).toMatchObject({
      _status: "error",
      _detail: "reply_unsigned",
      _job: null,
    });
    expect(screen.queryByText(/Queued in Jackboy/)).toBeNull();
  });

  it("treats an unsigned 503 as not confirmed", async () => {
    configure();
    mockJackboy("unsigned_503");
    render(<Harness />);
    fireEvent.click(await sendButton());
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/^Not confirmed · retry\./),
    );
    expect(s.recordCalls.at(-1)).toMatchObject({ _status: "error", _detail: "reply_unsigned" });
  });

  it("shows Jackboy's signed refusal in plain words", async () => {
    configure();
    mockJackboy("signed_refusal");
    render(<Harness />);
    fireEvent.click(await sendButton());
    expect(
      await screen.findByText(
        "That Jackboy project id is not authorized for this repository in Jackboy.",
      ),
    ).toBeInTheDocument();
  });

  it("sends nothing when the signed-in user is not the verified owner", async () => {
    configure();
    const jb = mockJackboy("ok");
    render(<Harness />);
    const send = await sendButton();
    s.ownerOk = false;
    fireEvent.click(send);
    expect(
      await screen.findByText(/Not confirmed. Check your sign-in and two-factor/),
    ).toBeInTheDocument();
    expect(jb.fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing while Emergency Stop is engaged", async () => {
    configure();
    const jb = mockJackboy("ok");
    s.stopEngaged = true;
    render(<Harness />);
    expect(await sendButton()).toBeDisabled();
    expect(screen.getByText("Emergency Stop is engaged.")).toBeInTheDocument();
    expect(jb.fetchMock).not.toHaveBeenCalled();
  });
});

describe("missing or invalid settings keep sending disabled", () => {
  const cases: [string, Partial<Record<string, string>>][] = [
    [
      "no settings at all",
      {
        JACKBOY_HANDOFF_ENABLED: "",
        JACKBOY_HANDOFF_ORIGIN: "",
        JACKBOY_HANDOFF_CLIENT_ID: "",
        JACKBOY_HANDOFF_HMAC_SECRET: "",
      },
    ],
    ["switch not set to true", { JACKBOY_HANDOFF_ENABLED: "" }],
    ["switch is 'yes'", { JACKBOY_HANDOFF_ENABLED: "yes" }],
    ["address missing", { JACKBOY_HANDOFF_ORIGIN: "" }],
    ["address not HTTPS", { JACKBOY_HANDOFF_ORIGIN: "http://jackboy-mock.example.com" }],
    ["address is local", { JACKBOY_HANDOFF_ORIGIN: "https://localhost" }],
    ["client id missing", { JACKBOY_HANDOFF_CLIENT_ID: "" }],
    ["client id malformed", { JACKBOY_HANDOFF_CLIENT_ID: "bad id!" }],
    ["shared secret missing", { JACKBOY_HANDOFF_HMAC_SECRET: "" }],
    ["shared secret too short", { JACKBOY_HANDOFF_HMAC_SECRET: "short-fixture-value" }],
  ];
  it.each(cases)("%s", async (_label, over) => {
    configure(over);
    const jb = mockJackboy("ok");
    const { container } = render(<Harness />);
    const send = await sendButton();
    expect(send).toBeDisabled();
    expect(screen.getByText("Jackboy handoff is not set up yet.")).toBeInTheDocument();

    // Even a forged direct call to the server function sends nothing.
    const r = await (
      (
        await import("@/lib/jackboy-handoff.functions")
      ).sendTaskToJackboy as unknown as (a: unknown) => Promise<unknown>
    )({ data: { taskId: TASK, kind: "test", jackboyProjectId: PROJECT } });
    expect(r).toEqual({
      ok: false,
      message: "The Jackboy handoff is not configured or is turned off.",
    });
    expect(jb.fetchMock).not.toHaveBeenCalled();
    expect(s.begin).not.toHaveBeenCalled();

    // The settings report carries names and presence only, never values.
    const read = (await (
      readTaskHandoffs as unknown as () => Promise<Record<string, unknown>>
    )()) as {
      settings: unknown;
      configured: boolean;
    };
    expect(read.configured).toBe(false);
    const report = JSON.stringify(read);
    expect(report).not.toContain(SECRET);
    expect(report).not.toContain("short-fixture-value");
    expect(report).not.toContain(CLIENT);
    expect(report).not.toContain("jackboy-mock.example.com");
    expect(container.innerHTML).not.toContain(SECRET);
  });
});
