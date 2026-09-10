/**
 * HomeownerNotesScreen — standalone route wrapper around
 * HomeownerNotesTab, mirroring SchoolScreen.tsx's own-header pattern.
 */
import { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Home } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import HomeownerNotesTab from './homeowner/HomeownerNotesTab';

export default function HomeownerNotesScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={hideHeader ? [] : ['top']}>
      {!hideHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ marginRight: 12 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ width: 34, height: 34, borderRadius: 10,
            backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '30',
            alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <Home size={17} color={colors.teal} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, flex: 1 }}>
            Homeowner Notes
          </Text>
        </View>
      )}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 14 }}>
        <HomeownerNotesTab colors={colors} isDark={isDark} />
      </ScrollView>
    </SafeAreaView>
  );
}
