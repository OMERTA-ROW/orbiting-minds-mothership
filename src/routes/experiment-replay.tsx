import { createFileRoute } from "@tanstack/react-router";
import { ExperimentReplayPage } from "@/components/trusted/Replay";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/experiment-replay")({
  head: () =>
    seo(
      "Oracle Experiment Replay",
      "Local synthetic expected-versus-actual timelines with inert commands, declared versions, sample logs, hypotheses and authorized clip metadata. No code execution or verified root cause.",
    ),
  component: ExperimentReplayPage,
});
