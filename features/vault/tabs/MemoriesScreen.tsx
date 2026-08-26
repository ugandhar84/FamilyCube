/**
 * MemoriesScreen — the family-photos Memories screen (MemoriesTabComp),
 * mirroring MealsScreen.tsx/GroceryScreen.tsx's own-header pattern.
 * app/(tabs)/memories.tsx previously pointed at a same-named but unrelated
 * PawBond pet-photo timeline screen ("No babies yet" empty state) — that
 * whole feature has been removed; this is the one real Memories screen now.
 *
 * No local FAB here — posting a memory goes through the SAME shared FAB
 * Tasks uses (app/(tabs)/_layout.tsx), which morphs to "+" and fires
 * openMemoryComposerRequested (useUIStore) the moment this screen is
 * focused, exactly like Tasks' own openTaskComposerRequested. MemoriesTab
 * itself reads that flag to open ComposeMemoryModal.
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ImageIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import MemoriesTabComp from './MemoriesTab';

export default function MemoriesScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const readOnly = activeMember?.role === 'senior';

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
            <ImageIcon size={17} color={colors.pink} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, flex: 1 }}>
            Memories
          </Text>
        </View>
      )}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 14 }}>
        <MemoriesTabComp colors={colors} isDark={isDark} readOnly={readOnly} />
      </ScrollView>
    </SafeAreaView>
  );
}
