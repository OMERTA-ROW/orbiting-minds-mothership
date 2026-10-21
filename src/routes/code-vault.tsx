import { createFileRoute } from "@tanstack/react-router";
import { CodeVaultPage } from "@/components/trusted/Vault";
import { vaultSearch } from "@/lib/code-vault";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/code-vault")({validateSearch:vaultSearch,head:()=>seo("Code Vault and Conflict Detective","Unsigned local DEMO version pins, real SHA-256 text and manifest comparison, non-executing syntax checks and unreviewed forks. Secure signing and installers remain blocked."),component:Page});
function Page(){const {code,record}=Route.useSearch();return <CodeVaultPage codeId={code} recordId={record}/>;}