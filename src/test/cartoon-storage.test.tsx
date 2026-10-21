import { act,cleanup,renderHook,waitFor } from "@testing-library/react";
import { afterEach,describe,it,expect,vi } from "vitest";
import { useCartoon,cartoonStorageKey } from "@/hooks/use-cartoon";
import { GuardianProvider,guardianStorageKey } from "@/hooks/use-guardian";
import { GenesisProvider } from "@/hooks/use-genesis";
import { initialGuardianStore } from "@/lib/guardian";
import { nexusStorageKey } from "@/hooks/use-nexus";
import { initialNexusStore } from "@/lib/nexus";
import { seedCartoon } from "@/lib/cartoon";
const create={type:"create" as const,worldId:"nexus-studio",draft:seedCartoon(),consent:true};
function Wrapper({children}:{children:React.ReactNode}){return <GuardianProvider><GenesisProvider>{children}</GenesisProvider></GuardianProvider>;}
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
describe("Cartoon separate local storage",()=>{
 it("restores a saved series after remount",async()=>{const a=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready).toBe(true));act(()=>a.result.current.dispatch(create));a.unmount();const b=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(b.result.current.store.plans[0]?.title).toBe(create.draft.title));});
 it.each(["guardian","nexus"])("fresh %s pause blocks stale creation",async key=>{const a=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready).toBe(true));localStorage.setItem(key==="guardian"?guardianStorageKey:nexusStorageKey,JSON.stringify({...key==="guardian"?initialGuardianStore:initialNexusStore,paused:true}));act(()=>expect(()=>a.result.current.dispatch(create)).toThrow(/paused/));expect(a.result.current.store.plans).toHaveLength(0);});
 it("preserves unreadable prior cartoon records",async()=>{const raw='{"version":99,"keep":"original"}';localStorage.setItem(cartoonStorageKey,raw);const a=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready).toBe(true));act(()=>a.result.current.dispatch(create));expect(localStorage.getItem(cartoonStorageKey)).toBe(raw);});
 it("fails closed on unreadable policy but allows withdrawal",async()=>{const a=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready).toBe(true));act(()=>a.result.current.dispatch(create));const id=a.result.current.store.plans[0]?.id;if(!id)throw new Error("Missing pitch");localStorage.setItem(guardianStorageKey,"unreadable");act(()=>expect(()=>a.result.current.dispatch(create)).toThrow());act(()=>a.result.current.dispatch({type:"withdraw",id,worldId:create.worldId}));expect(a.result.current.store.plans[0]?.state).toBe("Withdrawn");});
 it("does not modify existing entertainment or OmniBridge records",async()=>{const keys=["evolution-entertainment-demo-v1","evolution-omnibridge-demo-v1",nexusStorageKey,guardianStorageKey];const a=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready).toBe(true));const before=keys.map(k=>localStorage.getItem(k));act(()=>a.result.current.dispatch(create));expect(keys.map(k=>localStorage.getItem(k))).toEqual(before);});
 it("refreshes other-tab records before mutation",async()=>{const a=renderHook(useCartoon,{wrapper:Wrapper}),b=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready&&b.result.current.ready).toBe(true));act(()=>a.result.current.dispatch(create));act(()=>b.result.current.dispatch(create));expect(b.result.current.store.plans).toHaveLength(2);});
 it("retains consecutive temporary changes when save fails",async()=>{vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("blocked");});const a=renderHook(useCartoon,{wrapper:Wrapper});await waitFor(()=>expect(a.result.current.ready).toBe(true));act(()=>{a.result.current.dispatch(create);a.result.current.dispatch(create);});expect(a.result.current.store.plans).toHaveLength(2);});
});