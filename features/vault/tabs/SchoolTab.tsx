/**
 * SchoolTab — now a thin delegate to the new full-page School rebuild
 * (features/vault/tabs/SchoolHomeScreen.tsx). The old bottom-sheet body
 * (SchoolScheduleCard + SchoolScheduleModal) is gone from the PHONE path;
 * those two still live on in features/hub/SchoolScheduleModal.tsx for the
 * kiosk's own School tab (features/kiosk/tabs/KioskSchoolTab.tsx /
 * KioskSchoolScheduleModal.tsx), which is untouched by this rebuild — do
 * not delete that file.
 *
 * Keeps this tab's existing isKid/isTeen (own-schedule-only) vs parent
 * (sees all kids) gating by forwarding it straight through — SchoolHomeScreen
 * owns the actual kid-filtering logic now, but the gate itself still comes
 * from here, same prop contract every caller (mobile SchoolScreen.tsx) relies on.
 */
import SchoolHomeScreen from './SchoolHomeScreen';

export default function SchoolTab({ colors, isDark, isKid, isTeen }: {
  colors: any; isDark: boolean; isKid: boolean;
  /** Widened alongside isKid — a teen sees the same own-schedule-only view
   *  a kid gets, not the parent's whole-family list [live-requested: "it
   *  should be for both kids and teens - school schedule"]. Optional so
   *  every existing caller (mobile SchoolScreen.tsx included) that never
   *  passes it keeps its exact prior behavior. */
  isTeen?: boolean;
  /** Kiosk-only props from the old bottom-sheet body are gone — the kiosk
   *  has its own separate School tab (KioskSchoolTab.tsx) that never
   *  rendered through this component, so nothing else needs these. */
  onEditModalVisibilityChange?: (open: boolean) => void;
  renderEditModal?: (props: { visible: boolean; onClose: () => void; memberId: string; memberName: string; isParent: boolean }) => import('react').ReactNode;
}) {
  return <SchoolHomeScreen colors={colors} isDark={isDark} isKid={isKid} isTeen={isTeen} />;
}
