import {z} from "zod";
import {codeContributions,incidentExamples} from "@/data/evolution";
import {requireDemoIdentity,type GenesisStore} from "./genesis";
import {screenDebrief} from "./incident-screening";
import {publicEvidenceUrl} from "./embassy";
export const incidentSeverities=["Low","Moderate","High","Critical"] as const;
export const causeDomains=["Unknown","Human edit","AI defect","Review error","Integration fault","Hardware issue","Multiple factors"] as const;
const text=z.string().trim().min(10).max(2000),short=z.string().trim().min(2).max(140),id=z.string().min(1).max(100),date=z.string().datetime();
const hash=z.string().regex(/^[a-f0-9]{64}$/).or(z.literal(""));
const sample=z.string().max(20000).refine(v=>v.split("\n").length<=400,"Maximum 400 lines per sample.");
const claim=z.object({actor:short,basis:text}).strict();
export const accountabilityInput=z.object({
 title:short,reporterId:id,severity:z.enum(incidentSeverities),occurredAt:date,detectedAt:date,project:short,device:short,physicalImpact:z.boolean(),
 expected:text,observed:text,facts:text,unknowns:text,hypotheses:text,causeDomain:z.enum(causeDomains),rootCauseStatus:z.enum(["Unknown","Hypothesis only"]),
 proposedBy:claim,approvedBy:claim,deployedBy:claim,
 codeId:z.string().refine(v=>!v||codeContributions.some(c=>c.id===v)),releaseId:z.string().max(100),replayId:z.string().max(100),archiveId:z.string().refine(v=>!v||incidentExamples.some(c=>c.id===v)),
 baselineText:sample,observedText:sample,baselineHash:hash,observedHash:hash,hashBasis:text,
 evidence:z.array(z.object({kind:z.enum(["Log metadata","Test declaration","Clip metadata","Observation"]),description:text,source:short,reference:publicEvidenceUrl.or(z.literal("")),permission:z.literal(true),status:z.enum(["DEMO","REENACTMENT"])}).strict()).min(1).max(10),
 logs:z.string().max(2000),tests:text,timeline:z.array(z.object({at:date,observation:text}).strict()).min(1).max(20),
 correctivePlan:text,safetyPlan:text,privacyTerms:text,sampleOnly:z.literal(true),operatorAuthorized:z.literal(true),consent:z.literal(true),
}).strict().superRefine((v,c)=>{
 if(v.detectedAt<v.occurredAt)c.addIssue({code:"custom",path:["detectedAt"],message:"Detection cannot precede the incident."});
 if(v.timeline.some((s,i)=>s.at<v.occurredAt||(i>0&&s.at<(v.timeline[i-1]?.at??""))))c.addIssue({code:"custom",path:["timeline"],message:"Timeline must follow occurrence time in chronological order."});
 if(v.releaseId&&!v.codeId)c.addIssue({code:"custom",path:["releaseId"],message:"A release reference requires a matching code sample."});
 if(v.physicalImpact&&v.safetyPlan.length<30)c.addIssue({code:"custom",path:["safetyPlan"],message:"Document physical emergency-stop, trained oversight and independent validation gaps."});
});
export type AccountabilityInput=z.infer<typeof accountabilityInput>;
const review=z.object({actorId:id,at:date,revision:z.number().int().positive(),decision:z.enum(["Reviewed DEMO","Changes requested"]),note:text,privacy:z.literal(true),evidence:z.literal(true),uncertainty:z.literal(true)}).strict();
const revision=z.object({revision:z.number().int().positive(),at:date,input:accountabilityInput}).strict();
export const accountabilityRecord=z.object({id,at:date,input:accountabilityInput,revision:z.number().int().positive(),history:z.array(revision).max(20),state:z.enum(["Reported","Review requested","Reviewed DEMO","Changes requested","Withdrawn"]),privacyReviewed:z.boolean(),review:review.nullable(),
 notices:z.array(z.object({id,actorId:id,at:date,kind:z.enum(["Dispute","Correction","Resolution"]),note:text,resolves:z.string().max(100)}).strict()).max(100),
 actions:z.array(z.object({id,actorId:id,at:date,plan:text,status:z.enum(["Proposed","Rehearsed locally"]),result:text}).strict()).max(30),
 events:z.array(z.object({id,actorId:id,at:date,action:z.string().max(140)}).strict()).max(200),
}).strict().superRefine((r,c)=>{
 if(r.state==="Reviewed DEMO"&&(!r.review||r.review.decision!=="Reviewed DEMO"||r.review.revision!==r.revision||r.review.actorId===r.input.reporterId||!r.privacyReviewed))c.addIssue({code:"custom",message:"Current distinct review and privacy confirmation required."});
 const latest=r.events.at(-1)?.at??r.at;
 if(Date.parse(r.input.detectedAt)>Date.parse(latest)||r.input.timeline.some(e=>Date.parse(e.at)>Date.parse(latest)))c.addIssue({code:"custom",message:"Incident observations cannot be later than the recording time."});
 if(r.history.some(h=>h.input.reporterId!==r.input.reporterId))c.addIssue({code:"custom",message:"Historical reporter declarations must be preserved."});
 if(r.history.length!==r.revision-1||r.history.some((h,i)=>h.revision!==i+1))c.addIssue({code:"custom",message:"Revision history must preserve every version."});
 if(r.state==="Review requested"&&!r.privacyReviewed)c.addIssue({code:"custom",message:"Review request requires privacy confirmation."});
 for(const rows of [r.events,r.notices,r.actions])if(new Set(rows.map(x=>x.id)).size!==rows.length)c.addIssue({code:"custom",message:"Duplicate local event identifiers."});
 if(r.events.some((e,i)=>Date.parse(e.at)<Date.parse(r.at)||i>0&&Date.parse(e.at)<Date.parse(r.events[i-1]?.at??r.at)))c.addIssue({code:"custom",message:"Events must be chronological."});
});
export type AccountabilityRecord=z.infer<typeof accountabilityRecord>;
export type AccountabilityCommand=
 |{type:"accountabilityReport";input:unknown}
 |{type:"accountabilityRevise";caseId:string;actorId:string;input:unknown}
 |{type:"accountabilityPrivacy";caseId:string;actorId:string;consent:boolean}
 |{type:"accountabilityWithdraw";caseId:string;actorId:string;consent:boolean}
 |{type:"accountabilityReview";caseId:string;actorId:string;decision:"Reviewed DEMO"|"Changes requested";note:string;privacy:boolean;evidence:boolean;uncertainty:boolean;consent:boolean}
 |{type:"accountabilityNotice";caseId:string;actorId:string;kind:"Dispute"|"Correction"|"Resolution";note:string;resolves:string;consent:boolean}
 |{type:"accountabilityAction";caseId:string;actorId:string;plan:string;status:"Proposed"|"Rehearsed locally";result:string;consent:boolean};
