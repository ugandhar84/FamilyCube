import type { FamilyMember } from '@/store/familyStore';

/**
 * The grandparents on the same side of the family as `activeId` (the same linked parent — e.g. both paternal
 * grandparents), including `activeId` itself. They share each other's events and chores. A grandparent with no
 * linked parent, or any other role, is just themself.
 */
export function gpSideMembers(activeId: string | null | undefined, members: FamilyMember[]): FamilyMember[] {
  const me = members.find(m => m.id === activeId);
  if (!me) return [];
  if (me.role !== 'senior' || !me.linkedParentId) return [me];
  return members.filter(m => m.role === 'senior' && m.linkedParentId === me.linkedParentId);
}
