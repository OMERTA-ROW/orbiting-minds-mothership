import { createFileRoute } from "@tanstack/react-router";
import { ControlCenter } from "@/components/evolution/ControlCenter";
import { controlCenterQuery } from "@/lib/evolution-query";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () =>
    seo(
      "My Projects",
      "Evolution owner control center: project directory, GitHub repository import, websites and cloud servers.",
      { path: "/projects" },
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(controlCenterQuery),
  component: ControlCenter,
});
