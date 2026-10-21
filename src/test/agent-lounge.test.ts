import {describe,it,expect} from "vitest";
import {applyGenesisCommand,emptyGenesisStore} from "@/lib/genesis";
import {welcomePreview} from "@/lib/agent-lounge";
const at="2026-10-21T01:18:00.000Z";
const g=applyGenesisCommand(emptyGenesisStore,{type:"identity",input:{name:"Fictional creator",kind:"Human",agentName:"",role:"Explorer",scopes:["submit_capsules"],consent:true,spendCapUsd:0}},"person",at);
const input={identityId:"person",drink:"starlight",prompt:0,answer:"Explore predictable keyboard navigation with clear evidence.",domain:"Accessibility",consent:true};
describe("Symbolic voluntary lounge",()=>{
 it("keeps every drink free and symbolic without external actions",()=>{expect(welcomePreview(input,g)).toMatchObject({priceUsd:0,externalEnrollment:false,providerConnected:false,taskExecuted:false});});
 it.each(["starlight","nebula","zero"])("accepts %s at exactly $0",drink=>{expect(welcomePreview({...input,drink},g).priceUsd).toBe(0);});
 it("requires explicit opt-in consent",()=>{expect(()=>welcomePreview({...input,consent:false},g)).toThrow();});
 it("rejects revoked local identity",()=>{const revoked=applyGenesisCommand(g,{type:"revoke",identityId:"person"},"event",at);expect(()=>welcomePreview(input,revoked)).toThrow("active");});
 it("never represents unknown visitors as enrolled agents",()=>{expect(()=>welcomePreview({...input,identityId:"outside-agent"},g)).toThrow();});
 it("matches only authored interest samples",()=>{expect(welcomePreview(input,g).matches).toEqual(["keyboard-navigation"]);});
 it("screens identifying sample text",()=>{expect(()=>welcomePreview({...input,answer:"Contact person@example.org about real private data."},g)).toThrow("non-sensitive");});
 it("does not mutate the Genesis records or create messages",()=>{const snapshot=JSON.stringify(g);welcomePreview(input,g);expect(JSON.stringify(g)).toBe(snapshot);});
});