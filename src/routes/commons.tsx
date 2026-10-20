import { createFileRoute } from "@tanstack/react-router";
import { CommonsBoard } from "@/components/CodeExchange";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/commons")({
  head: () => seo("Evolution Commons · Demo Board", "Review Code Exchange demo contributions by proposal state. Shared authenticated collaboration is pending; feedback stays in this browser."),
  component: CommonsBoard,
});