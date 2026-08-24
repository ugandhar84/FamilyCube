/** Capitalise the first letter of every word. Safe on undefined/null. */
export const toTitle = (s?: string | null): string =>
  s ? s.replace(/\b\w/g, c => c.toUpperCase()) : '';

// ── Relational display names ────────────────────────────────────────────────
// Shows "Mom"/"Dad"/"Grandma" instead of a first name wherever the app names
// a family member to someone else in the household — reads as personalized
// rather than a name lookup. Falls back to the first name whenever no
// relational label applies (kids/teens, or a member with no subRole set).

interface RelationMember {
  id: string;
  name: string;
  role: 'parent' | 'kid' | 'teen' | 'senior';
  subRole?: string; // self-declared label, e.g. 'Mom' / 'Dad' / 'Grandma' / 'Grandpa'
}

/**
 * Display label for `member` as seen by anyone in the same family.
 * - parent → their own subRole ("Mom"/"Dad") if set, else first name.
 *   (A parent's relation to the household doesn't vary by viewer — a kid's
 *   mom is "Mom" to every sibling too — so no viewer param is needed here.)
 * - senior → subRole ("Grandma"/"Grandpa") alone, UNLESS a second senior in
 *   `allMembers` shares the same subRole, in which case the first name is
 *   appended ("Grandma Mary") to disambiguate.
 * - kid/teen → always first name; no relational ambiguity to resolve.
 */
export function relationalName(member: RelationMember, allMembers: RelationMember[]): string {
  const firstName = member.name.split(' ')[0];

  if (member.role === 'parent') {
    return member.subRole?.trim() || firstName;
  }

  if (member.role === 'senior') {
    const label = member.subRole?.trim();
    if (!label) return firstName;
    const sharesLabel = allMembers.some(
      m => m.id !== member.id && m.role === 'senior' && m.subRole?.trim() === label
    );
    return sharesLabel ? `${label} ${firstName}` : label;
  }

  return firstName;
}

/** Convenience wrapper for the common case of looking a member up by name
 *  (event.helper, chat sender lookups, etc. store the display name, not an
 *  id) — falls back to the raw name if no matching member is found. */
export function relationalNameByName(name: string | undefined, allMembers: RelationMember[]): string {
  if (!name) return '';
  const member = allMembers.find(m => m.name === name);
  return member ? relationalName(member, allMembers) : name.split(' ')[0];
}

interface DriverLabelMember {
  name: string;
  role: string;
  subRole?: string;
  relationship?: string;
}

/**
 * Display label for a named driver/helper (a free-text field, not a
 * memberId — event.helper/driverName), used specifically for "so-and-so
 * hasn't arrived" style copy where the READER needs to know who's being
 * talked about, not just how the family refers to them casually.
 * - parent → subRole alone ("Dad"/"Mom") — unambiguous, no bracket needed.
 * - anyone else with a relationship or subRole → "Name (Relation)"
 *   ("Raj (Grandpa)", "Priya (Aunt)") — explicit rather than assuming the
 *   reader already knows the relation the way relationalName() does.
 * - no match / no relation info at all → just the first name.
 */
export function driverLabelByName(name: string | undefined, allMembers: DriverLabelMember[]): string | undefined {
  if (!name) return undefined;
  const firstName = name.split(' ')[0];
  const member = allMembers.find(m => m.name === name);
  if (!member) return firstName;
  if (member.role === 'parent') return member.subRole?.trim() || firstName;
  const relation = member.relationship?.trim() || member.subRole?.trim();
  return relation ? `${firstName} (${relation})` : firstName;
}
