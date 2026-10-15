import type { ReactNode } from 'react';
import type { AccountBackend } from '../lib/accountBackend';
import type { CatalogSource } from '../lib/catalogSource';
import { AccountProvider } from './account';
import { CatalogProvider } from './catalog';
import { ClockProvider } from './clock';

/** Everything the pages read from. Tests pass their own catalog and account backend. */
export function Providers({
  catalog,
  account,
  children,
}: {
  catalog?: CatalogSource | Promise<CatalogSource>;
  account?: AccountBackend | null | Promise<AccountBackend | null>;
  children: ReactNode;
}) {
  return (
    <ClockProvider>
      <CatalogProvider source={catalog}>
        <AccountProvider backend={account}>{children}</AccountProvider>
      </CatalogProvider>
    </ClockProvider>
  );
}
