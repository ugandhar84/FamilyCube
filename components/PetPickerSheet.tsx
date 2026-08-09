import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Modal,
  StyleSheet, Animated, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

interface PetLike {
  id: string;
  name?: string | null;
  emoji?: string | null;
  avatar_url?: string | null;
  accent_color?: string | null;
}

interface Props {
  visible: boolean;
  pets: PetLike[];
  activePetId: string | null;
  /** Title shown in the sheet, e.g. "Which pets went on this walk?" */
  title: string;
  confirmLabel?: string;
  /** When true: one-tap selection fires onConfirm immediately; hides "All babies" and confirm button */
  singleSelect?: boolean;
  onConfirm: (petIds: string[]) => void;
  onCancel: () => void;
}

export default function PetPickerSheet({
  visible, pets, activePetId, title,
  confirmLabel = 'Log', singleSelect = false, onConfirm, onCancel,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(300)).current;

  // Pre-select active pet
  const [selected, setSelected] = useState<Set<string>>(
    activePetId ? new Set([activePetId]) : new Set()
  );

  // Reset selection whenever sheet opens
  useEffect(() => {
    if (visible) {
      setSelected(activePetId ? new Set([activePetId]) : new Set());
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
    } else {
      slideY.setValue(300);
    }
  }, [visible, activePetId]);

  const allSelected = selected.size === pets.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(pets.map(p => p.id)));
  };

  const toggle = (id: string) => {
    if (singleSelect) {
      onConfirm([id]);
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onCancel} activeOpacity={1} />
        <Animated.View style={[s.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Title */}
          <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>

          {/* All chip — hidden in single-select mode */}
          {!singleSelect && (
            <View style={s.allRow}>
              <TouchableOpacity
                onPress={toggleAll}
                style={[s.allChip, { borderColor: allSelected ? colors.primary : colors.border, backgroundColor: allSelected ? `${colors.primary}18` : colors.card }]}
                activeOpacity={0.75}>
                <Text style={[s.allLabel, { color: allSelected ? colors.primary : colors.textSecondary }]}>
                  {allSelected ? '✓ All babies' : 'All babies'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pet grid */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.petRow}>
            {pets.map(p => {
              const ac = (p as any).accent_color ?? colors.primary;
              const sel = selected.has(p.id);
              return (
                <TouchableOpacity key={p.id} onPress={() => toggle(p.id)} activeOpacity={0.75} style={s.petItem}>
                  <View style={[s.avatarWrap, { borderColor: sel ? ac : colors.border, borderWidth: sel ? 2.5 : 1.5, backgroundColor: sel ? `${ac}12` : colors.card }]}>
                    {p.avatar_url
                      ? <Image source={{ uri: p.avatar_url }} style={s.avatarImg} />
                      : <Text style={s.avatarEmoji}>{p.emoji ?? '🐾'}</Text>
                    }
                    {sel && (
                      <View style={[s.checkBadge, { backgroundColor: ac }]}>
                        <Text style={s.checkMark}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.petName, { color: sel ? ac : colors.textSecondary, fontWeight: sel ? '700' : '500' }]} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Confirm button — hidden in single-select mode (tap fires immediately) */}
          {!singleSelect && (
            <TouchableOpacity
              onPress={() => selected.size > 0 && onConfirm([...selected])}
              activeOpacity={0.85}
              style={[s.confirmBtn, { backgroundColor: selected.size > 0 ? colors.primary : colors.border }]}>
              <Text style={s.confirmLabel}>
                {selected.size === 0
                  ? 'Select a baby'
                  : selected.size === pets.length
                    ? `${confirmLabel} for all`
                    : selected.size === 1
                      ? `${confirmLabel} for ${pets.find(p => selected.has(p.id))?.name}`
                      : `${confirmLabel} for ${selected.size} babies`}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginBottom: 14,
  },
  allRow: {
    marginBottom: 16,
  },
  allChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
  },
  allLabel: {
    fontSize: 14, fontWeight: '600',
  },
  petRow: {
    gap: 16, paddingBottom: 20,
  },
  petItem: {
    alignItems: 'center', gap: 6, width: 68,
  },
  avatarWrap: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 60, height: 60 },
  avatarEmoji: { fontSize: 32 },
  checkBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { fontSize: 11, color: '#fff', fontWeight: '700' },
  petName: { fontSize: 13, textAlign: 'center' },
  confirmBtn: {
    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
  },
  confirmLabel: {
    fontSize: 15, fontWeight: '700', color: '#fff',
  },
});
