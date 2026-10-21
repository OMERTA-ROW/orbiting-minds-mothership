import {createFileRoute} from "@tanstack/react-router";
import {IncidentReportPage} from "@/components/incidents/AccountabilityForm";
import {seo} from "@/lib/seo";
export const Route=createFileRoute("/report-incident")({head:()=>seo("Report Incident · Guardian","Report a fictional non-sensitive Evolution incident with operator consent, attribution declarations, evidence gaps and sample artifact references. Local DEMO only."),component:IncidentReportPage});