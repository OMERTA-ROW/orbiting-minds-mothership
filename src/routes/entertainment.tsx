import { createFileRoute } from "@tanstack/react-router";
import { EntertainmentGalaxy } from "@/components/entertainment/EntertainmentGalaxy";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/entertainment")({head:()=>seo("Entertainment Galaxy · Scene-to-Screen","Evolution’s six creative DEMO studios for film, sound, AI video, camera metadata, virtual production and media regression planning. Editable local storyboards, rights review and disabled publication; no connected media tools."),component:EntertainmentGalaxy});