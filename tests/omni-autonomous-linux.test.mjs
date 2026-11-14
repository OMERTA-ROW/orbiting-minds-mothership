import { test } from "node:test";
import assert from "node:assert/strict";
import { createExecutor, RELEASE } from "../services/omni-autonomous/executor.mjs";

test(
  "real Linux isolation, resource ceilings and descendant cancellation",
  {
    skip:
      process.platform !== "linux" || process.env.OMNI_LINUX_ISOLATION_TEST !== "true"
        ? "Opt-in Linux test requires bubblewrap, prlimit and isolated scratch ownership"
        : false,
  },
  async () => {
    const executor = createExecutor({ enabled: false, controlSecret: "fixture-only".repeat(4) });
    try {
      const result = await executor.selfTest();
      assert.equal(result.release, RELEASE);
      assert.equal(result.passed, true);
    } finally {
      await executor.close();
    }
  },
);
