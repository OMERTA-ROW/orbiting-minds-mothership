import { useEffect,useRef,useState } from "react";
import { applyCreativeCommand,initialCreativeStore,readCreativeStore,type CreativeCommand } from "@/lib/entertainment";
import { guardianStoreSchema } from "@/lib/guardian";
import { readNexusStore } from "@/lib/nexus";
import { guardianStorageKey,useGuardian } from "./use-guardian";
import { nexusStorageKey,useNexus } from "./use-nexus";
export const entertainmentStorageKey="evolution-entertainment-demo-v1";
export function useEntertainment(){
 const {store:guardian,ready:gr}=useGuardian();const {store:nexus,ready:nr}=useNexus();
 const [store,setStore]=useState(initialCreativeStore),[ready,setReady]=useState(false),[issue,setIssue]=useState("");const current=useRef(store),preserve=useRef(false),saving=useRef(true);
 useEffect(()=>{const load=(raw:string|null)=>{try{current.current=readCreativeStore(raw);setStore(current.current);}catch{preserve.current=true;saving.current=false;setIssue("Unreadable creative records preserved. New plans temporary; use fictional samples only.");}};try{load(localStorage.getItem(entertainmentStorageKey));}catch{saving.current=false;preserve.current=true;setIssue("Browser storage unavailable; temporary plans only.");}setReady(true);const sync=(e:StorageEvent)=>{if(e.key===entertainmentStorageKey&&!preserve.current)load(e.newValue);};window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);},[]);
 const paused=guardian.paused||nexus.paused;
 const dispatch=(command:CreativeCommand)=>{
  if(!ready||!gr||!nr)throw new Error("Local records loading");let blocked=paused;
  if(command.type!=="withdraw"){const raw=localStorage.getItem(guardianStorageKey);blocked=blocked||(raw!==null&&guardianStoreSchema.parse(JSON.parse(raw)).paused)||readNexusStore(localStorage.getItem(nexusStorageKey)).paused;}
  if(saving.current){try{current.current=readCreativeStore(localStorage.getItem(entertainmentStorageKey));}catch{preserve.current=true;saving.current=false;setIssue("Prior records preserved; new actions temporary.");}}
  const next=applyCreativeCommand(current.current,command,crypto.randomUUID(),new Date().toISOString(),blocked);current.current=next;setStore(next);
  if(!preserve.current){try{localStorage.setItem(entertainmentStorageKey,JSON.stringify(next));saving.current=true;setIssue("");}catch{saving.current=false;setIssue("Cannot save in this browser; changes temporary until reload.");}}
 };
 return {store,ready:ready&&gr&&nr,issue,paused,dispatch};
}