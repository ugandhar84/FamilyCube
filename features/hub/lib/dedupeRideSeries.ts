/**
 * dedupeRideSeries — the one series-collapse pass for a recurring ride
 * series (e.g. "Pickup from chess club" every Mon/Wed/Fri), shared between
 * ActionNeededSection.tsx (renders the deduped cards) and ParentView.tsx
 * (computes the badge count from the same deduped list). Previously each
 * file ran its own independently-written dedup — same intent, different
 * code — which happened to agree today but had no structural guarantee of
 * staying in sync; the code comments in both files already flagged this
 * exact "12 pending, but only 3 cards" bug as something that had actually
 * happened once. Only the soonest occurrence per seriesId survives; a
 * shared `seenSeries` set spans both lists passed in, since a ride-category
 * event and a rideRequired event never share a seriesId in practice but
 * keeping the pass unified avoids relying on that never changing.
 */
import type { FamilyEvent } from '@/store/eventStore';

export function dedupeRideSeries(...lists: FamilyEvent[][]): FamilyEvent[][] {
  const seenSeries = new Set<string>();
  const dedupOne = (evs: FamilyEvent[]) => [...evs]
    .sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))
    .filter(ev => {
      if (!ev.seriesId) return true;
      if (seenSeries.has(ev.seriesId)) return false;
      seenSeries.add(ev.seriesId);
      return true;
    });
  return lists.map(dedupOne);
}
