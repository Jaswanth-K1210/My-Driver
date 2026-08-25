/**
 * Booking returns before dispatch finishes, so dispatch runs as a detached
 * promise. Tracking those promises lets tests await quiescence instead of
 * racing the background work, and lets shutdown drain in-flight dispatches.
 */
const inFlight = new Set<Promise<unknown>>()

export function trackDispatch(p: Promise<unknown>): void {
  inFlight.add(p)
  void p.finally(() => inFlight.delete(p))
}

export async function awaitDispatchIdle(): Promise<void> {
  while (inFlight.size > 0) {
    await Promise.allSettled([...inFlight])
  }
}

export const dispatchInFlight = (): number => inFlight.size
