import { useEffect, useRef, useState } from "react";
import { applyRoboticsCommand, initialRoboticsStore, roboticsStorageKey, roboticsStoreSchema, type RoboticsCommand } from "@/lib/robotics";
const read = (raw: string | null) => raw === null ? structuredClone(initialRoboticsStore) : roboticsStoreSchema.parse(JSON.parse(raw));
export function useRobotics() {
 const [store, setStore] = useState(initialRoboticsStore); const [ready, setReady] = useState(false); const [issue, setIssue] = useState(""); const current = useRef(store); const preserve = useRef(false); const persistent = useRef(true);
 useEffect(() => { try { current.current = read(localStorage.getItem(roboticsStorageKey)); setStore(current.current); } catch { preserve.current = true; persistent.current = false; setIssue("Unreadable lab records preserved. New actions are temporary until reload."); } setReady(true);
 const sync = (e: StorageEvent) => { if (e.key !== roboticsStorageKey || !persistent.current) return; try { current.current = read(e.newValue); setStore(current.current); } catch { preserve.current = true; persistent.current = false; setIssue("Changed lab records unreadable; preserved. Actions temporary."); } }; window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync); }, []);
 const dispatch = (command: RoboticsCommand) => { if (!ready) throw new Error("Local records loading"); if (persistent.current) { try { current.current = read(localStorage.getItem(roboticsStorageKey)); } catch { preserve.current = true; persistent.current = false; setIssue("Unreadable original preserved; actions temporary."); } }
 const next = applyRoboticsCommand(current.current, command, crypto.randomUUID(), new Date().toISOString()); current.current = next; setStore(next);
 if (!preserve.current) { try { localStorage.setItem(roboticsStorageKey, JSON.stringify(next)); persistent.current = true; setIssue(""); } catch { persistent.current = false; setIssue("Browser cannot save lab records; actions temporary until reload."); } } };
 return { store, ready, issue, dispatch };
}
