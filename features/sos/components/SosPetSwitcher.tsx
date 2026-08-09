import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toTitle } from '@/lib/format';
import { TYPO } from '@/constants/theme';

interface SosPetSwitcherProps {
  visible: boolean;
  onClose: () => void;
  pets: any[];
  activePetId: string | null;
  colors: any;
  bottomInset: number;
  onSelect: (id: string) => void;
}

export const SosPetSwitcher = React.memo(function SosPetSwitcher({
  visible, onClose, pets, activePetId, colors, bottomInset, onSelect,
}: SosPetSwitcherProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={{
          backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingTop: 16, paddingBottom: bottomInset + 16, maxHeight: '80%',
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 }}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>SELECT YOUR PET</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {pets.map(p => {
                const isActive = p.id === activePetId;
                const pc = (p as any).accent_color ?? colors.primary;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => { onSelect(p.id); onClose(); }}
                    activeOpacity={0.7}
                    style={{
                      width: '30.5%', alignItems: 'center', paddingVertical: 12, borderRadius: 14,
                      backgroundColor: colors.card, borderWidth: isActive ? 2 : 1,
                      borderColor: isActive ? pc : colors.border, marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 36, marginBottom: 6 }}>{p.emoji}</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>
                      {(p as any).breed ? toTitle((p as any).breed) : toTitle((p as any).species ?? 'Pet')}
                    </Text>
                    {isActive && (
                      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="checkmark-circle" size={12} color={pc} />
                        <Text style={{ fontSize: TYPO.body, color: pc, fontWeight: '600' }}>Active</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});
