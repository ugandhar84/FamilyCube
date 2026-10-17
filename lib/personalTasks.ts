/**
 * Personal tasks — a private reminder list for anyone (kid, teen, parent, grandparent). Created by and for the
 * same person, worth no coins, completes with one tap, and is shown only to its owner (see choreAdapter's
 * isPersonalTask). A quick deadline can be chosen when adding one.
 */
import { localDateStr } from '@/lib/dates';
import { useQuestStore } from '@/store/choreAdapter';
import type { FamilyMember } from '@/store/familyStore';

export interface QuickDeadline { key: string; label: string; date?: string; time?: string }

const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); };

/** The quick deadline choices. `date`/`time` are the values stored ("5:00 PM" style is applied when shown). */
export function quickDeadlines(): QuickDeadline[] {
  const hour = new Date().getHours();
  const out: QuickDeadline[] = [{ key: 'none', label: 'No deadline' }, { key: 'today', label: 'Today', date: localDateStr() }];
  if (hour < 17) out.push({ key: 'tonight', label: 'Today 5 PM', date: localDateStr(), time: '17:00' });
  if (hour < 20) out.push({ key: 'evening', label: 'Today 8 PM', date: localDateStr(), time: '20:00' });
  out.push({ key: 'tomorrow', label: 'Tomorrow', date: addDays(1) });
  out.push({ key: 'tomorrow9', label: 'Tomorrow 9 AM', date: addDays(1), time: '09:00' });
  const dow = new Date().getDay();
  const toSat = ((6 - dow + 7) % 7) || 7;
  out.push({ key: 'weekend', label: 'This weekend', date: addDays(toSat) });
  return out;
}

export function addPersonalTask(member: FamilyMember, title: string, deadline?: QuickDeadline): void {
  const t = title.trim();
  if (!t) return;
  useQuestStore.getState().addQuest({
    title: t, coins: 0, xpReward: 0, status: 'todo', isPool: false,
    assignedToId: member.id, createdById: member.id,
    trustedAutoApprove: true, photoRequired: false,
    dueDate: deadline?.date, dueTime: deadline?.time, recurrence: 'once', questType: 'general',
  } as any);
}

/** "Today", "Tomorrow", or "Oct 21", with "· 5:00 PM" when there is a time. */
export function deadlineLabel(dueDate?: string, dueTime?: string): string {
  if (!dueDate) return '';
  const today = localDateStr();
  const d = new Date(dueDate + 'T00:00:00');
  const diff = Math.round((d.getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff < 0 ? 'Overdue' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!dueTime) return day;
  const [h, m] = dueTime.split(':').map(Number);
  return `${day} · ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
