import { createFileRoute } from "@tanstack/react-router";
import { VoicePage } from "@/components/care/Voice";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/voice")({ head: () => seo("Mothership Voice · Persona Demo", "Original voice persona, privacy preferences and text-only push-to-talk concept. Microphone off, no speech recognition or synthesis."), component: VoicePage });
