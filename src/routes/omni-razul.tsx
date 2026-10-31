import { createFileRoute } from "@tanstack/react-router";
import { RazulArchive } from "@/components/omnibridge/RazulArchive";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-razul")({
  head: () =>
    seo(
      "RAZUL · The Eternal Archivist",
      "Central memory, append-only project history and allowlisted public-internet intelligence for the OMNI ecosystem, with provenance, redaction, retention and per-consumer access grants. Local reference implementation.",
    ),
  component: RazulArchive,
});
