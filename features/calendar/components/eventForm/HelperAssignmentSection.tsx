import { TextInput } from 'react-native';
import MemberPicker from './MemberPicker';
import { f } from './styles';
import { EventCategory } from './types';

// ─── Helper assignment (parent/senior only) ────────────────────────────────
// Kid's own ride request now lives entirely in KidRideSection, rendered
// directly under its own "Ride needed?" toggle above Date & Time — this
// component is parent/senior only: adult MemberPicker + free-text fallback
// name entry for an external helper (coach, escort, etc).
export default function HelperAssignmentSection({
  category, catColor, colors, isDark, siblings, adults,
  helperId, handleHelperSelect, helperName, setHelperName, setHelperId,
}: {
  category: EventCategory; catColor: string; colors: any; isDark: boolean; siblings: string[]; adults: any[];
  helperId: string | undefined; handleHelperSelect: (id: string) => void;
  helperName: string; setHelperName: (v: string) => void; setHelperId: (id: string | undefined) => void;
}) {
  return (
    <>
      <MemberPicker
        label={
          category === 'Medical'  ? '🏥 Accompanied by (adult)' :
          category === 'Study'    ? '📚 Or pick a family tutor' :
          category === 'Sports'   ? '🚗 Drop-off by (adult)' :
          category === 'Birthday' ? '🚗 Driven by / accompanying' :
          '🚗 Driven by (adult)'
        }
        selectedIds={helperId ? [helperId] : []}
        members={adults}
        onToggle={(id) => { const m = adults.find((x: any) => x.id === id); console.log(`[UserAction] FORM screen=Schedule selected "${m?.name}" (id=${id}) for helper picker category=${category} on HelperAssignmentSection [features/calendar/components/eventForm/HelperAssignmentSection.tsx:31]`); handleHelperSelect(id); }}
        colors={colors} isDark={isDark} siblings={siblings}
      />
      {/* Manual name entry for external helpers (coaches, escorts, etc.) —
          Study skips this: its dedicated "Tutor name" field above is the
          single source of truth, synced into `helper` at submit time. */}
      {category !== 'Study' && (
        <TextInput
          style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed, marginTop: -8 }]}
          placeholder="Or type name (e.g. Grandma Mary)"
          placeholderTextColor={colors.textTertiary}
          value={helperName}
          onChangeText={t => { setHelperName(t); if (!t) setHelperId(undefined); }}
          onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Helper name" on "HelperAssignmentSection category=${category}" newValue=${helperName} [features/calendar/components/eventForm/HelperAssignmentSection.tsx:43]`)}
        />
      )}
    </>
  );
}
