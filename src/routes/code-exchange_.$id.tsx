import { createFileRoute, notFound } from "@tanstack/react-router";
import { ContributionDetail } from "@/components/CodeExchange";
import { getContribution } from "@/lib/code-exchange";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/code-exchange_/$id")({
  loader: ({ params }) => {
    const item = getContribution(params.id);
    if (!item) throw notFound();
    return item;
  },
  head: ({ loaderData }) => seo(loaderData ? `${loaderData.title.en} · Code Exchange` : "Contribution unavailable", loaderData ? `${loaderData.description.en} Demo attribution, review and unsigned upgrade preview.` : "This Code Exchange contribution is unavailable."),
  component: ContributionPage,
});

function ContributionPage() {
  const item = Route.useLoaderData();
  return <ContributionDetail key={item.id} item={item} />;
}