import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { Home, Plus, Check, Trash2, Pencil, LayoutList, LayoutGrid, AlertTriangle, Clock, RefreshCw, Wrench, Shield, Zap, Droplets, Package, TreePine } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useHomeownerNotesStore, type HomeownerNote, type HomeownerNoteCategory } from '@/store/homeownerNotesStore';
import { AddHomeownerNoteSheet } from './AddHomeownerNoteSheet';
import { EditHomeownerNoteSheet } from './EditHomeownerNoteSheet';
import { CompleteNoteSheet } from './CompleteNoteSheet';
import { CATEGORY_LABEL, CATEGORY_EMOJI } from './maintenancePresets';
import { fmtDateDisplay } from '../health/types';
import { showAlert } from '@/components/AppAlert';

const PAGE_BG = '#F3F5F2';

const CATEGORY_ORDER: HomeownerNoteCategory[] = ['hvac', 'plumbing', 'electrical', 'appliance', 'exterior', 'safety', 'warranty', 'general'];

const CATEGORY_ICON: Record<HomeownerNoteCategory, any> = {
  hvac: Wrench, plumbing: Droplets, electrical: Zap, appliance: Package,
  exterior: TreePine, safety: Shield, warranty: Shield, general: Home,
};

const CATEGORY_COLOR: Record<string, string> = {
  hvac: '#3D7A5A', plumbing: '#2C6FAC', electrical: '#D97706',
  appliance: '#7B5EA7', exterior: '#3D7A5A', safety: '#C54A27',
  warranty: '#6B5F52', general: '#DF613C',
};

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
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

