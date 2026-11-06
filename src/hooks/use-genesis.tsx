import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyGenesisCommand,
  emptyGenesisStore,
  genesisStoreSchema,
  type GenesisCommand,
  type GenesisStore,
} from "@/lib/genesis";
export const genesisStorageKey = "evolution-genesis-demo-v1";
interface Context {
  store: GenesisStore;
  ready: boolean;
  storageAvailable: boolean;
  storageIssue: string;
  dispatch: (command: GenesisCommand) => string;
}
function readPreservingStore(raw: string | null) {
  return raw === null
    ? structuredClone(emptyGenesisStore)
    : genesisStoreSchema.parse(JSON.parse(raw));
}
const GenesisContext = createContext<Context | null>(null);
export function GenesisProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<GenesisStore>(emptyGenesisStore);
  const current = useRef(store);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [storageIssue, setStorageIssue] = useState("");
  const preserveUnreadable = useRef(false);
  const storageWorks = useRef(true);
  useEffect(() => {
    try {
      current.current = readPreservingStore(localStorage.getItem(genesisStorageKey));
      setStore(current.current);
    } catch {
      storageWorks.current = false;
      preserveUnreadable.current = true;
      setStorageAvailable(false);
      setStorageIssue(
        "Stored Genesis records could not be read. The original is preserved; new actions are temporary, not saved over it.",
      );
    }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === genesisStorageKey && !preserveUnreadable.current) {
        try {
          current.current = readPreservingStore(event.newValue);
          setStore(current.current);
        } catch {
          storageWorks.current = false;
          preserveUnreadable.current = true;
          setStorageAvailable(false);
          setStorageIssue(
            "Changed Genesis storage is unreadable. Existing content is preserved; further actions are temporary.",
          );
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const dispatch = (command: GenesisCommand) => {
    if (!ready) throw new Error("Local records are still loading.");
    if (storageWorks.current) {
      try {
        current.current = readPreservingStore(localStorage.getItem(genesisStorageKey));
      } catch {
        storageWorks.current = false;
        preserveUnreadable.current = true;
        setStorageAvailable(false);
        setStorageIssue(
          "Stored Genesis records could not be read. The original is preserved; new actions are temporary.",
        );
      }
    }
    const recordId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = applyGenesisCommand(current.current, command, recordId, new Date().toISOString());
    current.current = next;
    setStore(next);
    if (!preserveUnreadable.current) {
      try {
        localStorage.setItem(genesisStorageKey, JSON.stringify(next));
        storageWorks.current = true;
        setStorageAvailable(true);
        setStorageIssue("");
      } catch {
        storageWorks.current = false;
        setStorageAvailable(false);
        setStorageIssue(
          "Browser storage could not save this action. New records are temporary; reloading may restore only older saved records.",
        );
      }
    }
    return recordId;
  };
  return (
    <GenesisContext.Provider value={{ store, ready, storageAvailable, storageIssue, dispatch }}>
      {children}
    </GenesisContext.Provider>
  );
}
export function useGenesis() {
  const value = useContext(GenesisContext);
  if (!value) throw new Error("Genesis provider missing");
  return value;
}
