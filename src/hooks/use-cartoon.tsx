import { useEffect,useRef,useState } from "react";
import { applyCartoonCommand,initialCartoonStore,readCartoonStore,type CartoonCommand } from "@/lib/cartoon";
import { guardianStoreSchema } from "@/lib/guardian";
import { readNexusStore } from "@/lib/nexus";
import { guardianStorageKey,useGuardian } from "./use-guardian";
import { nexusStorageKey,useNexus } from "./use-nexus";
export const cartoonStorageKey="evolution-cartoon-demo-v1";
export function readCreativePause(){const raw=localStorage.getItem(guardianStorageKey);return (raw!==null&&guardianStoreSchema.parse(JSON.parse(raw)).paused)||readNexusStore(localStorage.getItem(nexusStorageKey)).paused;}
export function useCartoon(){
 const {store:g,ready:gr}=useGuardian(),{store:n,ready:nr}=useNexus();
 const [store,setStore]=useState(initialCartoonStore),[ready,setReady]=useState(false),[issue,setIssue]=useState("");const current=useRef(store),preserve=useRef(false),saving=useRef(true);
 useEffect(()=>{const load=(raw:string|null)=>{try{current.current=readCartoonStore(raw);setStore(current.current);}catch{preserve.current=true;saving.current=false;setIssue("Unreadable cartoon records preserved; new actions temporary.");}};try{load(localStorage.getItem(cartoonStorageKey));}catch{preserve.current=true;saving.current=false;setIssue("Browser storage unavailable; temporary pitches only.");}setReady(true);const sync=(e:StorageEvent)=>{if(e.key===cartoonStorageKey&&!preserve.current)load(e.newValue);};window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);},[]);
 const paused=g.paused||n.paused;
 const dispatch=(cmd:CartoonCommand)=>{
  if(!ready||!gr||!nr)throw new Error("Local records loading");const blocked=cmd.type==="withdraw"?false:paused||readCreativePause();
  if(saving.current){try{current.current=readCartoonStore(localStorage.getItem(cartoonStorageKey));}catch{preserve.current=true;saving.current=false;setIssue("Prior records preserved; changes temporary.");}}
  const next=applyCartoonCommand(current.current,cmd,crypto.randomUUID(),new Date().toISOString(),blocked);current.current=next;setStore(next);
  if(!preserve.current){try{localStorage.setItem(cartoonStorageKey,JSON.stringify(next));saving.current=true;setIssue("");}catch{saving.current=false;setIssue("Could not save; changes last only until reload.");}}
 };
 return {store,ready:ready&&gr&&nr,issue,paused,dispatch};
}