/**
 * SchoolScreen — standalone route wrapper around SchoolTabComp, mirroring
 * MealsScreen.tsx/GroceryScreen.tsx's own-header pattern. Previously only
 * reachable via VaultScreen's openFeature=school overlay.
 */
import { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BookOpen } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import SchoolTabComp from './SchoolTab';

export default function SchoolScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid = activeMember?.role === 'kid';

  // Hides the shared Ask Cube FAB — same fullBleedScreenActive mechanism
  // GpsTab.tsx/HealthRecordsScreen.tsx use for a pushed sub-route the tab
  // layout's activeTabName-based hide logic can't otherwise detect.
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
            backgroundColor: colors.accent + '18', borderWidth: 1, borderColor: colors.accent + '30',
            alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <BookOpen size={17} color={colors.accent} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, flex: 1 }}>
            School
          </Text>
        </View>
      )}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 14 }}>
        <SchoolTabComp colors={colors} isDark={isDark} isKid={isKid} />
      </ScrollView>
    </SafeAreaView>
  );
}
