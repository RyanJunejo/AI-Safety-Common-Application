import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { localDay } from '../catalog/dates';

const TodayContext = createContext<string | null>(null);

/**
 * Today's date in the viewer's timezone (YYYY-MM-DD). Deadlines are calendar dates,
 * so statuses only change when the day does. Checks each minute and on return to the tab.
 */
export function ClockProvider({ children }: { children: ReactNode }) {
  const [today, setToday] = useState(() => localDay(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localDay(new Date()));
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

export function useToday(): string {
  return useContext(TodayContext) ?? localDay(new Date());
}
