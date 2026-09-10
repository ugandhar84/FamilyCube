// Smart Hub — adapter registry. The ONLY place that knows which vendor
// string maps to which adapter implementation; every edge function calls
// getAdapter(vendor) and works with the returned SmartHubAdapter
// interface only, never a vendor-specific class directly.
import type { SmartHubAdapter } from './adapter.ts';
import { MockSmartHubAdapter } from './mockAdapter.ts';

export * from './adapter.ts';

export function getAdapter(vendor: string): SmartHubAdapter {
  switch (vendor) {
    case 'mock':
      return new MockSmartHubAdapter();
    // Add a real vendor here once credentials exist — e.g.
    // case 'honeywell': return new HoneywellSmartHubAdapter();
    // See docs/smart-hub-mock-adapter.md for the exact steps.
    default:
      throw new Error(`Unknown smart hub vendor: ${vendor}`);
  }
}
