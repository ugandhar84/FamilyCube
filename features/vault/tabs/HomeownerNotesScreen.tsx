import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { PageHeading } from '@/components/PageHeading';
import HomeownerNotesTab from './homeowner/HomeownerNotesTab';

const PAGE_BG = '#F3F5F2';

export default function HomeownerNotesScreen({ hideHeader = false, onClose }: { hideHeader?: boolean; onClose?: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : PAGE_BG }}>
      {!hideHeader && (
        <View style={{ backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
          <PageHeading
            eyebrow="FAMILY CUBE · HOME CARE"
            title="Home Care"
            subtitle="Track maintenance, repairs, and home tasks"
            accent="teal"
            Icon={Home}
            topInset={insets.top}
          />
        </View>
      )}
      <HomeownerNotesTab colors={colors} isDark={isDark} />
    </View>
  );
}
