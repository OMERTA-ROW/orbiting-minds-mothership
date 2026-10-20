import { createFileRoute } from "@tanstack/react-router";
import { CareDashboard } from "@/components/care/CareDashboard";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/care")({ head: () => seo("EVOLUTION CARE · Device Demo", "Optional local-care modules, fictional inventory, sample health report and safe virtual storage manifest. No scanning or file changes."), component: CareDashboard });
