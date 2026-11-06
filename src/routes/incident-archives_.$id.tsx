import { createFileRoute } from "@tanstack/react-router";
import { IncidentCasePage } from "@/components/incidents/Archive";
import { incidentExamples } from "@/data/evolution";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/incident-archives_/$id")({
  head: ({ params }) => {
    const item = incidentExamples.find((c) => c.id === params.id);
    return seo(
      item ? `${item.title} · Incident Archive` : "Incident case file",
      item
        ? `${item.summary} ${item.status} teaching case; not a verified incident.`
        : "Local DEMO incident case file with consent, evidence and moderation status.",
    );
  },
  component: CasePage,
});
function CasePage() {
  const { id } = Route.useParams();
  return <IncidentCasePage key={id} id={id} />;
}
