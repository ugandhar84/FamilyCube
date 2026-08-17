// Shared 50/40/10 coin split used both when a grandparent approves a
// finished quest and when previewing a new quest's payout. Extracted so the
// same rounding rule (floor spend/save, remainder to give) lives in one
// place instead of being reimplemented at each call site.
export function splitCoins(pts: number): { spend: number; save: number; give: number } {
  const spend = Math.floor(pts * 0.5);
  const save = Math.floor(pts * 0.4);
  const give = pts - spend - save;
  return { spend, save, give };
}
