import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyGuardianCommand,
  guardianStoreSchema,
  initialGuardianStore,
  type GuardianCommand,
  type GuardianStore,
} from "@/lib/guardian";
export const guardianStorageKey = "evolution-guardian-demo-v1";
const Context = createContext<{
  store: GuardianStore;
  ready: boolean;
  issue: string;
  now: string;
  dispatch: (command: GuardianCommand) => void;
} | null>(null);
const read = (raw: string | null) =>
  raw === null ? structuredClone(initialGuardianStore) : guardianStoreSchema.parse(JSON.parse(raw));
export function GuardianProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState(initialGuardianStore);
  const [ready, setReady] = useState(false);
  const [issue, setIssue] = useState("");
  const [now, setNow] = useState("");
  const current = useRef(store);
  const persistent = useRef(true);
  const preserve = useRef(false);
  useEffect(() => {
    try {
      current.current = read(localStorage.getItem(guardianStorageKey));
      setStore(current.current);
    } catch {
      persistent.current = false;
      preserve.current = true;
      setIssue("Unreadable saved Guardian demo data preserved. New actions are temporary.");
    }
    setReady(true);
    setNow(new Date().toISOString());
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    const sync = (e: StorageEvent) => {
      if (e.key !== guardianStorageKey || !persistent.current) return;
      try {
        current.current = read(e.newValue);
        setStore(current.current);
      } catch {
        persistent.current = false;
        preserve.current = true;
        setIssue("Changed demo data unreadable; preserved. Actions temporary.");
      }
    };
    window.addEventListener("storage", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const dispatch = (command: GuardianCommand) => {
    if (!ready) throw new Error("Demo records loading");
    if (persistent.current) {
      try {
        current.current = read(localStorage.getItem(guardianStorageKey));
      } catch {
        persistent.current = false;
        preserve.current = true;
        setIssue("Saved original preserved; new actions temporary.");
      }
    }
    const next = applyGuardianCommand(
      current.current,
      command,
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    current.current = next;
    setStore(next);
    if (!preserve.current) {
      try {
        localStorage.setItem(guardianStorageKey, JSON.stringify(next));
        persistent.current = true;
        setIssue("");
      } catch {
        persistent.current = false;
        setIssue("Browser cannot save; actions temporary until reload.");
      }
    }
  };
  return (
    <Context.Provider value={{ store, ready, issue, now, dispatch }}>{children}</Context.Provider>
  );
}
export function useGuardian() {
  const value = useContext(Context);
  if (!value) throw new Error("Guardian context missing");
  return value;
}
