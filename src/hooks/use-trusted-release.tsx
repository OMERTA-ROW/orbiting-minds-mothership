import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { genesisStorageKey, useGenesis } from "@/hooks/use-genesis";
import { genesisStoreSchema } from "@/lib/genesis";
import { applyTrustCommand, emptyTrustStore, trustStorageKey, trustStoreSchema, type TrustCommand, type TrustStore } from "@/lib/trusted-release";
const read = (raw: string | null) => raw === null ? structuredClone(emptyTrustStore) : trustStoreSchema.parse(JSON.parse(raw));
const Context = createContext<{ store: TrustStore; ready: boolean; issue: string; dispatch: (command: TrustCommand) => Promise<string> } | null>(null);
export function TrustedReleaseProvider({ children }: { children: ReactNode }) {
 const genesis = useGenesis(); const genesisRef = useRef(genesis); genesisRef.current = genesis;
 const [store,setStore] = useState(emptyTrustStore), current = useRef(store);
 const [ready,setReady] = useState(false), [issue,setIssue] = useState("");
 const preserve = useRef(false), persistent = useRef(true), queue = useRef<Promise<unknown>>(Promise.resolve());
 useEffect(() => {
  const load = (raw: string | null) => { try { current.current = read(raw); setStore(current.current); } catch { preserve.current = true; persistent.current = false; setIssue("Unreadable trust records are preserved; new actions are temporary. Use sample content only."); } };
  try { load(localStorage.getItem(trustStorageKey)); } catch { preserve.current = true; persistent.current = false; setIssue("Browser storage unavailable; records are temporary."); }
  setReady(true); const sync = (e:StorageEvent) => { if (e.key === trustStorageKey && !preserve.current) load(e.newValue); };
  window.addEventListener("storage",sync); return () => window.removeEventListener("storage",sync);
 },[]);
 const identities = () => { const g=genesisRef.current; if (!g.ready) throw new Error("Identity records are loading."); if (!g.storageAvailable) return g.store; const raw=localStorage.getItem(genesisStorageKey); return raw === null ? g.store : genesisStoreSchema.parse(JSON.parse(raw)); };
 const dispatch = (command:TrustCommand) => {
  const task = queue.current.then(async () => {
   if (!ready) throw new Error("Local trust records are loading.");
   if (persistent.current) { try { current.current=read(localStorage.getItem(trustStorageKey)); } catch { preserve.current=true; persistent.current=false; setIssue("Unreadable records preserved; actions are temporary."); } }
   const g=identities(), identitySnapshot=JSON.stringify(g), storeSnapshot=JSON.stringify(current.current), id=crypto.randomUUID();
   const next=await applyTrustCommand(current.current,g,command,id,new Date().toISOString());
   if (JSON.stringify(identities()) !== identitySnapshot) throw new Error("Identity consent changed during this action. Nothing recorded; review and try again.");
   if (persistent.current && JSON.stringify(read(localStorage.getItem(trustStorageKey))) !== storeSnapshot) throw new Error("Trust records changed in another tab. Reload and review before continuing.");
   current.current=next; setStore(next);
   if (!preserve.current) { try { localStorage.setItem(trustStorageKey,JSON.stringify(next)); persistent.current=true; setIssue(""); } catch { persistent.current=false; setIssue("Action could not be saved; records are temporary until reload."); } }
   return id;
  });
  queue.current=task.catch(() => undefined); return task;
 };
 return <Context.Provider value={{ store,ready,issue,dispatch }}>{children}</Context.Provider>;
}
export function useTrustedRelease() { const context=useContext(Context); if (!context) throw new Error("Trust provider missing"); return context; }