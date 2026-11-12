/**
 * Browser-only "Show design previews" switch (Advanced). Off by default, so demo,
 * sample and simulated areas are hidden from the working site. It never grants
 * access: previews have no account data and owner pages keep their own checks.
 */
import { useSyncExternalStore } from "react";

const KEY = "evo.show-previews";
const EVENT = "evo:previews";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setShowPreviews(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the switch simply stays off */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** False during server render and hydration; then the saved browser choice. */
export function useShowPreviews(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
