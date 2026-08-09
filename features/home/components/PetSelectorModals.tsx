import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toTitle } from '@/lib/format';
import { TYPO } from '@/constants/theme';

interface PetSelectorModalsProps {
  // Dropdown
  showDropdown: boolean;
  setShowDropdown: (v: boolean) => void;
  // Bottom sheet
  showPetSelector: boolean;
  // selectedPetId is the pet the user just tapped (passed so caller can navigate immediately)
  setShowPetSelector: (v: boolean, selectedPetId?: string) => void;
  // Shared
  sortedPets: any[];
  activePetId: string | null;
  setActivePet: (id: string) => void;
  goAddPet: () => void;
  bottomInset: number;
  colors: any;
}

export const PetSelectorModals = React.memo(function PetSelectorModals({
  showDropdown, setShowDropdown,
  showPetSelector, setShowPetSelector,
  sortedPets, activePetId, setActivePet,
  goAddPet, bottomInset, colors,
}: PetSelectorModalsProps) {
  return (
    <>
      {/* Dropdown pet selector */}
      <Modal visible={showDropdown} transparent animationType="none" onRequestClose={() => setShowDropdown(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDropdown(false)}>
          <View style={{
            position: 'absolute', top: 200, left: 16, right: 16,
            backgroundColor: colors.background, borderRadius: 16,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 }, elevation: 10,
            overflow: 'hidden',
          }}>
            <Text style={{
              fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary,
              textTransform: 'uppercase', letterSpacing: 0.8,
              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
            }}>
              Your babies
            </Text>
            {sortedPets.map((p, i) => {
              const isActive = p.id === activePetId;
              const pc = p.accent_color ?? colors.primary;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setActivePet(p.id); setShowDropdown(false); }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0,
                    borderTopColor: colors.border,
                    backgroundColor: isActive ? `${pc}12` : 'transparent',
                  }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 19, backgroundColor: `${pc}20`,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: isActive ? 2 : 1, borderColor: isActive ? pc : colors.border,
                  }}>
                    <Text style={{ fontSize: TYPO.heading }}>{p.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{p.name}</Text>
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>
                      {toTitle(p.breed ?? p.species ?? 'Pet')}
                    </Text>
                  </View>
                  {isActive && <Ionicons name="checkmark-circle" size={18} color={pc} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => { setShowDropdown(false); goAddPet(); }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 16, paddingVertical: 12,
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
              }}>
              <View style={{
                width: 38, height: 38, borderRadius: 19, backgroundColor: colors.inputBg,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
              }}>
                <Ionicons name="add" size={18} color={colors.textSecondary} />
              </View>
              <Text style={{ fontSize: TYPO.body, fontWeight: '500', color: colors.textSecondary }}>Add new baby</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Sheet Pet Selector */}
      <Modal visible={showPetSelector} transparent animationType="slide" onRequestClose={() => setShowPetSelector(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowPetSelector(false)} activeOpacity={1} />
          <View style={{
            backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 16, paddingBottom: bottomInset + 16, maxHeight: '80%',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setShowPetSelector(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>SELECT YOUR BABY</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sortedPets.map((p) => {
                  const isActive = p.id === activePetId;
                  const ac = p.accent_color ?? colors.primary;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setActivePet(p.id); setShowPetSelector(false, p.id); }}
                      activeOpacity={0.7}
                      style={{
                        width: '30.5%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
                        borderRadius: 14, backgroundColor: colors.card,
                        borderWidth: isActive ? 2 : 1,
                        borderColor: isActive ? ac : colors.border,
                        marginBottom: 4, overflow: 'hidden',
                      }}
                    >
                      <Text style={{ fontSize: 36, marginBottom: 6 }}>{p.emoji}</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>
                        {p.breed ? toTitle(p.breed) : toTitle(p.species ?? 'Pet')}
                      </Text>
                      {isActive && (
                        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="checkmark-circle" size={12} color={ac} />
                          <Text style={{ fontSize: TYPO.body, color: ac, fontWeight: '600' }}>Active</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => { setShowPetSelector(false); goAddPet(); }}
              style={{
                marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12,
                backgroundColor: colors.inputBg, alignItems: 'center',
                borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="add-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Add New Baby</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
});
