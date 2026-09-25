import type { ReactNode } from 'react';
import { ClockProvider } from './clock';
import { WorkspaceProvider } from './store';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClockProvider>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </ClockProvider>
  );
}