function StatPill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: bg, gap: 2 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color, lineHeight: 26 }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', color, opacity: 0.75, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function NoteCard({ note, colors, isDark, groupByCategory, onComplete, onEdit, onDelete }: {
  note: HomeownerNote; colors: any; isDark: boolean; groupByCategory: boolean;
  onComplete: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const overdue = isOverdue(note);
  const dueSoon = isDueSoon(note);
  const completable = !note.dueDate || dueSoon || overdue;
  const catColor = CATEGORY_COLOR[note.category] ?? colors.teal;
  const CatIcon = CATEGORY_ICON[note.category] ?? Home;

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 18,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: overdue ? colors.danger + '40' : isDark ? colors.border : 'rgba(61,122,90,0.12)',
      shadowColor: colors.navy,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 10,
      overflow: 'hidden',
    }}>
      {/* accent bar */}
      <View style={{ height: 3, backgroundColor: overdue ? colors.danger : catColor }} />

      <View style={{ padding: 14, gap: 10 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          {/* complete button */}
          <TouchableOpacity
            onPress={() => completable && onComplete()}
            disabled={!completable}
            hitSlop={8}
            style={{ marginTop: 1, opacity: completable ? 1 : 0.3 }}
          >
            <View style={{
              width: 26, height: 26, borderRadius: 13, borderWidth: 2,
              borderColor: overdue ? colors.danger : colors.teal,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: overdue ? colors.danger + '12' : colors.tealLight,
            }}>
              <Check size={13} color={overdue ? colors.danger : colors.teal} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 }}>{note.title}</Text>
            {note.notes ? (
              <Text numberOfLines={2} style={{ fontSize: 12, color: colors.textSecondary }}>{note.notes}</Text>
            ) : null}
          </View>

          {/* action buttons */}
          <TouchableOpacity onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
            <Pencil size={15} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={{ padding: 4 }}>
            <Trash2 size={15} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {/* Tags row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {!groupByCategory && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
              backgroundColor: catColor + '18' }}>
              <CatIcon size={11} color={catColor} strokeWidth={2.5} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: catColor }}>{CATEGORY_LABEL[note.category]}</Text>
            </View>
          )}

          {note.dueDate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
              backgroundColor: overdue ? colors.danger + '18' : dueSoon ? colors.amber + '18' : colors.surface }}>
              {overdue ? <AlertTriangle size={11} color={colors.danger} strokeWidth={2.5} /> :
               <Clock size={11} color={dueSoon ? colors.amber : colors.textTertiary} strokeWidth={2.5} />}
              <Text style={{ fontSize: 11, fontWeight: '600',
                color: overdue ? colors.danger : dueSoon ? colors.amber : colors.textTertiary }}>
                {overdue ? `Overdue · ` : `Due `}{fmtDateDisplay(parseLocalDateStr(note.dueDate))}
              </Text>
            </View>
          )}

          {note.recurEveryDays && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.tealLight }}>
              <RefreshCw size={11} color={colors.teal} strokeWidth={2.5} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>Every {note.recurEveryDays}d</Text>
            </View>
          )}

          {note.priority === 'high' && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.danger + '18' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>High priority</Text>
            </View>
          )}

          {note.room && (
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>· {note.room}</Text>
          )}
        </View>

        {/* Vendor/warranty footer */}
        {(note.vendorName || note.serialNumber || note.warrantyExpiresDate) && (
          <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border,
            flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {note.vendorName && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                📞 {note.vendorName}{note.vendorPhone ? ` · ${note.vendorPhone}` : ''}
              </Text>
            )}
            {note.serialNumber && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>S/N: {note.serialNumber}</Text>
            )}
            {note.warrantyExpiresDate && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                Warranty until {fmtDateDisplay(parseLocalDateStr(note.warrantyExpiresDate))}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function HomeownerNotesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';
  const isParent = activeMember?.role === 'parent';

  const { notes, isLoading, loadNotes, addNote, completeNote, deleteNote } = useHomeownerNotesStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editNote, setEditNote] = useState<HomeownerNote | null>(null);
  const [completingNote, setCompletingNote] = useState<HomeownerNote | null>(null);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [activeCategory, setActiveCategory] = useState<HomeownerNoteCategory | 'all'>('all');

  useEffect(() => {
    if (familyId) loadNotes(familyId);
  }, [familyId]);

  const active = useMemo(() => notes.filter(n => !n.completedAt).sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }), [notes]);
  const done = notes.filter(n => n.completedAt && !n.recurEveryDays);

  const overdueCount = active.filter(isOverdue).length;
  const dueSoonCount = active.filter(isDueSoon).length;
  const highPriorityCount = active.filter(n => n.priority === 'high').length;

  const categoriesWithItems = useMemo(() =>
    CATEGORY_ORDER.filter(cat => active.some(n => n.category === cat)), [active]);

  const filtered = useMemo(() => {
    const base = activeCategory === 'all' ? active : active.filter(n => n.category === activeCategory);
    return base;
  }, [active, activeCategory]);

  const grouped = useMemo(() => CATEGORY_ORDER
    .map(cat => ({ category: cat, items: filtered.filter(n => n.category === cat) }))
    .filter(g => g.items.length > 0), [filtered]);

  if (!isParent) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: colors.tealLight,
          alignItems: 'center', justifyContent: 'center' }}>
          <Home size={28} color={colors.teal} strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center' }}>
          Home maintenance is managed by a parent.
        </Text>
      </View>
    );
  }

  const onDelete = (note: HomeownerNote) => {
    showAlert('Delete this reminder?', note.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 4, gap: 16 }}>

        {/* ── Stats strip ── */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatPill label="Open" value={active.length} color={colors.teal} bg={colors.tealLight} />
          <StatPill label="Overdue" value={overdueCount}
            color={overdueCount > 0 ? colors.danger : colors.textTertiary}
            bg={overdueCount > 0 ? colors.danger + '18' : colors.surface} />
          <StatPill label="Due soon" value={dueSoonCount}
            color={dueSoonCount > 0 ? colors.amber : colors.textTertiary}
            bg={dueSoonCount > 0 ? colors.amberLight : colors.surface} />
          <StatPill label="Done" value={done.length} color={colors.textTertiary} bg={colors.surface} />
        </View>

        {/* ── Add button ── */}
        <Pressable onPress={() => setShowAdd(true)} style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 8, paddingVertical: 14, borderRadius: 18,
          backgroundColor: colors.teal,
          opacity: pressed ? 0.85 : 1,
          shadowColor: colors.teal,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
        })}>
          <Plus size={18} color="#fff" strokeWidth={2.5} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Add Maintenance Task</Text>
        </Pressable>

        {isLoading && notes.length === 0 && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.teal} />
          </View>
        )}

        {!isLoading && active.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: colors.tealLight,
              alignItems: 'center', justifyContent: 'center' }}>
              <Home size={28} color={colors.teal} strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>All caught up!</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
              No maintenance reminders yet — tap above to add your first one.
            </Text>
          </View>
        )}

        {active.length > 0 && (
          <View style={{ gap: 10 }}>
            {/* Category filter pills */}
            {categoriesWithItems.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                <TouchableOpacity
                  onPress={() => setActiveCategory('all')}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: activeCategory === 'all' ? colors.teal : colors.card,
                    borderWidth: 1, borderColor: activeCategory === 'all' ? colors.teal : colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '700',
                    color: activeCategory === 'all' ? '#fff' : colors.textSecondary }}>All</Text>
                </TouchableOpacity>
                {categoriesWithItems.map(cat => {
                  const selected = activeCategory === cat;
                  const catColor = CATEGORY_COLOR[cat] ?? colors.teal;
                  return (
                    <TouchableOpacity key={cat}
                      onPress={() => setActiveCategory(cat)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: selected ? catColor : colors.card,
                        borderWidth: 1, borderColor: selected ? catColor : colors.border }}>
                      <Text style={{ fontSize: 12 }}>{CATEGORY_EMOJI[cat]}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: selected ? '#fff' : colors.textSecondary }}>{CATEGORY_LABEL[cat]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Sort toggle */}
            <TouchableOpacity
              onPress={() => setGroupByCategory(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }}>
              {groupByCategory
                ? <LayoutList size={14} color={colors.teal} />
                : <LayoutGrid size={14} color={colors.teal} />}
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>
                {groupByCategory ? 'Sort by date' : 'Group by category'}
              </Text>
            </TouchableOpacity>

            {/* Cards */}
            {!groupByCategory && filtered.map(note => (
              <NoteCard key={note.id} note={note} colors={colors} isDark={isDark}
                groupByCategory={false}
                onComplete={() => setCompletingNote(note)}
                onEdit={() => setEditNote(note)}
                onDelete={() => onDelete(note)} />
            ))}

            {groupByCategory && grouped.map(g => {
              const catColor = CATEGORY_COLOR[g.category] ?? colors.teal;
              return (
                <View key={g.category}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Text style={{ fontSize: 14 }}>{CATEGORY_EMOJI[g.category]}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: catColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {CATEGORY_LABEL[g.category]}
                    </Text>
                    <View style={{ height: 1, flex: 1, backgroundColor: catColor + '30' }} />
                  </View>
                  {g.items.map(note => (
                    <NoteCard key={note.id} note={note} colors={colors} isDark={isDark}
                      groupByCategory
                      onComplete={() => setCompletingNote(note)}
                      onEdit={() => setEditNote(note)}
                      onDelete={() => onDelete(note)} />
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Completed ── */}
        {done.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textTertiary,
              textTransform: 'uppercase', letterSpacing: 0.5 }}>Completed</Text>
            {done.map(note => (
              <View key={note.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 14, paddingVertical: 12,
                backgroundColor: colors.card, borderRadius: 14,
                borderWidth: 1, borderColor: colors.border,
              }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.tealLight,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={13} color={colors.teal} strokeWidth={2.5} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary, textDecorationLine: 'line-through' }}>
                  {note.title}
                </Text>
                <TouchableOpacity onPress={() => onDelete(note)} hitSlop={8}>
                  <Trash2 size={15} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <AddHomeownerNoteSheet
        visible={showAdd}
        colors={colors}
        isDark={isDark}
        onClose={() => setShowAdd(false)}
        onSave={async (params) => {
          if (!activeMemberId) return;
          const { error } = await addNote({ familyId, createdBy: activeMemberId, ...params });
          if (error) showAlert('Could not save', error);
        }}
      />

      {editNote && (
        <EditHomeownerNoteSheet
          visible
          note={editNote}
          colors={colors}
          isDark={isDark}
          onClose={() => setEditNote(null)}
        />
      )}

      <CompleteNoteSheet
        visible={!!completingNote}
        note={completingNote}
        colors={colors}
        onClose={() => setCompletingNote(null)}
        onConfirm={async (comment) => {
          if (!completingNote) return;
          const { error } = await completeNote(completingNote.id, comment);
          setCompletingNote(null);
          if (error) showAlert('Could not complete', error);
        }}
      />
    </View>
  );
}
