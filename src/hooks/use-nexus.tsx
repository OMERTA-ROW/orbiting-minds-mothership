import { useEffect, useRef, useState } from "react";
import { useGenesis } from "./use-genesis";
import {
  readNexusStore,
  initialNexusStore,
  applyNexusCommand,
  type NexusCommand,
} from "@/lib/nexus";
export const nexusStorageKey = "evolution-nexus-demo-v1";
export function useNexus() {
  const { store: g, ready: identityReady } = useGenesis();
  const [store, setStore] = useState(initialNexusStore),
    [ready, setReady] = useState(false),
    [issue, setIssue] = useState("");
  const current = useRef(store),
    preserve = useRef(false),
    saving = useRef(true);
  useEffect(() => {
    try {
      current.current = readNexusStore(localStorage.getItem(nexusStorageKey));
      setStore(current.current);
    } catch {
      preserve.current = true;
      saving.current = false;
      setIssue("Unreadable Nexus records preserved; actions temporary.");
    }
    setReady(true);
    const sync = (e: StorageEvent) => {
      if (e.key !== nexusStorageKey || preserve.current) return;
      try {
        current.current = readNexusStore(e.newValue);
        setStore(current.current);
      } catch {
        preserve.current = true;
        saving.current = false;
        setIssue("Changed records unreadable and preserved; actions temporary.");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const dispatch = (command: NexusCommand) => {
    if (!ready || !identityReady) throw new Error("Local records loading.");
    if (saving.current) {
      try {
        current.current = readNexusStore(localStorage.getItem(nexusStorageKey));
        setStore(current.current);
      } catch {
        preserve.current = true;
        saving.current = false;
        setIssue("Saved original preserved; actions temporary.");
      }
    }
    const next = applyNexusCommand(
      current.current,
      g,
      command,
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    current.current = next;
    setStore(next);
    if (!preserve.current) {
      try {
        localStorage.setItem(nexusStorageKey, JSON.stringify(next));
        saving.current = true;
        setIssue("");
      } catch {
        saving.current = false;
        setIssue("Browser cannot save; actions temporary until reload.");
      }
    }
  };
  return { store, ready: ready && identityReady, issue, dispatch };
}
