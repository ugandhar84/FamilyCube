/**
 * relationLabel — how `member` is related to `viewer`, worded from the viewer's side.
 *   a parent sees their in-laws as "Mother-in-law", their own parents as "Your mother", their partner as "Your wife";
 *   a child sees "Mom", "Dad", "Maternal Grandma", "Paternal Grandpa", "Brother";
 *   a grandparent sees "Your son", "Daughter-in-law", "Grandson".
 * Gender comes from the saved relationship word (Mother, Father, Wife, Husband, Son, Daughter, Grandmother ...). When it is not
 * known the label stays neutral ("Your partner", "Your child") rather than guessing.
 */
type M = { id: string; role: string; relationship?: string | null; linkedParentId?: string | null };

const FEMALE = /\b(mother|mom|mum|wife|daughter|grandmother|grandma|sister|aunt|niece|girl)\b/i;
const MALE = /\b(father|dad|husband|son|grandfather|grandpa|brother|uncle|nephew|boy)\b/i;

function gender(m?: M | null): 'f' | 'm' | undefined {
  const r = m?.relationship ?? '';
  if (FEMALE.test(r)) return 'f';
  if (MALE.test(r)) return 'm';
  return undefined;
}
const isParent = (m: M) => m.role === 'parent';
const isGp = (m: M) => m.role === 'senior' || m.role === 'grandparent';
const isKid = (m: M) => m.role === 'kid' || m.role === 'teen' || m.role === 'child' || m.role === 'teenager';

export function relationLabel(viewer: M | undefined, member: M, all: M[]): string | undefined {
  if (!viewer) return undefined;
  if (viewer.id === member.id) return 'You';
  const g = gender(member);
  const byId = (id?: string | null) => all.find(x => x.id === id);

  if (isParent(viewer)) {
    if (isParent(member)) return g === 'f' ? 'Your wife' : g === 'm' ? 'Your husband' : 'Your partner';
    if (isKid(member)) return g === 'f' ? 'Your daughter' : g === 'm' ? 'Your son' : 'Your child';
    if (isGp(member)) {
      const mine = member.linkedParentId === viewer.id;
      if (mine) return g === 'f' ? 'Your mother' : g === 'm' ? 'Your father' : 'Your parent';
      if (member.linkedParentId) return g === 'f' ? 'Mother-in-law' : g === 'm' ? 'Father-in-law' : 'Parent-in-law';
    }
  }

  if (isKid(viewer)) {
    if (isParent(member)) return g === 'f' ? 'Mom' : g === 'm' ? 'Dad' : 'Parent';
    if (isKid(member)) return g === 'f' ? 'Sister' : g === 'm' ? 'Brother' : 'Sibling';
    if (isGp(member)) {
      const via = gender(byId(member.linkedParentId) as M | undefined);
      const side = via === 'f' ? 'Maternal ' : via === 'm' ? 'Paternal ' : '';
      return `${side}${g === 'f' ? 'Grandma' : g === 'm' ? 'Grandpa' : 'Grandparent'}`;
    }
  }

  if (isGp(viewer)) {
    if (isParent(member)) {
      const mine = viewer.linkedParentId === member.id;
      const mg = gender(member);
      if (mine) return mg === 'f' ? 'Your daughter' : mg === 'm' ? 'Your son' : 'Your child';
      return mg === 'f' ? 'Daughter-in-law' : mg === 'm' ? 'Son-in-law' : 'Child-in-law';
    }
    if (isKid(member)) return g === 'f' ? 'Granddaughter' : g === 'm' ? 'Grandson' : 'Grandchild';
  }
  return undefined;
}
