import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { PROGRAMS } from '../data/inventory';
import { msUntilNextStatusChange } from '../domain/round';

/** Upper bound between refreshes, so a sleeping or throttled tab still catches up. */
const MAX_TICK_MS = 60_000;

const NowContext = createContext<Date | null>(null);

/**
 * Supplies the current time to every status display. Wakes exactly when the next
 * deadline passes (or a rolling status goes stale), at least once a minute, and
 * whenever the tab becomes visible again.
 */
export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const next = msUntilNextStatusChange(PROGRAMS, now);
    // Land just past the boundary, because a deadline has only passed strictly after it.
    const wait = next === null || next > MAX_TICK_MS ? MAX_TICK_MS : next + 50;
    const timer = setTimeout(() => setNow(new Date()), wait);
    return () => clearTimeout(timer);
  }, [now]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

/** The time status displays should use. Outside a ClockProvider, falls back to the wall clock. */
export function useNow(): Date {
  return useContext(NowContext) ?? new Date();
}
