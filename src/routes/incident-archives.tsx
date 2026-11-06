import { createFileRoute } from "@tanstack/react-router";
import { IncidentArchivesPage } from "@/components/incidents/Archive";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/incident-archives")({
  head: () =>
    seo(
      "Evolution Incident Archives · Demo Case Files",
      "Searchable fictional engineering case studies across Wild Tech Moments, Robot Malfunctions, Code Postmortems, Lab Lessons, Near Misses and Fixes That Worked. No verified incidents or published clips.",
    ),
  component: IncidentArchivesPage,
});
