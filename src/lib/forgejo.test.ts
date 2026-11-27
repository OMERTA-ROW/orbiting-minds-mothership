import { describe, expect, it } from "vitest";
import { forgejoOrigin, listForgejoRepos } from "./forgejo";

const repo = (id: number) => ({
  id,
  full_name: `OMERTA-ROW/r${id}`,
  private: true,
  default_branch: "main",
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("forgejo read-only provider", () => {
  it("reports both missing settings", async () => {
    expect(await listForgejoRepos({})).toEqual({
      state: "not_configured",
      missing: ["FORGEJO_BASE_URL", "FORGEJO_API_TOKEN"],
    });
  });
  it("refuses localhost and plain http", () => {
    expect(forgejoOrigin("http://localhost:3000")).toBeNull();
    expect(forgejoOrigin("https://127.0.0.1:3000")).toBeNull();
    expect(forgejoOrigin("http://git.example.com")).toBeNull();
    expect(forgejoOrigin("https://git.example.com/")).toBe("https://git.example.com");
  });
  it("paginates, dedupes and uses GET only", async () => {
    const methods: string[] = [];
    const pages = [Array.from({ length: 50 }, (_, i) => repo(i)), [repo(1), repo(60)]];
    const f = (async (_u: string, init?: RequestInit) => {
      methods.push(init?.method ?? "");
      return ok(pages.shift() ?? []);
    }) as typeof fetch;
    const r = await listForgejoRepos({ base: "https://git.example.com", token: "t" }, f);
    expect(r.state === "connected" && r.repos.length).toBe(51);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
  });
  it("never reports success on a refused token", async () => {
    const f = (async () => new Response("", { status: 401 })) as typeof fetch;
    expect((await listForgejoRepos({ base: "https://git.example.com", token: "t" }, f)).state).toBe(
      "unreachable",
    );
  });
});
