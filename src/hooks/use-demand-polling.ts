import { useCallback, useEffect, useRef } from "react";
import { demandPolling } from "@/lib/demand-polling";

/** A false result stops automatic reads until an action or visibility return requests one. */
export function useDemandPolling(
  poll: () => Promise<number | false>,
  { enabled = true, allowHidden = false }: { enabled?: boolean; allowHidden?: boolean } = {},
) {
  const callback = useRef(poll);
  callback.current = poll;
  const controller = useRef<ReturnType<typeof demandPolling> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const current = demandPolling({
      poll: () => callback.current(),
      visible: () => document.visibilityState === "visible",
      allowHidden,
    });
    controller.current = current;
    const visibility = () => current.visibilityChanged();
    document.addEventListener("visibilitychange", visibility);
    void current.refresh();
    return () => {
      current.close();
      document.removeEventListener("visibilitychange", visibility);
      if (controller.current === current) controller.current = null;
    };
  }, [enabled, allowHidden]);
  return useCallback(() => controller.current?.refresh(), []);
}
