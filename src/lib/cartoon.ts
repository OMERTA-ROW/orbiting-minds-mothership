import { z } from "zod";
import { cartoonSample, cartoonEpisodes, cartoonReviewChecks } from "@/data/evolution";
import { omniWorld } from "./omni-assistant";
const text=(min=3,max=1000)=>z.string().trim().min(min).max(max).refine(v=>!/(cyber[\s_-]*link|sk-[a-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY|\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+|(?:clone|impersonate|imitate)\s+(?:a\s+)?(?:real|celebrity|performer|child)|(?:clone|copy)\s+(?:Disney|Pixar|Mickey|SpongeBob))/i.test(v),"Use original non-sensitive samples, not excluded projects, credentials or impersonation requests");
export const cartoonRoles=["Human writer","Human animator","OMNI template reference","OpenAI handoff · NOT SENT","Anthropic handoff · NOT SENT"] as const;
const character=z.object({id:z.enum(["pip","moss"]),name:text(2,80),personality:text(),silhouette:text(),continuity:text(),rig:text()});
const scene=z.object({id:z.string(),title:text(3,120),beat:text(3,600),duration:z.number().int().min(1).max(120),role:z.enum(cartoonRoles),status:z.enum(["Proposed","Reviewed DEMO","Skipped DEMO"])});
export const cartoonDraftSchema=z.object({title:text(3,150),audience:z.enum(["3–5 + caregiver","6–9 + family","10–12 + family"]),format:z.enum(["2D cutout","3D concept"]),logline:text(10,600),world:text(),rules:text(),learning:text(),credit:text(2,120),license:text(10,1000),voices:text(),music:text(),characters:z.array(character).length(2),episodeTitle:text(3,150),premise:text(10,600),fps:z.union([z.literal(24),z.literal(30)]),scenes:z.array(scene).length(3)}).superRefine((v,c)=>{if(new Set(v.characters.map(x=>x.id)).size!==2||v.scenes.some((s,i)=>s.id!==`scene-${i+1}`))c.addIssue({code:"custom",message:"Invalid character or scene identity"});});
export type CartoonDraft=z.infer<typeof cartoonDraftSchema>;
const checks=z.array(z.string()).refine(v=>new Set(v).size===cartoonReviewChecks.length&&cartoonReviewChecks.every(x=>v.includes(x.id)),"Complete every human review declaration");
const review=z.object({reviewer:text(2,80),notes:text(10,1000),checks,revision:z.number().int().positive(),at:z.string().datetime(),publicationIntent:z.literal(true)});
const plan=cartoonDraftSchema.innerType().extend({id:z.string(),worldId:omniWorld,revision:z.number().int().positive(),state:z.enum(["Proposed","Editorial reviewed DEMO","Withdrawn"]),review:review.nullable(),checkpoints:z.array(z.object({revision:z.number().int().positive(),draft:cartoonDraftSchema})).min(1).max(20),executionAllowed:z.literal(false),publicationAllowed:z.literal(false),providerCalls:z.literal(0),signature:z.null(),mediaEvidence:z.literal("NOT RUN")}).superRefine((p,c)=>{
 const validDraft=cartoonDraftSchema.safeParse(p);if(!validDraft.success){validDraft.error.issues.forEach(issue=>c.addIssue(issue));return;}
 if(p.state==="Editorial reviewed DEMO"&&(!p.review||p.review.revision!==p.revision||p.scenes.some(s=>s.status==="Proposed")))c.addIssue({code:"custom",message:"Editorial review must bind the current complete scene review"});
 if(p.state!=="Editorial reviewed DEMO"&&p.review)c.addIssue({code:"custom",message:"Review not valid for state"});
 const last=p.checkpoints.at(-1);if(last?.revision!==p.revision||JSON.stringify(last.draft)!==JSON.stringify(cartoonDraftSchema.parse(p)))c.addIssue({code:"custom",message:"Checkpoint mismatch"});
 if(p.checkpoints.some((cp,i)=>cp.revision!==i+1)||p.checkpoints.length!==p.revision)c.addIssue({code:"custom",message:"Checkpoint sequence mismatch"});
});
export const cartoonStoreSchema=z.object({version:z.literal(1),plans:z.array(plan).max(30)}).superRefine((s,c)=>{if(new Set(s.plans.map(p=>p.id)).size!==s.plans.length)c.addIssue({code:"custom",message:"Duplicate pitch"});});
export type CartoonStore=z.infer<typeof cartoonStoreSchema>;
export const initialCartoonStore:CartoonStore={version:1,plans:[]};
export function readCartoonStore(raw:string|null){return raw===null?structuredClone(initialCartoonStore):cartoonStoreSchema.parse(JSON.parse(raw));}
export function seedCartoon(episodeId="lantern"):CartoonDraft{
 const e=cartoonEpisodes.find(e=>e.id===episodeId);if(!e)throw new Error("Unknown episode");
 return cartoonDraftSchema.parse({...cartoonSample,characters:cartoonSample.characters.map(c=>({...c})),episodeTitle:e.title,premise:e.premise,fps:24,scenes:e.beats.map((beat,i)=>({id:`scene-${i+1}`,title:["The discovery","Trying together","A gentle resolution"][i],beat,duration:e.duration,role:"Human writer",status:"Proposed"}))});
}
export type CartoonCommand={type:"create";worldId:string;draft:CartoonDraft;consent:boolean}|{type:"edit";worldId:string;id:string;draft:CartoonDraft}|{type:"review";worldId:string;id:string;reviewer:string;notes:string;checks:string[];publicationIntent:boolean}|{type:"restore";worldId:string;id:string;revision:number}|{type:"withdraw";worldId:string;id:string};
export function applyCartoonCommand(store:CartoonStore,cmd:CartoonCommand,id:string,at:string,paused:boolean):CartoonStore{
 const next=structuredClone(cartoonStoreSchema.parse(store));omniWorld.parse(cmd.worldId);z.string().datetime().parse(at);
 if(paused&&cmd.type!=="withdraw")throw new Error("Guardian or Nexus local planning is paused");
 if(cmd.type==="create"){
  if(!cmd.consent)throw new Error("Explicit fictional local storage consent required");if(next.plans.length>=30)throw new Error("Local pitch capacity reached");
  const draft=cartoonDraftSchema.parse(cmd.draft);next.plans.push(plan.parse({...draft,id,worldId:cmd.worldId,revision:1,state:"Proposed",review:null,checkpoints:[{revision:1,draft}],executionAllowed:false,publicationAllowed:false,providerCalls:0,signature:null,mediaEvidence:"NOT RUN"}));
 }else{
  const p=next.plans.find(p=>p.id===cmd.id&&p.worldId===cmd.worldId);if(!p)throw new Error("Pitch not found in selected world");if(p.state==="Withdrawn")throw new Error("Withdrawn pitch cannot change");
  if(cmd.type==="withdraw"){p.state="Withdrawn";p.review=null;}
  else if(cmd.type==="review"){
   if(p.state!=="Proposed")throw new Error("Review only a proposed pitch");if(p.scenes.some(s=>s.status==="Proposed"))throw new Error("Review or skip every scene first");
   p.review=review.parse({...cmd,revision:p.revision,at});p.state="Editorial reviewed DEMO";
  }else{
   if(p.checkpoints.length>=20)throw new Error("Local checkpoint capacity reached");
   const previous=cmd.type==="restore"?p.checkpoints.find(c=>c.revision===cmd.revision)?.draft:cmd.draft;if(!previous)throw new Error("Unknown checkpoint");
   const draft=cartoonDraftSchema.parse(previous);Object.assign(p,draft,{revision:p.revision+1,state:"Proposed",review:null});p.checkpoints.push({revision:p.revision,draft});
  }
 }
 return cartoonStoreSchema.parse(next);
}
export function cartoonTiming(draft:CartoonDraft){const d=cartoonDraftSchema.parse(draft);let start=0;return d.scenes.map(s=>{const from=start;start+=s.duration;return {id:s.id,startSeconds:from,endSeconds:start,frames:s.duration*d.fps};});}
export function cartoonExport(store:CartoonStore,id:string,worldId:string,delivery=false){
 const p=cartoonStoreSchema.parse(store).plans.find(p=>p.id===id&&p.worldId===omniWorld.parse(worldId));if(!p)throw new Error("Pitch not found in selected world");
 if(delivery&&(p.state!=="Editorial reviewed DEMO"||!p.review))throw new Error("Current human editorial review required for delivery preparation");
 return {kind:delivery?"DEMO_DISTRIBUTION_PREPARATION":"DEMO_WORKING_PITCH",mode:"DEMO",authenticated:false,rightsVerified:false,originalityCertified:false,mediaIncluded:false,executionAllowed:false,publicationAllowed:false,signed:false,providerCalls:0,missing:["Authenticated owner and independent editorial/rights review","Rights-cleared voice/music and final media","Actual frame, rig, render and accessibility tests","Authorized destination and final human publication confirmation"],pitch:p,timeline:cartoonTiming(p)};
}