import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Pressable } from 'react-native';
import {
  Home, Thermometer, ShieldAlert, ScrollText, Zap, Droplets, Refrigerator, TreePine, ChevronRight, Plus,
  RotateCw, Wind, Flame, Bug, Wrench, Paintbrush, Trash2, Filter, Sparkles, AlertTriangle,
} from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useHomeownerNotesStore, type HomeownerNote, type HomeownerNoteCategory } from '@/store/homeownerNotesStore';
import { CATEGORY_LABEL } from './maintenancePresets';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — see
// features/vault/tabs/SchoolHomeScreen.tsx's own comment for the full
// rationale.
const CANVAS = '#ECE6DE';
const TITLE_CLR = '#0D1210';
const BODY_CLR = '#3D4D47';
const BODY_CLR_LIGHT = '#4E5C56';
const BLUE = '#3B5FE4';
const BORDER = '#DDD6CC';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F0EDE6';
const CARD_SHADOW = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;

// One distinct, relevant icon per task category — was Wrench for HVAC
// (reads as generic repair, not climate control) and Shield for BOTH
// safety and warranty (identical icon, no visual distinction between the
// two) [live-requested: "use the icons for the tasks in home care
// relevant to them"].
const CATEGORY_ICON: Record<HomeownerNoteCategory, any> = {
  hvac: Thermometer, plumbing: Droplets, electrical: Zap, appliance: Refrigerator,
  exterior: TreePine, safety: ShieldAlert, warranty: ScrollText, general: Home,
};

// Per-category pastel tint for the icon chip background — matches the
// mockup's colored-chip-per-task-type look instead of one flat teal tint
// for every row regardless of category.
const CATEGORY_TINT: Record<HomeownerNoteCategory, { bg: string; bgDark: string; fg: string }> = {
  hvac:       { bg: '#FBE4D8', bgDark: '#3A2A20', fg: '#B5560C' },
  plumbing:   { bg: '#DDEBF5', bgDark: '#1E2E3A', fg: '#2B6CA3' },
  electrical: { bg: '#F5EBD0', bgDark: '#3A3420', fg: '#9A7A0C' },
  appliance:  { bg: '#E6E0F5', bgDark: '#2A2538', fg: '#6B4FA0' },
  exterior:   { bg: '#DCEEDD', bgDark: '#1E3324', fg: '#2F7A3E' },
  safety:     { bg: '#E6E4EC', bgDark: '#2A2838', fg: '#5B5680' },
  warranty:   { bg: '#F0E6DC', bgDark: '#332A20', fg: '#8A6440' },
  general:    { bg: '#DCEEE0', bgDark: '#1E3324', fg: '#3D7A52' },
};

// Keyword-matched icon per TASK (not just category) — a task's title
// often implies something more specific than its broad category bucket
// (e.g. "Rotate/replace mattress" is Appliance-ish but really means
// "rotate," "Test smoke detector" is Safety but really means "alert
// test") [live-requested: "i was asking the icon based on the task"].
// Falls back to CATEGORY_ICON when no keyword matches.
const TASK_ICON_RULES: [RegExp, any][] = [
  [/rotate|replace.*filter|filter.*replace/i, RotateCw],
  [/clean|declutter|dust|wash|vacuum/i, Sparkles],
  [/gutter|downspout|drain/i, Wind],
  [/smoke|alarm|detector|fire extinguisher|carbon monoxide/i, AlertTriangle],
  [/pest|termite|rodent|bug/i, Bug],
  [/paint|stain|caulk|seal/i, Paintbrush],
  [/trash|garbage|dispose|declutter/i, Trash2],
  [/water filter|air filter|hvac filter/i, Filter],
  [/fireplace|chimney/i, Flame],
  [/fix|repair|tighten|loose/i, Wrench],
];

function taskIconFor(note: HomeownerNote): any {
  for (const [pattern, Icon] of TASK_ICON_RULES) {
    if (pattern.test(note.title)) return Icon;
  }
  return CATEGORY_ICON[note.category] ?? Home;
}

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

