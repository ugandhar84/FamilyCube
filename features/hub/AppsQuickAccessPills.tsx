/**
 * AppsQuickAccessPills — horizontal pill row below the Hub header for
 * jumping straight into an Apps (Family Vault) feature, e.g. Health or
 * Records, without going through the Apps tab's own grid first. Deep-links
 * via /(tabs)/profile?openFeature=<id>, which VaultScreen reads on mount.
 *
 * Each member can pin/reorder their own pills (long-press "Edit" opens
 * PillOrderSheet) — saved to members.pillOrder, DB-backed via
 * familyStore's updateMember so it survives reinstall/new device, not just
 * local state.
 */
import { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Radio, BookOpen, Heart, ShoppingCart, ChefHat, Coins, Image as ImageIcon, FolderOpen, Users, Gift, SlidersHorizontal, X, ChevronUp, ChevronDown, Check } from 'lucide-react-native';
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

function PillOrderSheet({ visible, onClose, available, order, onSave, colors, isDark }: {
  visible: boolean; onClose: () => void; available: typeof PILLS; order: string[]; onSave: (next: string[]) => void;
  colors: any; isDark: boolean;
}) {
  const [draft, setDraft] = useState<string[]>(order);

  const move = (id: string, dir: -1 | 1) => {
    setDraft(prev => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const toggle = (id: string) => {
    setDraft(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = () => { onSave(draft); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, paddingTop: 12, maxHeight: '80%', backgroundColor: colors.card }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Quick access</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>Pick and order what shows here</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 12, gap: 8 }} showsVerticalScrollIndicator={false}>
            {draft.filter(id => available.some(p => p.id === id)).map(id => {
              const pill = available.find(p => p.id === id)!;
              return (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12,
                  borderWidth: 1.5, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 10 }}>
                  <pill.Icon size={16} color={colors.textPrimary} />
                  <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{pill.label}</Text>
                  <Pressable onPress={() => move(id, -1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <ChevronUp size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => move(id, 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <ChevronDown size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => toggle(id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={16} color={colors.danger} />
                  </Pressable>
                </View>
              );
            })}

            {available.filter(p => !draft.includes(p.id)).length > 0 && (
              <>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>Hidden</Text>
                {available.filter(p => !draft.includes(p.id)).map(pill => (
                  <Pressable key={pill.id} onPress={() => toggle(pill.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12,
                      borderWidth: 1.5, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 10, opacity: 0.6 }}>
                    <pill.Icon size={16} color={colors.textSecondary} />
                    <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{pill.label}</Text>
                    <Check size={16} color={colors.textTertiary} />
                  </Pressable>
                ))}
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
          visible={editing}
          onClose={() => setEditing(false)}
          available={available}
          order={visible.map(p => p.id)}
          onSave={(next) => updateMember(activeMemberId, { pillOrder: next })}
          colors={colors} isDark={isDark}
        />
      )}
    </View>
  );
}
