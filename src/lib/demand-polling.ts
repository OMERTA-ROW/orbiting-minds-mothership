/** Serial, demand-driven observation only. Never use this for server safety leases. */
export function demandPolling({
  poll,
  visible,
  allowHidden = false,
}: {
  poll: () => Promise<number | false>;
  visible: () => boolean;
  allowHidden?: boolean;
}) {
  let closed = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refresh = async () => {
    if (closed || pending || (!allowHidden && !visible())) return;
    clearTimeout(timer);
    timer = undefined;
    pending = true;
    let delay: number | false = false;
    try {
      delay = await poll();
    } catch {
      // An observation failure is never automatically replayed. Callers display their error.
      delay = false;
    } finally {
      pending = false;
      if (!closed && delay !== false && (allowHidden || visible()))
        timer = setTimeout(() => void refresh(), delay);
    }
  };

  return {
    refresh,
    visibilityChanged() {
      if (visible()) void refresh();
      else if (!allowHidden) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}

export function executionPollDelay(
  state: { armed: boolean; running: boolean; cancellationPending: boolean } | null | undefined,
): number | false {
  return state && (state.armed || state.running || state.cancellationPending) ? 5000 : false;
}
