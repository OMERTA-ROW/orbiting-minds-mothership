import { createFileRoute } from "@tanstack/react-router";
import { DevicesPage } from "@/components/guardian/Devices";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/devices")({
  head: () =>
    seo(
      "My Devices · Voluntary Enrollment Demo",
      "Fictional laptops, server, tablet and phone with bounded local pairing codes, explicit scope rehearsal and revocation. No actual endpoint enrollment or remote control.",
    ),
  component: DevicesPage,
});
