import { test } from "node:test";

if (process.platform === "linux" && process.env.OMNI_WORKSPACE_ISOLATION_TEST === "true") {
  await import("./fixtures/omni-workspace-isolation-diagnostic.mjs");
} else {
  test("workspace Linux isolation diagnostic requires explicit opt-in", { skip: true }, () => {});
}
