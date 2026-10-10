import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { PageHeading } from '@/components/PageHeading';
import SchoolTabComp from './SchoolTab';

export default function SchoolScreen({ hideHeader = false, onClose }: { hideHeader?: boolean; onClose?: () => void }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid = activeMember?.role === 'kid';
  const isTeen = activeMember?.role === 'teen';
  const insets = useSafeAreaInsets();

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      {!hideHeader && (
        <View style={{ backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
          <PageHeading
            eyebrow="FAMILY CUBE · SCHOOL"
            title="School"
            subtitle="Schedules, homework and class details"
            accent="amber"
            Icon={BookOpen}
            topInset={insets.top}
          />
        </View>
      )}
      <SchoolTabComp colors={colors} isDark={isDark} isKid={isKid} isTeen={isTeen} />
    </View>
  );
}
