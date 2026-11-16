import { test } from "node:test";

if (process.platform === "linux" && process.env.OMNI_LINUX_ISOLATION_TEST === "true") {
  await import("../services/omni-autonomous/isolation-diagnostic.mjs");
} else {
  test("Linux isolation diagnostic requires explicit opt-in", { skip: true }, () => {});
}
