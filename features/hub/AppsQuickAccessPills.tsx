/**
 * AppsQuickAccessPills — horizontal pill row below the Hub header for
 * jumping straight into an Apps (Family Vault) feature, e.g. Health or
 * Records, without going through the Apps tab's own grid first. Deep-links
 * via /(tabs)/profile?openFeature=<id>, which VaultScreen reads on mount.
 *
 * Each member can pin/reorder their own pills (long-press "Edit" opens
 * PillOrderSheet, real drag-and-drop) — saved to members.pillOrder,
 * DB-backed via familyStore's updateMember so it survives reinstall/new
 * device, not just local state.
 */
import { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Modal, Pressable, LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Radio, BookOpen, Heart, ShoppingCart, ChefHat, Coins, Image as ImageIcon, FolderOpen, Users, Gift, SlidersHorizontal, X, GripVertical, Check } from 'lucide-react-native';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import type { MemberRole } from '@/store/familyStore';

type PillId = 'gps' | 'school' | 'health' | 'records' | 'meals' | 'memories' | 'ledger' | 'roster' | 'grocery' | 'store';

const PILLS: { id: PillId; label: string; Icon: any; roles: MemberRole[] }[] = [
  { id: 'gps',      label: 'Radar',    Icon: Radio,        roles: ['parent', 'kid'] },
  { id: 'school',   label: 'School',   Icon: BookOpen,     roles: ['parent', 'kid'] },
  { id: 'health',   label: 'Health',   Icon: Heart,        roles: ['parent', 'kid'] },
  { id: 'grocery',  label: 'Grocery',  Icon: ShoppingCart, roles: ['parent'] },
  { id: 'meals',    label: 'Meals',    Icon: ChefHat,      roles: ['parent'] },
  { id: 'ledger',   label: 'Ledger',   Icon: Coins,        roles: ['parent', 'kid'] },
  { id: 'memories', label: 'Memories', Icon: ImageIcon,    roles: ['parent', 'kid', 'senior'] },
  { id: 'records',  label: 'Records',  Icon: FolderOpen,   roles: ['parent'] },
  { id: 'roster',   label: 'Roster',   Icon: Users,        roles: ['parent'] },
  { id: 'store',    label: 'Perks',    Icon: Gift,         roles: ['parent', 'kid'] },
];

function orderPills(available: typeof PILLS, savedOrder: string[] | undefined) {
  if (!savedOrder || savedOrder.length === 0) return available;
  const byId = new Map(available.map(p => [p.id, p]));
  const ordered = savedOrder.map(id => byId.get(id as PillId)).filter((p): p is typeof available[number] => !!p);
  // Anything new (added to PILLS after this member last saved an order, or
  // simply never pinned/hidden) still shows, appended at the end — a saved
  // order is a preference for what's already there, never a hard filter
  // that silently drops a feature nobody chose to hide.
  const missing = available.filter(p => !savedOrder.includes(p.id));
  return [...ordered, ...missing];
}

const ROW_HEIGHT = 54; // fixed row height (padding + content) so drag math is exact, no onLayout measurement per row needed

