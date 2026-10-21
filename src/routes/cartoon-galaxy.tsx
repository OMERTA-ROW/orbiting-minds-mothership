import { createFileRoute } from "@tanstack/react-router";
import { CartoonGalaxy } from "@/components/entertainment/CartoonGalaxy";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/cartoon-galaxy")({
  head: () =>
    seo(
      "Cartoon Galaxy · Original Family Series",
      "Develop original fictional family-cartoon pitches, character bibles, static storyboard timelines and revision-bound human editorial reviews. Local DEMO with rights and child-privacy gates; no animation services or publication connected.",
    ),
  component: CartoonGalaxy,
});
