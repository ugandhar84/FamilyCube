import { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Modal, ScrollView, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/ThemeContext';
import { usePetStore } from '@/store/petStore';
import { toTitle } from '@/lib/format';

const TOOLTIP_KEY = 'pet_switcher_tooltip_seen';

interface PetLike {
  name?: string | null;
  emoji?: string | null;
  avatar_url?: string | null;
  accent_color?: string | null;
}

interface Props {
  pet: PetLike | null | undefined;
  meta?: string | null;
  /** Pass false to disable the switcher (e.g. when showing another user's pet) */
  switchable?: boolean;
  /**
   * 'chip' (default) — pill with avatar + name.
   * 'badge' — compact circular avatar only, with a pulsing ring. Use for absolute-positioned overlays.
   */
  variant?: 'chip' | 'badge';
}

/** Pet avatar badge with breathing animation. Tap to switch active pet via bottom sheet. */
export default function PetHeaderChip({ pet, meta, switchable = true, variant = 'badge' }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { pets, activePetId, setActivePet } = usePetStore();
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;

  // One-time tooltip for badge variant
  useEffect(() => {
    if (variant !== 'badge' || !switchable || pets.length < 2) return;
    AsyncStorage.getItem(TOOLTIP_KEY).then(seen => {
      if (seen) return;
      const t = setTimeout(() => {
        setShowTooltip(true);
        Animated.sequence([
          Animated.timing(tooltipOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(2800),
          Animated.timing(tooltipOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
          setShowTooltip(false);
          AsyncStorage.setItem(TOOLTIP_KEY, '1');
        });
      }, 1200);
      return () => clearTimeout(t);
    });
  }, [variant, switchable, pets.length]);

  const dismissTooltip = () => {
    Animated.timing(tooltipOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShowTooltip(false);
      AsyncStorage.setItem(TOOLTIP_KEY, '1');
    });
  };

  // Breathing animation for badge variant
  const breatheScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (variant !== 'badge') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheScale, { toValue: 1.09, duration: 1400, useNativeDriver: true }),
        Animated.timing(breatheScale, { toValue: 1.0,  duration: 1400, useNativeDriver: true }),
        Animated.delay(600),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [variant]);

  if (!pet) return null;
  const ac = pet.accent_color ?? colors.primary;
  const canSwitch = switchable && pets.length > 0;

  const switcherModal = (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} activeOpacity={1} />
        <View style={{
          backgroundColor: colors.background,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingTop: 16, paddingBottom: insets.bottom + 16,
          maxHeight: '80%',
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>Switch Baby</Text>
            <TouchableOpacity onPress={() => setOpen(false)}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {pets.map(p => {
                const isActive = p.id === activePetId;
                const pc = (p as any).accent_color ?? colors.primary;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => { setActivePet(p.id); setOpen(false); }}
                    activeOpacity={0.7}
                    style={{
                      width: '30%', alignItems: 'center', paddingVertical: 14,
                      borderRadius: 16, backgroundColor: colors.card,
                      borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
                      borderColor: isActive ? pc : colors.border,
                    }}
                  >
                    {(p as any).avatar_url ? (
                      <Image source={{ uri: (p as any).avatar_url }}
                        style={{ width: 44, height: 44, borderRadius: 22, marginBottom: 8 }} />
                    ) : (
                      <Text style={{ fontSize: 36, marginBottom: 6 }}>{p.emoji}</Text>
                    )}
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}
                      numberOfLines={1}>{p.name}</Text>
                    <Text style={{ fontSize: 14, color: colors.textTertiary, marginTop: 2, textAlign: 'center' }}
                      numberOfLines={1}>
                      {(p as any).breed ? toTitle((p as any).breed) : toTitle((p as any).species ?? 'Pet')}
                    </Text>
                    {isActive && (
                      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="checkmark-circle" size={12} color={pc} />
                        <Text style={{ fontSize: 14, color: pc, fontWeight: '700' }}>Active</Text>
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

  // ── Badge variant ──────────────────────────────────────────────
  if (variant === 'badge') {
    return (
      <>
        <TouchableOpacity
          onPress={canSwitch ? () => { dismissTooltip(); setOpen(true); } : undefined}
          activeOpacity={0.75}
          style={s.badgeWrap}
        >
          {/* Avatar with breathing scale */}
          <View style={s.badgeAvatarWrap}>
            <Animated.View style={[s.badgeCircle, { borderColor: ac, transform: [{ scale: breatheScale }] }]}>
              {pet.avatar_url
                ? <Image source={{ uri: pet.avatar_url }} style={s.badgeImg} />
                : <Text style={s.badgeEmoji}>{pet.emoji ?? '🐾'}</Text>
              }
            </Animated.View>
            {/* Chevron dot */}
            {canSwitch && (
              <View style={[s.chevronDot, { backgroundColor: ac }]}>
                <Ionicons name="chevron-down" size={8} color="#fff" />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* One-time tooltip — outside TouchableOpacity so it isn't clipped */}
        {showTooltip && (
          <Animated.View style={[s.tooltip, { opacity: tooltipOpacity }]} pointerEvents="none">
            <View style={[s.tooltipArrow, { borderBottomColor: ac }]} />
            <View style={[s.tooltipBubble, { backgroundColor: ac }]}>
              <Text style={s.tooltipText}>Tap to switch pet</Text>
            </View>
          </Animated.View>
        )}

        {canSwitch && switcherModal}
      </>
    );
  }

  // ── Chip variant (default) ─────────────────────────────────────
  const chip = (
    <View style={[s.chip, {
      backgroundColor: isDark ? `${ac}22` : `${ac}15`,
      borderColor: `${ac}40`,
    }]}>
      <View style={[s.avatarRing, { borderColor: ac }]}>
        {pet.avatar_url
          ? <Image source={{ uri: pet.avatar_url }} style={s.avatarImg} />
          : <Text style={s.avatarEmoji}>{pet.emoji ?? '🐾'}</Text>
        }
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
          {(pet.name ?? 'My Pet').slice(0, 25)}
        </Text>
        {!!meta && (
          <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
      {canSwitch && (
        <Ionicons name="chevron-down" size={13} color={ac} style={{ marginLeft: 2, opacity: 0.7 }} />
      )}
    </View>
  );

  if (!canSwitch) return chip;

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.75} style={{ flexShrink: 1, maxWidth: '62%' }}>
        {chip}
      </TouchableOpacity>
      {switcherModal}
    </>
  );
}

const s = StyleSheet.create({
  // chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  avatarRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImg:   { width: 32, height: 32 },
  avatarEmoji: { fontSize: 18 },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 14,
    marginTop: 1,
  },
  // badge
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeAvatarWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  badgeImg:   { width: 48, height: 48 },
  badgeEmoji: { fontSize: 26 },
  chevronDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    position: 'absolute',
    top: 72,
    right: 0,
    alignItems: 'flex-end',
    zIndex: 999,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginRight: 18,
  },
  tooltipBubble: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tooltipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
