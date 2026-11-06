import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/omni")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleOmni } = await import("@/lib/ai/omni.server");
        return handleOmni(request);
      },
    },
  },
});
