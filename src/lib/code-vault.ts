import { z } from "zod";
import { diffLines } from "diff";
import { artifactDigest, releaseInput, releaseState, type ReleaseRecord, type TrustStore } from "./trusted-release";
import type { GenesisStore } from "./genesis";
import { codeContributions, type CodeContribution } from "@/data/evolution";

export const vaultSearch = (search: Record<string, unknown>): { code?: string; record?: string } => ({
 ...(typeof search["code"] === "string" && codeContributions.some(c=>c.id===search["code"]) ? {code:search["code"]} : {}),
 ...(typeof search["record"] === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(search["record"]) ? {record:search["record"]} : {}),
});
export function vaultManifest(r: ReleaseRecord, store: TrustStore, g: GenesisStore) {
 const code=codeContributions.find(c=>c.id===r.codeId);
 return {schemaVersion:1, mode:"LOCAL_DEMO", codeId:r.codeId, version:r.version, filename:code?.filename ?? "sample.txt", digestAlgorithm:"SHA-256", artifactDigest:r.digest, artifactBytes:new TextEncoder().encode(r.artifact).byteLength,
 license:r.license, ownerDeclaration:r.ownerId, agentOperatorDeclaration:r.agentOperatorId || null, testDeclarations:r.testEvidence, dependencies:r.dependencies,
 reviewer:r.signoff ? {identityDeclaration:r.signoff.reviewerId,at:r.signoff.at,digest:r.signoff.digest,note:r.signoff.note} : null, ownerConfirmation:r.ownerSignoff ?? null,
 state:releaseState(r,store,g), previousVersion:r.previousVersion || null, signature:null, trustedKey:null, authenticated:false, tamperEvident:false, installationAllowed:false, hardwareAllowed:false};
}
export async function vaultBundle(r:ReleaseRecord,store:TrustStore,g:GenesisStore) {
 const manifest=vaultManifest(r,store,g); const manifestText=JSON.stringify(manifest);
 return {manifest,manifestText,manifestDigest:await artifactDigest(manifestText),artifact:r.artifact,artifactMatchesRecord:await artifactDigest(r.artifact)===r.digest, signatureStatus:"UNSIGNED / NOT VERIFIED", originTrust:"EDITABLE LOCAL DEMO; NOT A TRUSTED TRUST ROOT"};
}
export function vaultReview(r:ReleaseRecord,store:TrustStore,g:GenesisStore) {
 const state=releaseState(r,store,g);
 return {state, reviewerDeclared:state==="Demo signed off" && Boolean(r.signoff), ownerDeclared:state==="Demo signed off" && Boolean(r.ownerSignoff), deploymentAllowed:false as const};
}
export const copySchema=z.string().max(20000);
export async function compareVaultCopy(original:string,recordedDigest:string,copy:string) {
 copySchema.parse(original);copySchema.parse(copy);
 const [originalDigest,copyDigest]=await Promise.all([artifactDigest(original),artifactDigest(copy)]);
 const originMatchesRecord=originalDigest===recordedDigest, matchesOrigin=original===copy;
 const diff=diffLines(original,copy,{newlineIsToken:true});
 const added=diff.filter(d=>d.added).map(d=>d.value).join("\n");
 const warnings:string[]=[];
 if(!originMatchesRecord)warnings.push("Stored origin digest mismatch; this reference is modified/unverified.");
 if(!matchesOrigin)warnings.push("Changed copy requires a new version, fresh tests, separate review and owner signoff.");
 if(added.split(/\r?\n/).some(l=>l.trim()&&!/^(#|\/\/)/.test(l.trim())))warnings.push("Added or replaced statements require origin-vs-change review; no commands were executed.");
 if(/\b(eval|exec|fetch|spawn|system|subprocess|child_process|os\.system)\b|\bcurl\b|\brm\s+-|\bsudo\b|\bpowershell\b|\bbash\b/.test(added))warnings.push("Potential extra command, dynamic execution or network call in added text. Pattern warning only.");
 if(/^(<<<<<<<|=======|>>>>>>>)/m.test(copy))warnings.push("Unresolved merge conflict markers.");
 return {originalDigest,copyDigest,originMatchesRecord,matchesOrigin,status:!originMatchesRecord||!matchesOrigin ? "MODIFIED / UNVERIFIED" : "HASH MATCH / UNSIGNED DEMO",signatureVerified:false as const,installationAllowed:false as const,diff,warnings};
}
export function forkVaultRelease(r:ReleaseRecord,copy:string,version:string,ownerId:string,consent:boolean) {
 const parsed=releaseInput.parse({...r, id:undefined,at:undefined,digest:undefined,signoff:undefined,ownerSignoff:undefined,state:undefined});
 return parsed;
}

export async function syntaxReview(source:string,language:CodeContribution["language"]) {
 copySchema.parse(source);
 if(language==="Python") {
  const {parser}=await import("@lezer/python");const tree=parser.parse(source),cursor=tree.cursor();const issues:string[]=[];
  do {if(cursor.type.isError){const line=source.slice(0,cursor.from).split("\n").length;issues.push(`Python grammar issue near line ${line}; independent interpreter/type checks still required.`);}}while(cursor.next());
  return {parser:"Python grammar parser",issues:[...new Set(issues)].slice(0,12),executed:false as const};
 }
 const {parse}=await import("@babel/parser");
 try{parse(source,{sourceType:"unambiguous",plugins:language==="TypeScript"?["typescript"]:[]});return {parser:`${language} syntax parser`,issues:[] as string[],executed:false as const};}
 catch(e){return {parser:`${language} syntax parser`,issues:[e instanceof Error?e.message:"Syntax could not be parsed."],executed:false as const};}
}