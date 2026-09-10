/**
 * HomeownerNotesTab — parent-only general home maintenance tracker.
 * Replaces the earlier Smart Hub feature end to end (see
 * homeownerNotesStore.ts's own comment on why) — full CRUD: add (via
 * preset library or custom), edit, complete (recurring items roll their
 * due date forward instead of vanishing), delete.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Home, Plus, Check, Trash2, Pencil, LayoutList, LayoutGrid } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useHomeownerNotesStore, type HomeownerNote, type HomeownerNoteCategory } from '@/store/homeownerNotesStore';
import { SCard, CardHeader, EmptyState, StatusPill } from '../shared';
import { AddHomeownerNoteSheet } from './AddHomeownerNoteSheet';
import { EditHomeownerNoteSheet } from './EditHomeownerNoteSheet';
import { CATEGORY_LABEL, CATEGORY_EMOJI } from './maintenancePresets';
import { fmtDateDisplay } from '../health/types';
import { showAlert } from '@/components/AppAlert';

const CATEGORY_ORDER: HomeownerNoteCategory[] = ['hvac', 'plumbing', 'electrical', 'appliance', 'exterior', 'safety', 'warranty', 'general'];

// due_date is stored as a YYYY-MM-DD string; parsed as LOCAL midnight
// (matching ScanDateField/fmtDate's own convention) since a plain
// `new Date(str)` parses YYYY-MM-DD as UTC midnight, which can silently
// land on the previous day in a negative-UTC-offset timezone.
function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

function isOverdue(note: HomeownerNote): boolean {
  if (note.completedAt || !note.dueDate) return false;
  return new Date(note.dueDate) < new Date(new Date().toDateString());
}

function isDueSoon(note: HomeownerNote): boolean {
  if (note.completedAt || !note.dueDate) return false;
  const due = new Date(note.dueDate).getTime();
  const now = Date.now();
  return due >= now && due - now <= 7 * 24 * 3600_000;
}

export default function HomeownerNotesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';
  const isParent = activeMember?.role === 'parent';

  const { notes, isLoading, loadNotes, addNote, completeNote, deleteNote } = useHomeownerNotesStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editNote, setEditNote] = useState<HomeownerNote | null>(null);
  const [groupByCategory, setGroupByCategory] = useState(false);

  useEffect(() => {
    if (familyId) loadNotes(familyId);
  }, [familyId]);

  const active = useMemo(() => notes.filter(n => !n.completedAt).sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }), [notes]);
  const done = notes.filter(n => n.completedAt && !n.recurEveryDays);

  const grouped = useMemo(() => CATEGORY_ORDER
    .map(cat => ({ category: cat, items: active.filter(n => n.category === cat) }))
    .filter(g => g.items.length > 0), [active]);

  if (!isParent) {
    return (
      <EmptyState Icon={Home} label="Home maintenance is managed by a parent." colors={colors} />
    );
  }

  const onDelete = (note: HomeownerNote) => {
    showAlert('Delete this reminder?', note.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
    ]);
  };

  const renderRow = (note: HomeownerNote) => {
    const overdue = isOverdue(note);
    const dueSoon = isDueSoon(note);
    return (
      <View key={note.id} style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
      }}>
        <TouchableOpacity onPress={() => completeNote(note.id)} hitSlop={8} style={{ marginTop: 2 }}>
          <View style={{
            width: 22, height: 22, borderRadius: 11, borderWidth: 2,
            borderColor: overdue ? colors.danger : colors.teal,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={12} color="transparent" />
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{note.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {!groupByCategory && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                {CATEGORY_EMOJI[note.category]} {CATEGORY_LABEL[note.category]}
              </Text>
            )}
            {note.dueDate && (
              <StatusPill
                label={overdue ? `Overdue · ${fmtDateDisplay(parseLocalDateStr(note.dueDate))}` : `Due ${fmtDateDisplay(parseLocalDateStr(note.dueDate))}`}
                color={overdue ? colors.danger : dueSoon ? colors.amber : colors.textTertiary}
              />
            )}
            {note.recurEveryDays && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>· every {note.recurEveryDays}d</Text>
            )}
            {note.priority === 'high' && (
              <StatusPill label="High priority" color={colors.danger} />
            )}
            {note.room && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>· {note.room}</Text>
            )}
          </View>
          {note.notes ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>{note.notes}</Text>
          ) : null}
          {(note.vendorName || note.serialNumber || note.warrantyExpiresDate) && (
            <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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

        <TouchableOpacity onPress={() => setEditNote(note)} hitSlop={8} style={{ padding: 4 }}>
          <Pencil size={16} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(note)} hitSlop={8} style={{ padding: 4 }}>
          <Trash2 size={16} color={colors.danger} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140, gap: 14 }}>
      <SCard colors={colors} isDark={isDark} accent={colors.teal}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardHeader
            Icon={Home} iconColor={colors.teal} title="Home Maintenance" colors={colors}
            badge={active.length ? String(active.length) : undefined} badgeColor={colors.teal}
            onAction={() => setShowAdd(true)} actionLabel="Add"
          />
        </View>
        {active.length > 0 && (
          <TouchableOpacity
            onPress={() => setGroupByCategory(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 4 }}
          >
            {groupByCategory ? <LayoutList size={14} color={colors.teal} /> : <LayoutGrid size={14} color={colors.teal} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>
              {groupByCategory ? 'List by date' : 'Group by category'}
            </Text>
          </TouchableOpacity>
        )}

        {isLoading && notes.length === 0 && (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 16 }} />
        )}

        {!isLoading && active.length === 0 && (
          <EmptyState Icon={Home} label="No maintenance reminders yet — tap + Add to get started." colors={colors} />
        )}

        {!groupByCategory && active.map(renderRow)}

        {groupByCategory && grouped.map(g => (
          <View key={g.category} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary,
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
              {CATEGORY_EMOJI[g.category]} {CATEGORY_LABEL[g.category]}
            </Text>
            {g.items.map(renderRow)}
          </View>
        ))}
      </SCard>

      {done.length > 0 && (
        <SCard colors={colors} isDark={isDark}>
          <CardHeader Icon={Check} iconColor={colors.textTertiary} title="Completed" colors={colors} />
          {done.map(note => (
            <View key={note.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
            }}>
              <Check size={16} color={colors.teal} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary, textDecorationLine: 'line-through' }}>
                {note.title}
              </Text>
              <TouchableOpacity onPress={() => onDelete(note)} hitSlop={8}>
                <Trash2 size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </SCard>
      )}

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
    </ScrollView>
  );
}
