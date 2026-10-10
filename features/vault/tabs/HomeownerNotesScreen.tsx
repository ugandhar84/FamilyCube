import { useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { PageHeading } from '@/components/PageHeading';
import HomeownerNotesTab from './homeowner/HomeownerNotesTab';

export default function HomeownerNotesScreen({ hideHeader = false, onClose }: { hideHeader?: boolean; onClose?: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!hideHeader && (
        <PageHeading
          eyebrow="FAMILY CUBE · HOME CARE"
          title="Home Care"
          subtitle="Track maintenance, repairs, and home tasks"
          accent="teal"
          Icon={Home}
          topInset={insets.top}
        />
      )}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 8 }}>
        <HomeownerNotesTab colors={colors} isDark={isDark} />
      </ScrollView>
    </View>
  );
}
