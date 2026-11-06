import { createFileRoute } from "@tanstack/react-router";
import { ApprovalLedgerPage } from "@/components/trusted/Ledger";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/approval-ledger")({
  head: () =>
    seo(
      "Approval Ledger and Release Passport",
      "Unsigned local DEMO release drafts with exact sample-text digest, declared human owner and agent operator, evidence, distinct review, revocation and rollback rehearsal. Trusted audit and deployment remain blocked.",
    ),
  component: ApprovalLedgerPage,
});