// One draggable row. The drag itself runs entirely on the UI thread —
// positions.value (a worklet-shared map of id -> index) is read AND
// written inside the pan gesture's own onUpdate, so every other row's
// displacement is computed and animated without ever touching React state
// or crossing to the JS thread mid-drag. The previous version called
// runOnJS(onReorder) on every index crossing, which round-tripped through
// setDraft -> full re-render -> new positions.value assignment for EVERY
// swap during a single continuous drag — that JS-thread wait per swap is
// what read as stuttery/not tracking the finger smoothly. Now the only
// JS-thread hop is once, on release, to commit the final order.
function DraggableRow({ id, pill, total, positions, draggingId, onRemove, onCommitOrder, colors, isDark }: {
  id: string; pill: typeof PILLS[number]; total: number;
  positions: SharedValue<Record<string, number>>;
  draggingId: SharedValue<string | null>;
  onRemove: (id: string) => void;
  onCommitOrder: (order: Record<string, number>) => void;
  colors: any; isDark: boolean;
}) {
  const dragY = useSharedValue(0);
  const isActive = useSharedValue(false);
  const startIndex = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      isActive.value = true;
      draggingId.value = id;
      startIndex.value = positions.value[id];
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
      const rawIndex = startIndex.value + e.translationY / ROW_HEIGHT;
      const targetIndex = Math.min(total - 1, Math.max(0, Math.round(rawIndex)));
      const currentIndex = positions.value[id];
      if (targetIndex === currentIndex) return;
      // Shift only the row(s) between the old and new slot by one — swaps
      // this dragged id directly to targetIndex, sliding whichever single
      // neighbor it crossed into the vacated slot. Entirely worklet-side,
      // no runOnJS, no React render.
      const next = { ...positions.value };
      for (const otherId of Object.keys(next)) {
        if (otherId === id) continue;
        const otherIndex = next[otherId];
        if (currentIndex < targetIndex && otherIndex > currentIndex && otherIndex <= targetIndex) {
          next[otherId] = otherIndex - 1;
        } else if (currentIndex > targetIndex && otherIndex < currentIndex && otherIndex >= targetIndex) {
          next[otherId] = otherIndex + 1;
        }
      }
      next[id] = targetIndex;
      positions.value = next;
    })
    .onEnd(() => {
      dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      isActive.value = false;
      draggingId.value = null;
      runOnJS(onCommitOrder)(positions.value);
    });

  const animatedStyle = useAnimatedStyle(() => {
    // While being dragged, this row's translateY must be anchored to its
    // START slot (startIndex, fixed for the whole gesture) plus the raw
    // finger translation — NOT its live positions.value slot, which
    // updates mid-drag the instant it crosses into a new index. Reading
    // the live (already-shifted) index here and then adding dragY on top
    // double-applied the offset — the row jumped an extra ROW_HEIGHT (or
    // more) ahead of the actual finger position every time it crossed a
    // neighbor, which is exactly the "goes way up off the touch" bug.
    // Every OTHER (non-dragged) row still reads the live index normally,
    // since those genuinely need to spring to wherever they've been
    // displaced to.
    const myIndex = isActive.value ? startIndex.value : (positions.value[id] ?? 0);
    const baseY = myIndex * ROW_HEIGHT;
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      // The dragged row tracks the raw gesture translation 1:1 on top of
      // its fixed start slot (no spring lag while the finger is down);
      // every other row springs to its new slot the instant
      // positions.value shifts under it.
      transform: [{ translateY: isActive.value ? baseY + dragY.value : withSpring(baseY, { damping: 22, stiffness: 260 }) }],
      zIndex: isActive.value ? 10 : 1,
      opacity: isActive.value ? 0.96 : 1,
      shadowColor: '#000',
      shadowOpacity: isActive.value ? 0.22 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: isActive.value ? 4 : 0,
    };
  });

  return (
    <Animated.View style={[{ height: ROW_HEIGHT - 8, paddingBottom: 8 }, animatedStyle]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12,
        borderWidth: 1.5, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC',
        padding: 10, height: ROW_HEIGHT - 8 }}>
        <GestureDetector gesture={pan}>
          <View style={{ padding: 8, marginLeft: -8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GripVertical size={16} color={colors.textTertiary} />
          </View>
        </GestureDetector>
        <pill.Icon size={16} color={colors.textPrimary} />
        <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{pill.label}</Text>
        <Pressable onPress={() => onRemove(id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={16} color={colors.danger} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function PillOrderSheet({ visible, onClose, available, order, onSave, colors, isDark }: {
  visible: boolean; onClose: () => void; available: typeof PILLS; order: string[]; onSave: (next: string[]) => void;
  colors: any; isDark: boolean;
}) {
  const [draft, setDraft] = useState<string[]>(order);
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(order.map((id, i) => [id, i]))
  );
  const draggingId = useSharedValue<string | null>(null);

  // Called once, from the pan gesture's onEnd (UI thread -> JS thread,
  // exactly one hop for the whole drag) — commits the worklet-side
  // positions map back into React state as the new draft order.
  const onCommitOrder = (finalPositions: Record<string, number>) => {
    setDraft(prev => [...prev].sort((a, b) => (finalPositions[a] ?? 0) - (finalPositions[b] ?? 0)));
  };

  const toggle = (id: string) => {
    setDraft(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      positions.value = Object.fromEntries(next.map((pid, i) => [pid, i]));
      return next;
    });
  };

  const save = () => { onSave(draft); onClose(); };

  const visibleDraft = draft.filter(id => available.some(p => p.id === id));
  const hidden = available.filter(p => !draft.includes(p.id));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, paddingTop: 12, maxHeight: '80%', backgroundColor: colors.card }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Quick access</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>Drag the handle to reorder</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            <View style={{ height: visibleDraft.length * ROW_HEIGHT }}>
              {visibleDraft.map((id) => {
                const pill = available.find(p => p.id === id)!;
                return (
                  <DraggableRow
                    key={id} id={id} pill={pill} total={visibleDraft.length}
                    positions={positions} draggingId={draggingId}
                    onCommitOrder={onCommitOrder} onRemove={toggle}
                    colors={colors} isDark={isDark}
                  />
                );
              })}
            </View>

            {hidden.length > 0 && (
              <>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, marginTop: 10, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Hidden</Text>
                <View style={{ gap: 8 }}>
                  {hidden.map(pill => (
                    <Pressable key={pill.id} onPress={() => toggle(pill.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12,
                        borderWidth: 1.5, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 10, opacity: 0.6 }}>
                      <pill.Icon size={16} color={colors.textSecondary} />
                      <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{pill.label}</Text>
                      <Check size={16} color={colors.textTertiary} />
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </ScrollView>

          <View style={{ padding: 20, paddingTop: 8 }}>
            <Pressable onPress={save}
              style={{ borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: '#fff' }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AppsQuickAccessPills({ role, colors, isDark }: {
  role: MemberRole; colors: any; isDark: boolean;
}) {
  const router = useRouter();
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const savedOrder = useFamilyStore(s => s.members.find(m => m.id === s.activeMemberId)?.pillOrder);
  const updateMember = useFamilyStore(s => s.updateMember);
  const [editing, setEditing] = useState(false);

  const available = PILLS.filter(p => p.roles.includes(role));
  if (available.length === 0) return null;
  const visible = orderPills(available, savedOrder);

  return (
    <View style={{ paddingBottom: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        // Explicit height — a horizontal ScrollView with no fixed height can
        // collapse below its content's actual rendered height in this layout
        // context, clipping the pills' tops (icons/text cut off).
        style={{ height: 40, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 7, alignItems: 'center' }}>
        {visible.map(p => (
          <TouchableOpacity key={p.id} activeOpacity={0.75}
            onPress={() => router.push({ pathname: '/(tabs)/profile', params: { openFeature: p.id } } as any)}
            onLongPress={() => setEditing(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
              backgroundColor: isDark ? colors.surface : '#F2ECE1',
              borderWidth: 1, borderColor: isDark ? colors.border : '#E5DFC8',
            }}>
            <p.Icon size={12} color={colors.textPrimary} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary, lineHeight: 15 }}>{p.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity activeOpacity={0.75} onPress={() => setEditing(true)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: isDark ? colors.surface : '#F2ECE1',
            borderWidth: 1, borderColor: isDark ? colors.border : '#E5DFC8',
          }}>
          <SlidersHorizontal size={13} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {activeMemberId && (
        <PillOrderSheet
          key={editing ? 'open' : 'closed'}
          visible={editing}
          onClose={() => setEditing(false)}
          available={available}
          order={visible.map(p => p.id)}
          onSave={(next) => {
            // Was: no visible confirmation that Save actually reached the
            // DB — updateMember's own error is only console.warn'd, so a
            // failed write looked identical to a successful one from the
            // user's side. Kept fire-and-forget (matches every other
            // updateMember caller in the app) but this is now the one
            // spot in the chain most likely to be checked when a saved
            // order "doesn't stick" — confirm activeMemberId is genuinely
            // set and the write is actually issued here.
            updateMember(activeMemberId, { pillOrder: next });
          }}
          colors={colors} isDark={isDark}
        />
      )}
    </View>
  );
}
