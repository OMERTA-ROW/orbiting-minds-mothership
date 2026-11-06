import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jackboy/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleJackboyDispatch } = await import("@/lib/jackboy-dispatch.server");
        return handleJackboyDispatch(request);
      },
    },
  },
});