const safe=(v:unknown)=>{const s=JSON.stringify(v);if(screenDebrief({sample:s}).length)throw new Error("Remove potentially sensitive or unsafe sample content; Guardian patterns are incomplete.");};
export function accountabilityState(r:AccountabilityRecord,g:GenesisStore){
 if(r.state==="Withdrawn")return "Withdrawn";
 try{requireDemoIdentity(g,r.input.reporterId,"submit_capsules");if(r.review){const reviewer=requireDemoIdentity(g,r.review.actorId,"review_proposals");if(reviewer.kind==="Agent operator")return "Consent invalidated";}}catch{return "Consent invalidated";}
 return r.state;
}
export function applyAccountability(rows:AccountabilityRecord[],g:GenesisStore,command:AccountabilityCommand,recordId:string,at:string){
 const next=structuredClone(rows);date.parse(at);safe(command);
 if(command.type==="accountabilityReport"){
  const input=accountabilityInput.parse(command.input);requireDemoIdentity(g,input.reporterId,"submit_capsules");
  next.push({id:recordId,at,input,revision:1,history:[],state:"Reported",privacyReviewed:false,review:null,notices:[],actions:[],events:[{id:recordId,actorId:input.reporterId,at,action:"Report recorded / local DEMO"}]});
 }else{
  const r=next.find(x=>x.id===command.caseId);if(!r)throw new Error("Local case not found.");
  if(r.state==="Withdrawn")throw new Error("Consent withdrawn; new case actions are blocked.");
  const actor=command.type==="accountabilityWithdraw"?g.identities.find(p=>p.id===command.actorId):requireDemoIdentity(g,command.actorId,command.type==="accountabilityReview"?"review_proposals":undefined);
  if(!actor)throw new Error("Reporter declaration is missing.");
  if(command.type!=="accountabilityWithdraw")requireDemoIdentity(g,r.input.reporterId,"submit_capsules");
  const owner=()=>{if(actor.id!==r.input.reporterId)throw new Error("The declaring reporter must confirm this local action.");};
  if(command.type==="accountabilityRevise"){
   owner();const input=accountabilityInput.parse(command.input);if(input.reporterId!==r.input.reporterId)throw new Error("Reporter cannot change during revision.");
   if(r.history.length>=20)throw new Error("Revision history full; retained versions are not overwritten.");
   r.history.push({input:r.input,revision:r.revision,at});r.input=input;r.revision++;r.review=null;r.privacyReviewed=false;r.state="Reported";
  }else{
   if(!command.consent)throw new Error("Explicit consent to the local action is required.");
   if(command.type==="accountabilityWithdraw"){owner();r.state="Withdrawn";r.review=null;}
   if(command.type==="accountabilityPrivacy"){owner();r.privacyReviewed=true;r.review=null;r.state="Review requested";}
   if(command.type==="accountabilityReview"){
    if(actor.id===r.input.reporterId||actor.kind==="Agent operator")throw new Error("A distinct declared human reviewer is required.");
    if([r.input.proposedBy,r.input.approvedBy,r.input.deployedBy].some(x=>x.actor.toLowerCase()===actor.name.toLowerCase()))throw new Error("Choose a reviewer not declared as proposer, approver or deployer of the incident change.");
    if(r.state!=="Review requested"||!r.privacyReviewed)throw new Error("Reporter privacy review must precede independent local review.");
    if(command.decision==="Reviewed DEMO"&&openDisputes(r).length)throw new Error("Resolve recorded disputes before recording a reviewed DEMO.");
    r.review=review.parse({actorId:actor.id,at,revision:r.revision,decision:command.decision,note:command.note,privacy:command.privacy,evidence:command.evidence,uncertainty:command.uncertainty});r.state=command.decision;
   }
   if(command.type==="accountabilityNotice"){
    if(command.kind!=="Dispute")owner();
    if(command.kind==="Resolution"&&!openDisputes(r).some(n=>n.id===command.resolves))throw new Error("Choose an unresolved dispute; resolution requires a documented response.");
    r.notices.push({id:recordId,actorId:actor.id,at,kind:command.kind,note:text.parse(command.note),resolves:command.kind==="Resolution"?command.resolves:""});r.review=null;r.privacyReviewed=false;r.state="Changes requested";
   }
   if(command.type==="accountabilityAction"){
    owner();r.actions.push({id:recordId,actorId:actor.id,at,plan:text.parse(command.plan),status:command.status,result:text.parse(command.result)});r.review=null;r.privacyReviewed=false;r.state="Changes requested";
   }
  }
  r.events.push({id:recordId,actorId:actor.id,at,action:`${command.type.replace("accountability","")} / local DEMO`});
 }
 return z.array(accountabilityRecord).max(50).parse(next);
}
export function openDisputes(r:AccountabilityRecord){return r.notices.filter(n=>n.kind==="Dispute"&&!r.notices.some(x=>x.kind==="Resolution"&&x.resolves===n.id));}
export function accountabilityExport(r:AccountabilityRecord,g:GenesisStore){const {logs:_l,baselineText:_b,observedText:_o,...summary}=r.input;const state=accountabilityState(r,g),withheld=state==="Withdrawn"||state==="Consent invalidated";return {mode:"DEMO",id:r.id,revision:r.revision,state,summary:withheld?null:summary,review:withheld?null:r.review,notices:withheld?[]:r.notices,actions:withheld?[]:r.actions,events:withheld?[]:r.events,logsIncluded:false,codeIncluded:false,historyIncluded:false,rootCauseVerified:false,legalCulpabilityEstablished:false,signature:null,externalPublication:false,hardwareAllowed:false,storage:"EDITABLE_BROWSER_LOCAL / NOT CONFIDENTIAL"};}