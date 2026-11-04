import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

type Options<T> = {
  key: string;
  initial: T;
  read: (raw: string | null) => T;
  write?: (value: T) => string;
  collections: string[];
};

/** Preserve unreadable/concurrently changed originals; never equate a local edit with a saved record. */
export function useOmniLocalRecords<T>({ key, initial, read, write = JSON.stringify, collections }: Options<T>) {
  const [records, setRecords] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const options = useRef({ read, write, collections });
  const baseline = useRef<string | null>(null);
  const previous = useRef<T>(initial);
  const temporary = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (options.current.collections.length === 0) {
          if (!Array.isArray(parsed)) throw new Error("Invalid records");
        } else if (!parsed || typeof parsed !== "object" || options.current.collections.some(
          (name) => !Array.isArray((parsed as Record<string, unknown>)[name]),
        )) throw new Error("Invalid records");
      }
      const value = options.current.read(raw);
      baseline.current = raw;
      previous.current = value;
      setRecords(value);
    } catch {
      temporary.current = true;
      setStorageNotice("Saved browser records could not be read. The original is preserved; new work is temporary and will not survive reload.");
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready || previous.current === records) return;
    previous.current = records;
    if (temporary.current) return;
    try {
      if (localStorage.getItem(key) !== baseline.current) {
        temporary.current = true;
        setStorageNotice("Browser records changed in another tab. That saved copy is preserved; this tab's new work is temporary. Reload to read the saved copy.");
        return;
      }
      const raw = options.current.write(records);
      localStorage.setItem(key, raw);
      baseline.current = raw;
      setStorageNotice("");
    } catch {
      temporary.current = true;
      setStorageNotice("Browser saving failed. Existing saved records are preserved; new work is temporary and will not survive reload.");
    }
  }, [key, ready, records]);

  return { records, setRecords: setRecords as Dispatch<SetStateAction<T>>, ready, storageNotice };
}