import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/omni/native/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { exchangeNativeAuthorizationCode } = await import("@/lib/omni-native.server");
        return exchangeNativeAuthorizationCode(request);
      },
    },
  },
});
