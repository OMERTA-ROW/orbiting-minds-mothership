import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ owner: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: (value: unknown) => unknown) => {
        validator = fn;
        return builder;
      },
      handler:
        (fn: (args: unknown) => unknown) =>
        (args: { data?: unknown } = {}) =>
          fn({
            data: args.data === undefined ? undefined : validator(args.data),
            context: {
              userId: "11111111-1111-4111-8111-111111111111",
              claims: { aal: "aal2" },
              supabase: { rpc: state.rpc, from: state.from },
            },
          }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: state.owner }));

import {
  createEvolutionProject,
  readEvolutionWorkspace,
  saveEvolutionConfig,
} from "./evolution.functions";

const config = {
  projectId: "22222222-2222-4222-8222-222222222222",
  expectedRevision: 3,
  sourceUrl: "",
  branch: "main",
  buildCommand: "bun run build",
  outputDirectory: "dist",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.owner.mockResolvedValue(undefined);
});

describe("Evolution authorized operations", () => {
  it("does not read private records when owner/MFA verification fails", async () => {
    state.owner.mockRejectedValue(new Error("denied"));
    expect((await readEvolutionWorkspace()).ok).toBe(false);
    expect(state.from).not.toHaveBeenCalled();
  });
  it("does not create a project when owner verification fails", async () => {
    state.owner.mockRejectedValue(new Error("denied"));
    await expect(
      createEvolutionProject({ data: { name: "Private test", brief: "" } }),
    ).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("creates a real project record only via the owner checked RPC", async () => {
    state.rpc.mockResolvedValue({ data: config.projectId, error: null });
    expect(await createEvolutionProject({ data: { name: "Private test", brief: "" } })).toEqual({
      projectId: config.projectId,
    });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("evolution_project_create", {
      _name: "Private test",
      _brief: "",
    });
  });
  it("passes the expected revision and displays only the recorded receipt", async () => {
    state.rpc.mockResolvedValue({
      data: { revision: 4, created_at: "2026-11-26T01:00:00Z" },
      error: null,
    });
    expect(await saveEvolutionConfig({ data: config })).toEqual({
      revision: 4,
      createdAt: "2026-11-26T01:00:00Z",
    });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("evolution_config_save", {
      _project: config.projectId,
      _expected_revision: 3,
      _source: "",
      _branch: "main",
      _command: "bun run build",
      _output: "dist",
    });
  });
  it("does not report success after stale configuration rejection", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { message: "Configuration changed; reload before saving" },
    });
    await expect(saveEvolutionConfig({ data: config })).rejects.toThrow("another session");
  });
  it("does not expose backend error details", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "sensitive backend diagnostic" } });
    await expect(saveEvolutionConfig({ data: config })).rejects.not.toThrow(
      "sensitive backend diagnostic",
    );
  });
});
