import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PhysicalSafetyPage } from "@/components/trusted/Safety";
import { roboticsScenarios } from "@/data/evolution";
import { seo } from "@/lib/seo";
const search=z.object({scenario:z.string().refine(v=>roboticsScenarios.some(s=>s.id===v)).optional()});
export const Route=createFileRoute("/physical-safety")({validateSearch:(raw)=>{const p=search.safeParse(raw);return p.success?p.data:{};},head:()=>seo("Guardian Physical Safety Lock","Simulation-only evidence checklist for balance, collision, safe speed, physical emergency stops and human approval. Hardware is always blocked; no independent tests performed."),component:Page});
function Page(){const {scenario}=Route.useSearch();return <PhysicalSafetyPage scenarioId={scenario}/>;}