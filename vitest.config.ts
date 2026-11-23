import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/omni-autonomous.test.mjs",
      "tests/omni-workspace-decision.test.mjs",
      "tests/omni-workspace-lifecycle-linux.test.mjs",
      "tests/omni-workspace-worker-leases.test.mjs",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