function fmtDisplay(s: string): string {
  const d = parseLocalDateStr(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function intervalLabel(days: number): string {
  if (days === 7) return 'every week';
  if (days === 14) return 'every 2 weeks';
  if (days === 30) return 'every month';
  if (days === 90) return 'every 3 months';
  if (days === 180) return 'every 6 months';
  if (days === 365) return 'every year';
  return `every ${days} days`;
}

function isOverdue(note: HomeownerNote): boolean {
  if (note.completedAt || !note.dueDate) return false;
  return parseLocalDateStr(note.dueDate) < new Date(new Date().toDateString());
}

function isDueSoon(note: HomeownerNote): boolean {
  if (note.completedAt || !note.dueDate) return false;
  const due = parseLocalDateStr(note.dueDate).getTime();
  const now = Date.now();
  return due >= now && due - now <= 7 * 24 * 3600_000;
}

function isThisWeek(note: HomeownerNote): boolean {
  if (!note.dueDate) return false;
  const due = parseLocalDateStr(note.dueDate).getTime();
  const now = Date.now();
  return due >= now - 24 * 3600_000 && due <= now + 7 * 24 * 3600_000;
}

function NoteRow({ note, members, colors, isDark, onTap }: {
  note: HomeownerNote; members: any[]; colors: any; isDark: boolean;
  onTap: () => void;
}) {
  const overdue = isOverdue(note);
  const dueSoon = isDueSoon(note);
  const creator = members.find(m => m.id === note.createdBy);
  const TaskIcon = taskIconFor(note);
  const tint = CATEGORY_TINT[note.category] ?? CATEGORY_TINT.general;

  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : BORDER }}>
      {/* Title row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10,
          backgroundColor: overdue ? (isDark ? colors.dangerLight : '#F9DEDC') : (isDark ? tint.bgDark : tint.bg),
          alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 }}>
          <TaskIcon size={16} color={overdue ? colors.danger : (isDark ? '#FFFFFF' : tint.fg)} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : TITLE_CLR, lineHeight: 20 }}>
            {note.title}
            {note.category !== 'general' ? ` · ${CATEGORY_LABEL[note.category]}` : ''}
          </Text>

          {/* Sub-line: due date */}
          {note.dueDate && (
            <Text style={{ fontSize: 12, color: overdue ? colors.danger : dueSoon ? colors.amber : (isDark ? colors.textSecondary : BODY_CLR), marginTop: 2 }}>
              {overdue ? `Overdue · ` : `Due `}{fmtDisplay(note.dueDate)}
              {note.recurEveryDays ? ` · suggested ${intervalLabel(note.recurEveryDays)}` : ''}
            </Text>
          )}

          {/* Notes preview */}
          {note.notes ? (
            <Text numberOfLines={1} style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR, marginTop: 1 }}>
              {note.notes}
            </Text>
          ) : null}

          {/* Creator */}
          {creator ? (
            <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR, marginTop: 1 }}>
              {creator.name} attending
            </Text>
          ) : null}

          {/* Action links */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
            <TouchableOpacity onPress={onTap}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>
                {overdue || dueSoon ? 'View or mark done →' : 'Open note →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

type FilterTab = 'all' | 'due_soon' | 'notes';

export default function HomeownerNotesTab({ colors, isDark, onAdd, onOpenNote, onOpenDocuments }: {
  colors: any; isDark: boolean;
  onAdd: () => void;
  onOpenNote: (note: HomeownerNote) => void;
  onOpenDocuments: () => void;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';
  const isParent = activeMember?.role === 'parent';

  const { notes, isLoading, loadNotes } = useHomeownerNotesStore();
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  useEffect(() => {
    if (familyId) loadNotes(familyId);
  }, [familyId]);

  const active = useMemo(() => notes.filter(n => !n.completedAt).sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }), [notes]);

  const freeNotes = useMemo(() => notes.filter(n => !n.completedAt && !n.dueDate), [notes]);

  const thisWeek = useMemo(() => active.filter(isThisWeek), [active]);
  const dueSoon = useMemo(() => active.filter(isDueSoon), [active]);

  const displayed = useMemo(() => {
    if (filterTab === 'due_soon') return dueSoon;
    if (filterTab === 'notes') return freeNotes;
    return active;
  }, [filterTab, active, dueSoon, freeNotes]);

  const canvas = isDark ? colors.background : CANVAS;

  if (!isParent) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: canvas }}>
        <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: isDark ? colors.surface : SURFACE,
          alignItems: 'center', justifyContent: 'center' }}>
          <Home size={28} color={colors.teal} strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 15, color: isDark ? colors.textSecondary : BODY_CLR, textAlign: 'center' }}>
          Home maintenance is managed by a parent.
        </Text>
      </View>
    );
  }

  // Context line: today's date + who can view
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const otherMembers = members.filter(m => m.id !== activeMemberId);
  // "Shared with: Name, Name + N" — compact format, not the old long
  // sentence-style context line [live-requested: shown a mockup with this
  // exact "Shared with: Praveena, Jaswi + 2" layout above the filter tabs].
  const sharedWithLabel = (() => {
    if (otherMembers.length === 0) return null;
    const firstNames = otherMembers.map(m => m.name.split(' ')[0]);
    if (firstNames.length <= 2) return `Shared with: ${firstNames.join(', ')}`;
    return `Shared with: ${firstNames.slice(0, 2).join(', ')} + ${firstNames.length - 2}`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Context line */}
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 3 }}>
          <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : BODY_CLR, lineHeight: 18 }}>
            {today}
          </Text>
          {sharedWithLabel && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? colors.textPrimary : TITLE_CLR, lineHeight: 18 }}>
              {sharedWithLabel}
            </Text>
          )}
        </View>

        {/* Filter tabs */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 }}>
          {([['all', 'All'], ['due_soon', 'Due soon'], ['notes', 'Notes']] as [FilterTab, string][]).map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setFilterTab(key)}
              style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                backgroundColor: filterTab === key ? (isDark ? colors.teal : TITLE_CLR) : (isDark ? colors.surface : SURFACE),
                borderWidth: filterTab === key ? 0 : 1,
                borderColor: isDark ? colors.border : BORDER }}>
              <Text style={{ fontSize: 13, fontWeight: '600',
                color: filterTab === key ? '#FFFFFF' : (isDark ? colors.textSecondary : BODY_CLR) }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Add button */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <TouchableOpacity onPress={onAdd}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: BLUE, flexDirection: 'row', gap: 8 }}>
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Add task or note</Text>
          </TouchableOpacity>
        </View>

        {isLoading && notes.length === 0 && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.teal} />
          </View>
        )}

        {/* This week section */}
        {filterTab === 'all' && thisWeek.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : TITLE_CLR,
              paddingHorizontal: 20, marginBottom: 4 }}>This week</Text>
            <View style={{ paddingHorizontal: 20 }}>
              {thisWeek.map(note => (
                <NoteRow key={note.id} note={note} members={members} colors={colors} isDark={isDark}
                  onTap={() => onOpenNote(note)} />
              ))}
            </View>
          </View>
        )}

        {/* Remaining / filtered list */}
        {displayed.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            {filterTab !== 'all' && (
              <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : TITLE_CLR,
                paddingHorizontal: 20, marginBottom: 4 }}>
                {filterTab === 'due_soon' ? 'Due soon' : 'Notes'}
              </Text>
            )}
            <View style={{ paddingHorizontal: 20 }}>
              {(filterTab === 'all' ? displayed.filter(n => !isThisWeek(n)) : displayed).map(note => (
                <NoteRow key={note.id} note={note} members={members} colors={colors} isDark={isDark}
                  onTap={() => onOpenNote(note)} />
              ))}
            </View>
          </View>
        )}

        {!isLoading && active.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: isDark ? colors.surface : SURFACE,
              alignItems: 'center', justifyContent: 'center' }}>
              <Home size={24} color={colors.teal} strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : TITLE_CLR }}>All caught up</Text>
            <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : BODY_CLR, textAlign: 'center' }}>
              No maintenance reminders yet — tap above to add your first one.
            </Text>
          </View>
        )}

        {/* Useful notes section — notes without due dates */}
        {filterTab === 'all' && freeNotes.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : TITLE_CLR,
              paddingHorizontal: 20, marginBottom: 4 }}>Useful notes</Text>
            <View style={{ paddingHorizontal: 20 }}>
              {freeNotes.map(note => {
                const FreeNoteIcon = taskIconFor(note);
                const freeTint = CATEGORY_TINT[note.category] ?? CATEGORY_TINT.general;
                return (
                <TouchableOpacity key={note.id} onPress={() => onOpenNote(note)}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : BORDER }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10,
                      backgroundColor: isDark ? freeTint.bgDark : freeTint.bg,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FreeNoteIcon size={16} color={isDark ? '#FFFFFF' : freeTint.fg} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? colors.textPrimary : TITLE_CLR }}>
                        {note.title}
                      </Text>
                      {note.notes ? (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR, marginTop: 1 }}>
                          {note.notes}
                        </Text>
                      ) : null}
                      {note.updatedAt && (
                        <Text style={{ fontSize: 12, color: isDark ? colors.textTertiary : BODY_CLR, marginTop: 1 }}>
                          Last updated {members.find(m => m.id === note.createdBy)?.name?.split(' ')[0] ?? ''} · {fmtDisplay(note.updatedAt.slice(0, 10))}
                        </Text>
                      )}
                      <TouchableOpacity onPress={() => onOpenNote(note)} style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View note →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* House documents link */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <TouchableOpacity onPress={onOpenDocuments}
            style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : BORDER }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? colors.textPrimary : TITLE_CLR }}>House documents</Text>
            <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR, marginTop: 1 }}>
              Insurance, deeds, manuals and warranty cards
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE, marginTop: 4 }}>Open house documents →</Text>
          </TouchableOpacity>
        </View>

        {/* Disclaimer */}
        <View style={{ marginHorizontal: 20, marginBottom: 24, padding: 14, borderRadius: 14,
          backgroundColor: isDark ? colors.surface : '#EEF3E8' }}>
          <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#4A6741', lineHeight: 17 }}>
            Preset intervals are suggestions, not safety instructions. Adapt every reminder to the manufacturer's requirements and qualified professional advice.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}
