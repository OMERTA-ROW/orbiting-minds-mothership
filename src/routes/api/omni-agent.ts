import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/omni-agent")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleOmniAgent } = await import("@/lib/ai/omni-agent.server");
    return handleOmniAgent(request);
  } } },
});