import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Wrench, Shield, Zap, Droplets, Package, TreePine, Pencil, CheckCircle2 } from 'lucide-react-native';
import FullPageOverlay from '@/components/FullPageOverlay';
import { CATEGORY_LABEL } from './maintenancePresets';
import type { HomeownerNote, HomeownerNoteCategory, HomeownerNotePriority } from '@/store/homeownerNotesStore';
import { useFamilyStore } from '@/store/familyStore';

const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';

const CATEGORY_ICON: Record<HomeownerNoteCategory, any> = {
  hvac: Wrench, plumbing: Droplets, electrical: Zap, appliance: Package,
  exterior: TreePine, safety: Shield, warranty: Shield, general: Home,
};

const PRIORITY_LABEL: Record<HomeownerNotePriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };
const REMINDER_LABEL: Record<number, string> = { 1: '1 day before', 2: '2 days before', 7: '1 week before', 15: '15 days before', 30: '1 month before' };

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}
function fmtDisplay(s: string) {
  return parseLocalDateStr(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// Figma section rhythm — pill-style eyebrow heading per group, matching
// the quest form's WHAT/WHEN/WHO/REWARD section pattern (CLAUDE.md rule 8).
function SectionHeading({ label, colors, isDark }: { label: string; colors: any; isDark: boolean }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: isDark ? colors.teal : '#3D7A5A',
      marginTop: 6, marginBottom: 2 }}>
      {label.toUpperCase()}
    </Text>
  );
}

function DetailRow({ label, value, colors, isDark }: { label: string; value: string; colors: any; isDark: boolean }) {
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
      paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, color: titleC, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

export function NoteDetailSheet({ visible, note, colors, isDark, onClose, onEdit, onComplete, zIndex = 60 }: {
  visible: boolean; note: HomeownerNote | null; colors: any; isDark: boolean;
  onClose: () => void; onEdit: () => void; onComplete: () => void; zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const { members } = useFamilyStore();

  if (!note) return null;

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const CatIcon = CATEGORY_ICON[note.category] ?? Home;
  const overdue = isOverdue(note);
  const creator = members.find(m => m.id === note.createdBy);
  const assignee = members.find(m => m.id === note.assignedTo) ?? creator;

  const hasWarrantyInfo = !!(note.serialNumber || note.purchaseDate || note.warrantyExpiresDate || typeof note.costCents === 'number');
  const hasVendorInfo = !!(note.vendorName || note.vendorPhone || note.vendorNotes);

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Home care</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onEdit}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7,
                borderRadius: 10, backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
              <Pencil size={13} color={isDark ? BLUE : LINK_BLUE} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? colors.surface : SURFACE,
              alignItems: 'center', justifyContent: 'center' }}>
              <CatIcon size={18} color={overdue ? colors.danger : colors.teal} strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 26, fontWeight: '700', color: titleC, flex: 1, lineHeight: 32 }}>{note.title}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
              backgroundColor: isDark ? colors.surface : SURFACE }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>{CATEGORY_LABEL[note.category]}</Text>
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
              backgroundColor: isDark ? colors.surface : SURFACE }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>{PRIORITY_LABEL[note.priority] ?? 'Normal'} priority</Text>
            </View>
            {note.completedAt ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
                borderRadius: 8, backgroundColor: isDark ? colors.surface : '#EEF7F0' }}>
                <CheckCircle2 size={12} color="#2D7A4A" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#2D7A4A' }}>Done</Text>
              </View>
            ) : overdue ? (
              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: isDark ? colors.surface : '#FBEAE5' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Overdue</Text>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 48, gap: 10 }}>

          {/* WHAT — title note, room */}
          <SectionHeading label="What" colors={colors} isDark={isDark} />
          {note.notes ? (
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14,
              backgroundColor: isDark ? colors.card : CARD_BG, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Homeowner note</Text>
              <Text style={{ fontSize: 15, color: titleC, lineHeight: 21 }}>{note.notes}</Text>
            </View>
          ) : (
            <DetailRow label="Homeowner note" value="No note added" colors={colors} isDark={isDark} />
          )}
          {note.room ? <DetailRow label="Room / area" value={note.room} colors={colors} isDark={isDark} /> : null}

          {/* WHEN — schedule, reminder, completion */}
          <SectionHeading label="When" colors={colors} isDark={isDark} />
          <DetailRow label="Due date" colors={colors} isDark={isDark}
            value={note.dueDate
              ? `${fmtDisplay(note.dueDate)}${note.recurEveryDays ? ` · ${intervalLabel(note.recurEveryDays)}` : ''}`
              : 'No due date set'} />
          <DetailRow label="Reminder · call alert" colors={colors} isDark={isDark}
            value={note.reminderDaysBefore
              ? (REMINDER_LABEL[note.reminderDaysBefore] ?? `${note.reminderDaysBefore} days before`)
              : 'No reminder set'} />
          {note.completedAt && (
            <DetailRow label="Last done" value={fmtDisplay(note.completedAt.slice(0, 10))} colors={colors} isDark={isDark} />
          )}
          {note.completionNotes ? (
            <DetailRow label="Completion note" value={note.completionNotes} colors={colors} isDark={isDark} />
          ) : null}

          {/* WARRANTY & COST — only when any of those fields are filled */}
          {hasWarrantyInfo && (
            <>
              <SectionHeading label="Warranty & cost" colors={colors} isDark={isDark} />
              {note.serialNumber ? <DetailRow label="Serial / model number" value={note.serialNumber} colors={colors} isDark={isDark} /> : null}
              {note.purchaseDate ? <DetailRow label="Purchase / install date" value={fmtDisplay(note.purchaseDate)} colors={colors} isDark={isDark} /> : null}
              {note.warrantyExpiresDate ? <DetailRow label="Warranty expires" value={fmtDisplay(note.warrantyExpiresDate)} colors={colors} isDark={isDark} /> : null}
              {typeof note.costCents === 'number' ? <DetailRow label="Cost" value={`$${(note.costCents / 100).toFixed(2)}`} colors={colors} isDark={isDark} /> : null}
            </>
          )}

          {/* CONTRACTOR — only when any vendor field is filled */}
          {hasVendorInfo && (
            <>
              <SectionHeading label="Contractor" colors={colors} isDark={isDark} />
              {note.vendorName ? <DetailRow label="Contractor / company" value={note.vendorName} colors={colors} isDark={isDark} /> : null}
              {note.vendorPhone ? <DetailRow label="Contractor phone" value={note.vendorPhone} colors={colors} isDark={isDark} /> : null}
              {note.vendorNotes ? <DetailRow label="Contractor notes" value={note.vendorNotes} colors={colors} isDark={isDark} /> : null}
            </>
          )}

          {/* WHO — assignment, visibility */}
          <SectionHeading label="Who" colors={colors} isDark={isDark} />
          <DetailRow label="Assigned to" value={assignee?.name ?? 'Unassigned'} colors={colors} isDark={isDark} />
          {creator ? <DetailRow label="Created by" value={creator.name} colors={colors} isDark={isDark} /> : null}

          {!note.completedAt && (
            <TouchableOpacity onPress={onComplete}
              style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE, marginTop: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Mark as done</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onEdit}
            style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: border, backgroundColor: isDark ? colors.card : CARD_BG,
              marginTop: note.completedAt ? 8 : 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Edit note</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC }}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </FullPageOverlay>
  );
}
