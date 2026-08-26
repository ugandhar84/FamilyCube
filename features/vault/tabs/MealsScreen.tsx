/**
 * MealsScreen — standalone route wrapper around MealsTabComp, mirroring
 * GroceryScreen.tsx's own-header pattern (not AppHeader — this is a
 * secondary screen reached via router.push, not a primary tab). Previously
 * only reachable via VaultScreen's openFeature=meals overlay; now has its
 * own real route (app/(tabs)/meals.tsx) so the Hub's "Meals" quick-action
 * tile can link straight to it, matching how Grocery already works.
 */
import { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChefHat } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import MealsTabComp from './MealsTab';

export default function MealsScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();

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
            backgroundColor: colors.pink + '18', borderWidth: 1, borderColor: colors.pink + '30',
            alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <ChefHat size={17} color={colors.pink} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, flex: 1 }}>
            Meals
          </Text>
        </View>
      )}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 14 }}>
        <MealsTabComp colors={colors} isDark={isDark} />
      </ScrollView>
    </SafeAreaView>
  );
}
