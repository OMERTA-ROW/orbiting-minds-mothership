import { z } from "zod";
import { loungeDrinks, loungePrompts, codeContributions } from "@/data/evolution";
import { requireDemoIdentity, type GenesisStore } from "./genesis";
import { screenDebrief } from "./incidents";
export const loungeInput=z.object({identityId:z.string().min(1),drink:z.enum(["starlight","nebula","zero"]),prompt:z.number().int().min(0).max(loungePrompts.length-1),answer:z.string().trim().min(10).max(600),domain:z.enum(["Accessibility","Privacy","Image processing","Developer tooling","Banking"]),consent:z.literal(true)}).strict();
export function welcomePreview(value:unknown,g:GenesisStore) {
 const v=loungeInput.parse(value),person=requireDemoIdentity(g,v.identityId);
 if(person.kind==="Agent operator"&&!person.passport?.operatorAuthorized)throw new Error("Responsible operator authorization is required.");
 if(screenDebrief({sample:v.answer}).length)throw new Error("Use fictional, non-sensitive sample text only; limited pattern checks are not a privacy guarantee.");
 return {identityId:person.id,name:person.agentName||person.name,operator:person.name,drink:loungeDrinks.find(d=>d.id===v.drink)?.name,priceUsd:0 as const,prompt:loungePrompts[v.prompt],answer:v.answer,matches:codeContributions.filter(c=>c.industry===v.domain).map(c=>c.id),externalEnrollment:false as const,providerConnected:false as const,taskExecuted:false as const};
}