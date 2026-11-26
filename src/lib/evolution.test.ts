import { describe, expect, it } from "vitest";
import { EVOLUTION_CAPABILITIES, evolutionConfigInput } from "./evolution";

const config = {
  projectId: "11111111-1111-4111-8111-111111111111",
  expectedRevision: 0,
  sourceUrl: "https://github.com/owner/authorized-test.git",
  branch: "main",
  buildCommand: "bun run build",
  outputDirectory: "dist",
};
describe("Evolution configuration safety", () => {
  it("accepts non-sensitive configuration without conferring execution", () => {
    expect(evolutionConfigInput.parse(config)).toEqual(config);
    expect(Object.keys(evolutionConfigInput.parse(config))).not.toContain("execute");
  });
  it.each([
    "https://token@github.com/owner/repo",
    "http://github.com/owner/repo",
    "https://github.com/owner/repo?token=abc",
    "https://github.com/owner/repo#secret",
  ])("rejects unsafe source %s", (sourceUrl) => {
    expect(evolutionConfigInput.safeParse({ ...config, sourceUrl }).success).toBe(false);
  });
  it.each(["../dist", "/dist", "dist/../../etc", "dist//out"])(
    "rejects output traversal %s",
    (outputDirectory) => {
      expect(evolutionConfigInput.safeParse({ ...config, outputDirectory }).success).toBe(false);
    },
  );
  it("rejects secrets in build commands", () => {
    expect(
      evolutionConfigInput.safeParse({ ...config, buildCommand: "API_KEY=private-value bun build" })
        .success,
    ).toBe(false);
  });
  it("rejects attempted production authority", () => {
    expect(evolutionConfigInput.safeParse({ ...config, production: true }).success).toBe(false);
  });
  it("keeps execution locked when no reviewed sandbox exists", () => {
    expect(EVOLUTION_CAPABILITIES.buildExecution).toBe(false);
  });
  it("does not authorize actual repository import without review", () => {
    expect(EVOLUTION_CAPABILITIES.repositoryImport).toBe(false);
  });
  it("does not authorize merges", () => {
    expect(EVOLUTION_CAPABILITIES.repositoryMerge).toBe(false);
  });
  it("does not authorize production deployment", () => {
    expect(EVOLUTION_CAPABILITIES.productionDeployment).toBe(false);
  });
  it("does not authorize staging without a real service", () => {
    expect(EVOLUTION_CAPABILITIES.stagingDeployment).toBe(false);
  });
  it("does not authorize project migrations without a target and recovery test", () => {
    expect(EVOLUTION_CAPABILITIES.migrationExecution).toBe(false);
  });
});
