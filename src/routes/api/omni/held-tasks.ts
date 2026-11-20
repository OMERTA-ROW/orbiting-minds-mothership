import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/omni/held-tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { omniDelegatedReadTasks } = await import("@/lib/omni-delegation.server");
        return omniDelegatedReadTasks(request);
      },
    },
  },
});
