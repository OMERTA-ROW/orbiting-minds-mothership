import { describe,it,expect } from "vitest";
import { parseOmniMessage,omniTemplateReply,stageOmniHandoff,takeOmniHandoff } from "@/lib/omni-assistant";
import { reviewOmniPlan } from "@/lib/omnibridge";
const at="2026-10-21T02:21:00.000Z";
describe("OMNI coordinator boundaries",()=>{
 it("routes @omni to the named coordinator",()=>expect(parseOmniMessage("@omni Plan a Blender scene.")).toBe("Plan a Blender scene."));
 it.each(["@gpt write code","@claude critique this","@all-connected publish it"])("does not activate %s",raw=>expect(()=>parseOmniMessage(raw)).toThrow(/No other agent/));
 it("rejects the separate excluded project",()=>expect(()=>parseOmniMessage("@omni access CyberLink Social")).toThrow(/Excluded/));
 it("rejects pasted credentials",()=>expect(()=>parseOmniMessage("api_key=not-a-real-key" )).toThrow(/credentials/));
 it("requires consent",()=>expect(()=>omniTemplateReply("Plan a Blender scene","nexus-studio",["local"],false,"p",at,false)).toThrow(/Consent/));
 it("cannot override Guardian pause",()=>expect(()=>omniTemplateReply("Plan a Blender scene","nexus-studio",["local"],true,"p",at,true)).toThrow(/paused/));
 it("keeps Cyberace unconnected and execution off",()=>{const r=omniTemplateReply("Plan a GitHub code review","nexus-cyberace",["local"],true,"p",at,false);expect(r.plan?.providerCalls).toBe(0);expect(r.plan?.executionAllowed).toBe(false);expect(r.plan?.steps[0]?.affected).toEqual(["SAMPLE:/Cyberace/adapter-plan.ts"]);});
 it("includes only explicitly selected handoff previews",()=>{const r=omniTemplateReply("Plan a Blender scene","nexus-studio",["local","anthropic"],true,"p",at,false);expect(r.plan?.steps.some(s=>s.connector==="anthropic")).toBe(true);expect(r.plan?.steps.some(s=>s.connector==="openai")).toBe(false);expect(r.plan?.providerCalls).toBe(0);});
 it("requires human review of all scopes",()=>{const {plan}=omniTemplateReply("Plan a Blender scene","nexus-studio",["local"],true,"p",at,false);if(!plan)throw new Error("No plan");expect(()=>reviewOmniPlan(plan,{reviewer:"Demo human",scopes:[],consent:true},at,false)).toThrow(/scope/);});
 it("human review never authorizes execution",()=>{const {plan}=omniTemplateReply("Plan a Blender scene","nexus-studio",["local"],true,"p",at,false);if(!plan)throw new Error("No plan");const r=reviewOmniPlan(plan,{reviewer:"Demo human",scopes:plan.steps.flatMap(s=>s.scopes),consent:true},at,false);expect(r.state).toBe("Reviewed DEMO");expect(r.executionAllowed).toBe(false);});
 it("consumes an event-only handoff once",()=>{stageOmniHandoff("nexus-studio","@omni Plan a Blender scene",false);expect(takeOmniHandoff("nexus-studio")).toBe("@omni Plan a Blender scene");expect(takeOmniHandoff("nexus-studio")).toBe("");});
 it("does not expose a handoff to another world",()=>{stageOmniHandoff("nexus-studio","@omni Plan a Blender scene",false);expect(takeOmniHandoff("nexus-nebula")).toBe("");});
 it("blocks handoff staging while paused",()=>{expect(()=>stageOmniHandoff("nexus-studio","@omni Plan a Blender scene",true)).toThrow(/paused/);expect(takeOmniHandoff("nexus-studio")).toBe("");});
});