/**
 * OverlayPage / OverlayHeading — a FullPageOverlay whose heading can play the same slide-out as the edge swipe.
 * FullPageOverlay hands the animated close to a render-prop; screens with a long inline JSX tree would have to be
 * restructured to use it. OverlayPage puts it in context instead, and OverlayHeading (a PageHeading whose title tap
 * closes with the animation) reads it, so a page only swaps two tag names.
 */
import React, { createContext, useContext } from 'react';
import FullPageOverlay from './FullPageOverlay';
import { PageHeading } from './PageHeading';

const CloseContext = createContext<(() => void) | null>(null);

export function OverlayPage({ children, ...rest }: Omit<React.ComponentProps<typeof FullPageOverlay>, 'children'> & { children: React.ReactNode }) {
  return (
    <FullPageOverlay {...rest}>
      {(requestAnimatedClose) => <CloseContext.Provider value={requestAnimatedClose}>{children}</CloseContext.Provider>}
    </FullPageOverlay>
  );
}

export function OverlayHeading(props: React.ComponentProps<typeof PageHeading>) {
  const close = useContext(CloseContext);
  return <PageHeading {...props} onTitlePress={close ?? props.onTitlePress} />;
}
