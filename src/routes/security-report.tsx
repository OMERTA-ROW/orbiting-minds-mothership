import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/guardian/Reports";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/security-report")({ head: () => seo("Daily Health & Security Report · Demo", "Generate local sample reports with unsupported checks, unknown backup and signature evidence and truthful scan boundaries. No all-clear, scheduled scan or email delivery."), component: ReportsPage });
