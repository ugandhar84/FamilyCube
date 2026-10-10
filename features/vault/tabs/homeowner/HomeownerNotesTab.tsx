import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Pressable } from 'react-native';
import { Home, Wrench, Shield, Zap, Droplets, Package, TreePine, ChevronRight, Plus } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useHomeownerNotesStore, type HomeownerNote, type HomeownerNoteCategory } from '@/store/homeownerNotesStore';
import { CATEGORY_LABEL } from './maintenancePresets';

const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';

const CATEGORY_ICON: Record<HomeownerNoteCategory, any> = {
  hvac: Wrench, plumbing: Droplets, electrical: Zap, appliance: Package,
  exterior: TreePine, safety: Shield, warranty: Shield, general: Home,
};

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
  const CatIcon = CATEGORY_ICON[note.category] ?? Home;

  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : BORDER }}>
      {/* Title row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: isDark ? colors.surface : SURFACE,
          alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 }}>
          <CatIcon size={14} color={overdue ? colors.danger : colors.teal} strokeWidth={2} />
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
  const viewerNames = members.filter(m => m.id !== activeMemberId).map(m => m.name.split(' ')[0]).join(' and ');

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Context line */}
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
          <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : BODY_CLR, lineHeight: 18 }}>
            {today}{viewerNames ? ` · ${viewerNames} can view permitted house notes. Only ${activeMember?.name?.split(' ')[0] ?? 'you'} edits homeowner instructions.` : ''}
          </Text>
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
              {freeNotes.map(note => (
                <TouchableOpacity key={note.id} onPress={() => onOpenNote(note)}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : BORDER }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8,
                      backgroundColor: isDark ? colors.surface : SURFACE,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Home size={14} color={colors.teal} strokeWidth={2} />
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
              ))}
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
