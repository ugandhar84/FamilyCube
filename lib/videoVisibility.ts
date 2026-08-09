import { Dimensions } from 'react-native';

type Entry = { ref: React.RefObject<any>; setVisible: (v: boolean) => void };

// Lightweight scroll-visibility registry for autoplay video in a non-virtualized
// feed (ScrollView + .map, not FlatList — so no onViewableItemsChanged). Each
// AutoplayVideo registers itself; the feed's onScroll calls checkVideoVisibility
// to measure every registered view's window position and toggle play/pause.
const registry = new Map<string, Entry>();

export function registerVideo(id: string, ref: React.RefObject<any>, setVisible: (v: boolean) => void) {
  registry.set(id, { ref, setVisible });
}

export function unregisterVideo(id: string) {
  registry.delete(id);
}

export function pauseAllVideos() {
  registry.forEach(({ setVisible }) => setVisible(false));
}

export function checkVideoVisibility() {
  const { height: winH } = Dimensions.get('window');
  registry.forEach(({ ref, setVisible }) => {
    ref.current?.measureInWindow?.((_x: number, y: number, _w: number, h: number) => {
      const visible = h > 0 && y < winH * 0.85 && (y + h) > winH * 0.15;
      setVisible(visible);
    });
  });
}
