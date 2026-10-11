import { useEffect } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import SchoolTabComp from './SchoolTab';

// hideHeader is now unused — kept as an accepted (never required) prop so
// every existing caller (app/(tabs)/school.tsx, FamilyScreen.tsx) keeps
// compiling unchanged. onClose is forwarded down to SchoolHomeScreen.tsx's
// own breadcrumb/title so title-tap plays the same slide-out-right
// animation as Grocery's landing header, instead of vanishing instantly.
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
      <SchoolTabComp colors={colors} isDark={isDark} isKid={isKid} isTeen={isTeen} onClose={onClose} />
    </View>
  );
}
