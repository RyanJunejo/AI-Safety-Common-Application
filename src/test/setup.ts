import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  // Server tests run in Node, without a DOM.
  if (typeof window === 'undefined') return;
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
