import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { genesisStorageKey, useGenesis } from "@/hooks/use-genesis";
import { genesisStoreSchema } from "@/lib/genesis";
import { emptyIncidentStore, incidentStorageKey, incidentStoreSchema, applyIncidentCommand, type IncidentCommand, type IncidentStore } from "@/lib/incidents";
const Context = createContext<{ store: IncidentStore; ready: boolean; issue: string; dispatch: (command: IncidentCommand) => string } | null>(null);
export function IncidentProvider({ children }: { children: ReactNode }) {
 const genesis = useGenesis(); const [store, setStore] = useState(emptyIncidentStore); const current = useRef(store);
 const [ready, setReady] = useState(false); const [issue, setIssue] = useState(""); const preserve = useRef(false); const works = useRef(true);
 const read = (raw: string | null) => raw === null ? structuredClone(emptyIncidentStore) : incidentStoreSchema.parse(JSON.parse(raw));
 useEffect(() => {
  const load = (raw: string | null) => { try { current.current = read(raw); setStore(current.current); } catch { preserve.current = true; works.current = false; setIssue("Unreadable archive records are preserved. New actions are temporary and will not overwrite them."); } };
  try { load(localStorage.getItem(incidentStorageKey)); } catch { preserve.current = true; works.current = false; setIssue("Browser storage is unavailable; new records are temporary."); }
  setReady(true); const sync = (event: StorageEvent) => { if (event.key === incidentStorageKey && !preserve.current) load(event.newValue); };
  window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
 }, []);
 const dispatch = (command: IncidentCommand) => {
  if (!ready || !genesis.ready) throw new Error("Local records are loading.");
  if (works.current) { try { current.current = read(localStorage.getItem(incidentStorageKey)); } catch { preserve.current = true; works.current = false; setIssue("Unreadable records are preserved; further actions are temporary."); } }
  let identityStore = genesis.store;
  if (genesis.storageAvailable) {
   try { const raw = localStorage.getItem(genesisStorageKey); if (raw !== null) identityStore = genesisStoreSchema.parse(JSON.parse(raw)); }
   catch { throw new Error("Current identity records cannot be validated. No debrief action was recorded."); }
  }
  const id = crypto.randomUUID(); const next = applyIncidentCommand(current.current, identityStore, command, id, new Date().toISOString());
  current.current = next; setStore(next);
  if (!preserve.current) { try { localStorage.setItem(incidentStorageKey, JSON.stringify(next)); works.current = true; setIssue(""); } catch { works.current = false; setIssue("This action could not be saved; new records are temporary until reload."); } }
  return id;
 };
 return <Context.Provider value={{ store, ready, issue, dispatch }}>{children}</Context.Provider>;
}
export function useIncidents() { const context = useContext(Context); if (!context) throw new Error("Incident provider missing"); return context; }