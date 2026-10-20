import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/evolution-pathway")({
  server: { handlers: { POST: async ({ request }) => {
    const { handlePathway } = await import("@/lib/ai/pathway.server");
    return handlePathway(request);
  } } },
});