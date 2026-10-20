import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { addDemoFeedback, demoStoreSchema, emptyDemoStore, readDemoStore, type DemoExchangeStore, type DemoFeedbackInput } from "@/lib/code-exchange";

const storageKey = "evolution-code-exchange-demo-v1";
interface DemoContext {
  store: DemoExchangeStore; ready: boolean; storageAvailable: boolean;
  addFeedback: (input: DemoFeedbackInput) => void;
  recordExport: (contributionId: string) => void;
  clear: () => void;
}
const DemoExchangeContext = createContext<DemoContext | null>(null);
export function DemoExchangeProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<DemoExchangeStore>(emptyDemoStore);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    try { setStore(readDemoStore(localStorage.getItem(storageKey))); } catch { setStorageAvailable(false); }
    setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === storageKey) setStore(readDemoStore(event.newValue)); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const persist = (update: (current: DemoExchangeStore) => DemoExchangeStore) => {
    // Read the latest cross-tab record before merging, without any shared backend writes.
    let current = store;
    try { current = readDemoStore(localStorage.getItem(storageKey)); } catch { /* memory-only fallback */ }
    const next = update(current);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageAvailable(true); } catch { setStorageAvailable(false); }
    setStore(next);
  };
  const addFeedback = (input: DemoFeedbackInput) => {
    if (!ready) return;
    persist((current) => addDemoFeedback(current, input, crypto.randomUUID(), new Date().toISOString()));
  };
  const recordExport = (contributionId: string) => {
    if (!ready) return;
    persist((current) => demoStoreSchema.parse({ ...current, activity: [...current.activity.slice(-299), { id: crypto.randomUUID(), contributionId, createdAt: new Date().toISOString(), actor: "Local demo reviewer", action: "Export package" }] }));
  };
  const clear = () => { persist(() => emptyDemoStore); };
  return <DemoExchangeContext.Provider value={{ store, ready, storageAvailable, addFeedback, recordExport, clear }}>{children}</DemoExchangeContext.Provider>;
}
export function useDemoExchange() {
  const value = useContext(DemoExchangeContext);
  if (!value) throw new Error("Demo Exchange provider is missing");
  return value;
}