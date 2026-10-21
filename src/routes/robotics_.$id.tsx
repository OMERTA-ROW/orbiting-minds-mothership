import { createFileRoute, notFound } from "@tanstack/react-router";
import { getRoboticsScenario } from "@/lib/robotics";
import { RoboticsScenarioPage } from "@/components/robotics/Scenario";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/robotics_/$id")({ loader: ({ params }) => { const scenario = getRoboticsScenario(params.id); if (!scenario) throw notFound(); return scenario; }, head: ({ loaderData }) => seo(loaderData ? `${loaderData.title} · Robotics Research` : "Research scenario unavailable", loaderData ? `${loaderData.problem} Local demo research only; no hardware, independent test or certified release.` : "This Robotics & Mobility research scenario is unavailable."), component: ScenarioPage });
function ScenarioPage() { const scenario = Route.useLoaderData(); return <RoboticsScenarioPage key={scenario.id} scenario={scenario} />; }
