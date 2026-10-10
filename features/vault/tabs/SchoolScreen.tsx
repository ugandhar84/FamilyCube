import { useEffect } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import SchoolTabComp from './SchoolTab';

// hideHeader/onClose are now unused — kept as accepted (never required)
// props so every existing caller (app/(tabs)/school.tsx, FamilyScreen.tsx)
// keeps compiling unchanged. The new School rebuild's own top-level screen
// (SchoolHomeScreen.tsx, rendered via SchoolTabComp below) renders its own
// full Figma header (eyebrow/breadcrumb/title/subtitle) — this screen no
// longer renders a separate PageHeading on top of it, which would have
// stacked two headers.
export default function SchoolScreen({ hideHeader = false, onClose }: { hideHeader?: boolean; onClose?: () => void }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid = activeMember?.role === 'kid';
  const isTeen = activeMember?.role === 'teen';

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      <SchoolTabComp colors={colors} isDark={isDark} isKid={isKid} isTeen={isTeen} />
    </View>
  );
}
