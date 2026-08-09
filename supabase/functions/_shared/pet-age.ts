export function petAge(birthday: string | null): string {
  if (!birthday) return 'Age unknown';
  const b = new Date(birthday), t = new Date();
  let y = t.getFullYear() - b.getFullYear();
  let m = t.getMonth() - b.getMonth();
  if (m < 0) { y--; m += 12; }
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}
