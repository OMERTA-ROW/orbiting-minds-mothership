import {createFileRoute} from "@tanstack/react-router";
import {AccountabilityCase} from "@/components/incidents/AccountabilityCase";
import {seo} from "@/lib/seo";
export const Route=createFileRoute("/guardian-incidents_/$id")({head:()=>seo("Guardian Accountability Case","Evolution Mothership local DEMO accountability case: evidence versus hypotheses, sample hash comparison, review, corrective actions and consent withdrawal; no verified cause or legal finding."),component:CasePage});
function CasePage(){const {id}=Route.useParams();return <AccountabilityCase key={id} id={id}/>;}