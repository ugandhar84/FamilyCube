/**
 * OverlayHost / OverlayPortal — lets a full-page overlay that is declared deep inside a scrolling screen render at the screen's root.
 *
 * Why: a FullPageOverlay is position:absolute, so inside a ScrollView it fills the scrolled CONTENT instead of the screen (a blank page that
 * scrolls away). The parent Hub avoids this by lifting every overlay up to HubScreen by hand. The grandparent Hub declares many forms
 * deep in its own tree, so each one wraps itself in an OverlayPortal, and HubScreen renders one <OverlayHost /> outside its ScrollView.
 *
 * The portal re-sends its content on every render, so the page stays live (state changes inside the page still work). The host is its own
 * component subscribed to the store, so updating it never re-renders the screen that declared the page (no loop).
 * With no host mounted, the portal renders its content in place, as before.
 */
import React, { Fragment, useEffect } from 'react';
import { create } from 'zustand';

interface Item { id: string; node: React.ReactNode }
interface HostStore {
  items: Item[]; hosts: number;
  put: (id: string, node: React.ReactNode) => void;
  drop: (id: string) => void;
  addHost: () => void; removeHost: () => void;
}

const useHostStore = create<HostStore>((set) => ({
  items: [], hosts: 0,
  put: (id, node) => set(s => (s.items.some(i => i.id === id) ? { items: s.items.map(i => (i.id === id ? { id, node } : i)) } : { items: [...s.items, { id, node }] })),
  drop: (id) => set(s => (s.items.some(i => i.id === id) ? { items: s.items.filter(i => i.id !== id) } : s)),
  addHost: () => set(s => ({ hosts: s.hosts + 1 })),
  removeHost: () => set(s => ({ hosts: Math.max(0, s.hosts - 1) })),
}));

// Only portal into a host when rendered INSIDE the screen that owns it (a tab's overlays live in that tab). Without this a
// page on another tab would put its overlay into the Hub's host and it would open invisibly underneath.
const HostScope = React.createContext(false);
export function OverlayHostScope({ children }: { children: React.ReactNode }) {
  return <HostScope.Provider value>{children}</HostScope.Provider>;
}

export function OverlayHost() {
  const items = useHostStore(s => s.items);
  useEffect(() => { useHostStore.getState().addHost(); return () => useHostStore.getState().removeHost(); }, []);
  return <>{items.map(i => <Fragment key={i.id}>{i.node}</Fragment>)}</>;
}

let counter = 0;
export function OverlayPortal({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const [id] = React.useState(() => `overlay-${++counter}`);
  const inScope = React.useContext(HostScope);
  const hosted = useHostStore(s => s.hosts > 0) && inScope;
  // Every render: keep the host's copy current (or remove it when closed).
  useEffect(() => {
    if (!hosted) return;
    if (visible) useHostStore.getState().put(id, children); else useHostStore.getState().drop(id);
  });
  useEffect(() => () => useHostStore.getState().drop(id), [id]);
  if (hosted) return null;
  return <>{visible ? children : null}</>;
}
