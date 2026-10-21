import { useEffect, useRef, useState } from "react";
import { applyOmniCommand, initialOmniStore, readOmniStore, type OmniCommand } from "@/lib/omnibridge";
import { guardianStoreSchema } from "@/lib/guardian";
import { readNexusStore } from "@/lib/nexus";
import { guardianStorageKey, useGuardian } from "./use-guardian";
import { nexusStorageKey, useNexus } from "./use-nexus";
export const omniStorageKey="evolution-omnibridge-demo-v1";
export function useOmniBridge(){
 const {store:guardian,ready:guardianReady}=useGuardian();const {store:nexus,ready:nexusReady}=useNexus();
 const [store,setStore]=useState(initialOmniStore),[ready,setReady]=useState(false),[issue,setIssue]=useState("");
 const current=useRef(store),preserve=useRef(false),saving=useRef(true);
 useEffect(()=>{try{current.current=readOmniStore(localStorage.getItem(omniStorageKey));setStore(current.current);}catch{preserve.current=true;saving.current=false;setIssue("Unreadable OmniBridge records preserved; new actions temporary.");}setReady(true);
 const sync=(e:StorageEvent)=>{if(e.key!==omniStorageKey||preserve.current)return;try{current.current=readOmniStore(e.newValue);setStore(current.current);}catch{preserve.current=true;saving.current=false;setIssue("Changed records unreadable; original preserved.");}};window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);},[]);
 const paused=guardian.paused||nexus.paused;
 const dispatch=(command:OmniCommand)=>{
  if(!ready||!guardianReady||!nexusReady)throw new Error("Local records loading");
  let blocked=paused;
  if(command.type!=="withdraw"){
   const raw=localStorage.getItem(guardianStorageKey);
   blocked=blocked||(raw!==null&&guardianStoreSchema.parse(JSON.parse(raw)).paused)||readNexusStore(localStorage.getItem(nexusStorageKey)).paused;
  }
  if(saving.current){try{current.current=readOmniStore(localStorage.getItem(omniStorageKey));setStore(current.current);}catch{preserve.current=true;saving.current=false;setIssue("Saved original preserved; new actions temporary.");}}
  const next=applyOmniCommand(current.current,command,crypto.randomUUID(),new Date().toISOString(),blocked);current.current=next;setStore(next);
  if(!preserve.current){try{localStorage.setItem(omniStorageKey,JSON.stringify(next));saving.current=true;setIssue("");}catch{saving.current=false;setIssue("Browser cannot save; records temporary until reload.");}}
 };
 return {store,ready:ready&&guardianReady&&nexusReady,issue,paused,dispatch};
}