/**
 * correctSpokenNames — fixes family names that speech recognition mis-hears ("Sherry" for Cherry, "Pravina" for Praveena, "Jazzwee" for
 * Jaswi, "Pra veena" split in two). Compares each word (and pairs of words) with the family's first names by sound and by spelling,
 * and only swaps when the match is close and the word is not an everyday word. Pure code, tested.
 */
const COMMON = new Set(('the this that what when tell today tomorrow tonight ride drive pick up drop off take school home dance class event chore task move change cancel add set for and with from about have has are is was will can you my me we it his her their schedule calendar time morning evening week weekend who where why how please thanks thank okay yes no remind call text send show list get give make need want like done did does not all any some more one two three four five six seven eight nine ten dentist doctor soccer practice lunch dinner breakfast groceries milk pickup dropoff reminder update description title name late early next last first then also just only about after before again').split(' '));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** A rough sound key: similar-sounding spellings collapse to the same letters. */
export function soundKey(word: string): string {
  let w = norm(word);
  if (!w) return '';
  w = w.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/sch/g, 'sk')
    .replace(/ch|sh|tch/g, 'x').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/z/g, 's').replace(/w/g, 'v').replace(/y/g, 'i').replace(/x$/, 'x');
  const first = w[0];
  const rest = w.slice(1).replace(/[aeiouh]/g, '');
  return (first + rest).replace(/(.)\1+/g, '$1');
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}

function close(word: string, name: string): boolean {
  const w = norm(word), n = norm(name);
  if (w.length < 4 || n.length < 4 || w === n) return false;
  const sameSound = soundKey(w) === soundKey(n);
  const nearSpelling = lev(w, n) <= Math.max(2, Math.floor(n.length * 0.34));
  const nearSound = lev(soundKey(w), soundKey(n)) <= 1 && w[0] === n[0];
  return (sameSound && lev(w, n) <= Math.max(3, Math.ceil(n.length * 0.5))) || (nearSpelling && nearSound);
}

/** Returns the transcript with mis-heard family first names replaced by the real ones. */
export function correctSpokenNames(transcript: string, firstNames: string[]): string {
  const names = [...new Set(firstNames.map(n => n.trim()).filter(n => norm(n).length >= 4))];
  if (!names.length || !transcript.trim()) return transcript;
  const tokens = transcript.split(/(\s+)/); // keep spacing
  const words = tokens.map((t, i) => ({ t, i })).filter(x => !/^\s+$/.test(x.t));
  const out = [...tokens];
  const skip = new Set<number>();
  const strip = (t: string) => t.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, '');
  const wrap = (orig: string, fixed: string) => {
    const lead = orig.match(/^[^A-Za-z]*/)?.[0] ?? '', trail = orig.match(/[^A-Za-z']*$/)?.[0] ?? '';
    const possessive = /['’]s$/i.test(strip(orig)) ? "'s" : '';
    return `${lead}${fixed}${possessive}${trail}`;
  };
  for (let k = 0; k < words.length; k++) {
    if (skip.has(k)) continue;
    const a = words[k], bare = strip(a.t).replace(/['’]s$/i, '');
    if (!bare || COMMON.has(bare.toLowerCase())) { /* still try a pair below */ }
    // two words that were one name: "pra veena" -> "Praveena"
    const b = words[k + 1];
    if (b && !COMMON.has(bare.toLowerCase())) {
      const joined = bare + strip(b.t).replace(/['’]s$/i, '');
      const hit = names.find(n => norm(joined) === norm(n) || close(joined, n));
      if (hit && norm(bare).length >= 2) { out[a.i] = wrap(a.t, hit); out[b.i] = ''; skip.add(k + 1); continue; }
    }
    if (!bare || COMMON.has(bare.toLowerCase())) continue;
    if (names.some(n => norm(n) === norm(bare))) { const real = names.find(n => norm(n) === norm(bare))!; out[a.i] = wrap(a.t, real); continue; }
    const hit = names.find(n => close(bare, n));
    if (hit) out[a.i] = wrap(a.t, hit);
  }
  return out.join('').replace(/\s{2,}/g, ' ').trim();
}
