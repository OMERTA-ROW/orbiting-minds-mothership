import { createFileRoute } from "@tanstack/react-router";
import { ImpactScorecardPage } from "@/components/trusted/Impact";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/impact-scorecard")({head:()=>seo("Idea-to-Impact Scorecard","Compare paired synthetic baselines and candidates with documented methods, units, limitations and reproducibility gaps. Supplied numbers are not independently verified benefits."),component:ImpactScorecardPage});