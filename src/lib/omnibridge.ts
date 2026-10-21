import { z } from "zod";
import { nexusProjects, omniConnectors } from "@/data/evolution";

export type OmniConnectorId = typeof omniConnectors[number]["id"];
const projectId = z.string().refine(v => nexusProjects.some(p => p.id === v), "Unknown or excluded world");
const connectorId = z.string().refine(v => omniConnectors.some(c => c.id === v), "Unknown adapter");
const target = z.enum(["local", "openai", "anthropic"]);
const stepSchema = z.object({ id:z.string(), connector:connectorId, title:z.string(), reason:z.string(), affected:z.array(z.string()), scopes:z.array(z.string()), approval:z.string(), preview:z.string(), highImpact:z.boolean(), dependsOn:z.array(z.string()) });
const planSchema = z.object({ id:z.string(), projectId, goal:z.string().min(10).max(2000), targets:z.array(target).min(1).max(3), createdAt:z.string().datetime(), steps:z.array(stepSchema).min(1).max(10), notices:z.array(z.string()), state:z.enum(["Proposed", "Reviewed DEMO", "Withdrawn"]), reviewer:z.string().nullable(), reviewedAt:z.string().datetime().nullable(), executionAllowed:z.literal(false), providerCalls:z.literal(0), signature:z.null() });
export const omniStoreSchema = z.object({ version:z.literal(1), plans:z.array(planSchema).max(40), events:z.array(z.object({id:z.string(),planId:z.string(),projectId,at:z.string().datetime(),action:z.enum(["Proposed", "Reviewed DEMO", "Withdrawn"])})).max(200) }).superRefine((v,ctx)=>{
 if(new Set(v.plans.map(p=>p.id)).size!==v.plans.length)ctx.addIssue({code:"custom",message:"Duplicate plan"});
 for(const p of v.plans){const expected=deriveSteps(p.projectId,p.goal,p.targets);if(JSON.stringify(p.steps)!==JSON.stringify(z.array(stepSchema).parse(expected.steps)))ctx.addIssue({code:"custom",message:"Changed plan steps"});}
});
export type OmniStore=z.infer<typeof omniStoreSchema>;
export type OmniPlan=z.infer<typeof planSchema>;
export type OmniTarget=z.infer<typeof target>;
export const initialOmniStore:OmniStore={version:1,plans:[],events:[]};
export function readOmniStore(raw:string|null){return raw===null?structuredClone(initialOmniStore):omniStoreSchema.parse(JSON.parse(raw));}
export function discoverOmniConnectors(query:string,state:string){const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);return omniConnectors.filter(c=>(state==="ALL"||c.state===state)&&words.every(w=>`${c.name} ${c.surface} ${c.capabilities.join(" ")} ${c.compatibility}`.toLowerCase().includes(w)));}
export function connectivityEvidence(){return {verifiedAt:null,probePerformed:false,source:"UNMEASURED" as const};}
function deriveSteps(worldId:string,goal:string,targets:OmniTarget[]){
 const world=nexusProjects.find(p=>p.id===worldId);if(!world)throw new Error("Unknown or excluded world");
 const steps:z.infer<typeof stepSchema>[]=[];const notices=["Deterministic keyword templates, not an AI response. Unknown requirements need human clarification.","No real files, tool calls, tests, jobs or restore points. Provider costs remain unknown."];
 const add=(connector:OmniConnectorId,title:string,reason:string,preview:string,affected:string[],highImpact=false)=>{const c=omniConnectors.find(v=>v.id===connector);if(!c)throw new Error("Unknown adapter");const prior=steps.at(-1);steps.push({id:`step-${steps.length+1}`,connector,title,reason,preview,affected,scopes:[...c.scopes],highImpact,approval:highImpact?"Separate human owner approval, tests and rollback evidence before any future action":"Explicit source scope and human plan review",dependsOn:prior?[prior.id]:[]});};
 add("local","Confirm selected world and sample boundary","Every goal requires an explicit world; no other project context is forwarded.",`Read only the authored ${world.file} fixture; actual project sources are unattached.`,[`SAMPLE:/${world.name}/${world.file}`]);
 for(const t of [...new Set(targets)])if(t!=="local")add(t,`Prepare isolated ${t==="openai"?"OpenAI":"Anthropic"} handoff`,`${t} was explicitly selected, not inferred from the goal.`,"A future request would contain this goal and the selected sample only. No private thread or consumer history. NOT SENT.",["Goal text",`SAMPLE:/${world.name}/${world.file}`,`ISOLATED:${t}:draft`]);
 if(/github|repository|\brepo\b|code|\bpr\b/i.test(goal))add("github","Propose repository review and test branch","Matched code/repository vocabulary; branch/write scope is a proposal, not a grant.","Identify an owner-selected repository first. Preview a separate branch diff, tests, human signoff and recoverable prior commit. No PR created.",["FUTURE: selected repository",`SAMPLE:/${world.name}/${world.file}`,"FUTURE: isolated test branch"],true);
 if(/unity|blender|scene|render/i.test(goal)){for(const c of ["unity","blender"] as const)if(new RegExp(`${c}|scene|render`,"i").test(goal))add(c,`Preview ${c==="unity"?"Unity build":"Blender render"} workflow`,"Matched editor/scene vocabulary; official CLI reference only.","Pin editor/script and licensed inputs; restrict output directory and resource/egress limits. Reviewed scripts may modify files. No command executed.",["FUTURE: approved scene/project", "FUTURE: isolated output directory"],true);}
 if(/solana|testnet|blockchain/i.test(goal))add("solana","Document optional testnet status read","Matched blockchain vocabulary; only a future read-only testnet adapter is in scope.","Future method: getHealth on a reviewed testnet endpoint. No endpoint queried; wallet/sign/transaction/mainnet capability absent.",["FUTURE: public testnet status only"]);
 if(worldId==="nexus-cyberace")notices.push("Cyberace integration unconfirmed. Even local review does not connect Cyberace or grant access.");
 if(/wallet|transaction|sign|mainnet|deploy|publish|delete|payment|shell|device/i.test(goal))notices.push("High-impact or restricted wording detected. No requested action will execute; wallets, signing, transactions, mainnet, deployment, deletion, payment and host commands are unavailable.");
 add("local","Review dependencies, evidence and recovery gaps","Every proposed chain terminates in a human checkpoint, never an executable queue.","Record review only; future execution requires authenticated scopes, signed extension provenance, isolated tests and independently proven rollback.",["LOCAL: this plan record"],true);
 return {steps,notices};
}
export function proposeOmniPlan(input:{projectId:string;goal:string;targets:OmniTarget[];consent:boolean},id:string,at:string,paused:boolean):OmniPlan{
 if(paused)throw new Error("Guardian or Nexus local planning is paused");if(input.consent!==true)throw new Error("Explicit non-sensitive local storage consent required");
 const worldId=projectId.parse(input.projectId);const goal=z.string().trim().min(10).max(2000).parse(input.goal);
 if(/cyber[\s_-]*link/i.test(goal))throw new Error("Excluded separate project. Select an Evolution sample only.");
 if(/sk-[a-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY|\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i.test(goal))throw new Error("Possible credentials detected. Use fictional non-sensitive goals only; this pattern check is not a privacy scan.");
 const targets=z.array(target).min(1).max(3).refine(v=>new Set(v).size===v.length,"Duplicate targets").parse(input.targets);
 return planSchema.parse({id,projectId:worldId,goal,targets,createdAt:at,...deriveSteps(worldId,goal,targets),state:"Proposed",reviewer:null,reviewedAt:null,executionAllowed:false,providerCalls:0,signature:null});
}
export function reviewOmniPlan(plan:OmniPlan,input:{reviewer:string;scopes:string[];consent:boolean},at:string,paused:boolean):OmniPlan{
 if(paused)throw new Error("Guardian or Nexus local planning is paused");if(plan.state!=="Proposed")throw new Error("Only a proposed plan can be reviewed");
 if(input.consent!==true)throw new Error("Explicit human review required");
 const required=[...new Set(plan.steps.flatMap(s=>s.scopes))];if(required.some(s=>!input.scopes.includes(s)))throw new Error("Review every required scope; these declarations grant no real permission");
 return planSchema.parse({...plan,state:"Reviewed DEMO",reviewer:z.string().trim().min(2).max(80).parse(input.reviewer),reviewedAt:at});
}
export type OmniCommand={type:"propose";input:Parameters<typeof proposeOmniPlan>[0]}|{type:"review";planId:string;projectId:string;input:Parameters<typeof reviewOmniPlan>[1]}|{type:"withdraw";planId:string;projectId:string};
export function applyOmniCommand(current:OmniStore,command:OmniCommand,id:string,at:string,paused:boolean):OmniStore{
 const next=structuredClone(omniStoreSchema.parse(current));z.string().datetime().parse(at);let p:OmniPlan;
 if(command.type==="propose"){if(next.plans.length>=40)throw new Error("Local plan limit reached (40); export records before a new store");p=proposeOmniPlan(command.input,id,at,paused);next.plans.push(p);}
 else{const index=next.plans.findIndex(v=>v.id===command.planId&&v.projectId===command.projectId);const existing=next.plans[index];if(!existing)throw new Error("Plan not found in this world");if(command.type==="review")p=reviewOmniPlan(existing,command.input,at,paused);else{if(existing.state==="Withdrawn")throw new Error("Plan already withdrawn");p={...existing,state:"Withdrawn"};}next.plans[index]=p;}
 next.events=[...next.events.slice(-199),{id,planId:p.id,projectId:p.projectId,at,action:p.state}];return omniStoreSchema.parse(next);
}
export function omniExport(store:OmniStore,worldId:string){projectId.parse(worldId);return {mode:"DEMO",storage:"EDITABLE_BROWSER_LOCAL",authenticated:false,tamperEvident:false,executionAllowed:false,providerCalls:0,walletConnected:false,transactions:[],signed:false,rollback:"Plan withdrawal only; no file or device restoration",...{plans:store.plans.filter(p=>p.projectId===worldId),events:store.events.filter(e=>e.projectId===worldId)}};}
export function omniManifest(connector:OmniConnectorId){const c=omniConnectors.find(v=>v.id===connector);if(!c)throw new Error("Unknown adapter");return {schemaVersion:"0.1.0",adapterId:c.id,version:"0.0.0-reference",mode:"DISABLED_REFERENCE",executionAllowed:false,allowedCapabilities:c.capabilities,requestedScopes:c.scopes,credentials:"FUTURE_OWNER_SCOPED_SERVER_VAULT_ONLY",connectivity:connectivityEvidence(),signature:null,trustedKey:null,artifactDigest:null,tests:"NOT_RUN",sandbox:"NOT_PROVISIONED",humanCheckpoints:true,revocable:true,companionRequired:c.companion,...(connector==="solana"?{network:"testnet",readOnly:true,wallets:false,signing:false,transactions:false,mainnet:false}:{})};}