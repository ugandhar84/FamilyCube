// Admin paywall-groups screen — the dynamic tier system. An admin can:
//   (a) create/rename/delete paywall groups (tiers) at runtime
//   (b) assign any feature_flags key to a group, or clear it back to
//       "Free (no restriction)"
// Nothing about tier names/count/feature assignment is hardcoded in
// application code — see lib/db/admin.ts + lib/featurePaywall.ts.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { showAlert } from '@/components/AppAlert';
import { showPickerOverlay } from '@/store/pickerOverlayStore';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  getPaywallGroups, createPaywallGroup, updatePaywallGroup, deletePaywallGroup,
  getFeaturePaywallAssignments, setFeaturePaywallAssignment,
  type PaywallGroupRow, type FeaturePaywallAssignmentRow,
} from '@/lib/db/admin';
import type { FeatureFlagKey } from '@/lib/featureFlags';

// Same key list as feature-flags.tsx, flattened — the paywall system
// assigns tiers per feature_flags key, so every key needs a picker row
// here regardless of which gamification/etc group it belongs to on that
// other screen.
const ALL_FEATURE_KEYS: FeatureFlagKey[] = [
  'gamification', 'daily_quests', 'leaderboard', 'seasonal_events',
  'rewards_marketplace', 'per_device_e2e', 'store_proximity_reminders',
  'home_screen_widgets',
];

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `group_${Date.now()}`;
}

export default function PaywallGroupsScreen() {
  const { colors } = useTheme();
  const [groups, setGroups] = useState<PaywallGroupRow[] | null>(null);
  const [assignments, setAssignments] = useState<FeaturePaywallAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/rename group sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PaywallGroupRow | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([getPaywallGroups(), getFeaturePaywallAssignments()]);
      setGroups(g);
      setAssignments(a);
    } catch (e: any) {
      showAlert("Couldn't load paywall groups", e?.message ?? 'Something went wrong.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreateSheet = () => {
    setEditingGroup(null);
    setLabelInput('');
    setDescInput('');
    setSheetVisible(true);
  };

  const openEditSheet = (group: PaywallGroupRow) => {
    setEditingGroup(group);
    setLabelInput(group.label);
    setDescInput(group.description ?? '');
    setSheetVisible(true);
  };

  const saveGroup = async () => {
    const label = labelInput.trim();
    if (!label) { showAlert('Name required', 'Give this tier a name.'); return; }
    setSaving(true);
    try {
      if (editingGroup) {
        await updatePaywallGroup(editingGroup.id, { label, description: descInput.trim() || null });
      } else {
        await createPaywallGroup({ key: slugify(label), label, description: descInput.trim() || null });
      }
      setSheetVisible(false);
      await load();
    } catch (e: any) {
      showAlert("Couldn't save", e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteGroup = (group: PaywallGroupRow) => {
    showAlert(
      `Delete "${group.label}"?`,
      'Any feature assigned to this tier will fall back to unrestricted/free. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deletePaywallGroup(group.id);
              await load();
            } catch (e: any) {
              showAlert("Couldn't delete", e?.message ?? 'Something went wrong.');
            }
          },
        },
      ],
    );
  };

  const assignedGroupFor = (featureKey: string): PaywallGroupRow | null => {
    const a = assignments.find(x => x.feature_key === featureKey);
    if (!a || !groups) return null;
    return groups.find(g => g.id === a.paywall_group_id) ?? null;
  };

  const openAssignPicker = (featureKey: FeatureFlagKey) => {
    if (!groups) return;
    const options = [
      {
        label: 'Free (no restriction)',
        onPress: async () => {
          try {
            await setFeaturePaywallAssignment(featureKey, null);
            await load();
          } catch (e: any) {
            showAlert("Couldn't update", e?.message ?? 'Something went wrong.');
          }
        },
      },
      ...groups.map(g => ({
        label: g.label,
        onPress: async () => {
          try {
            await setFeaturePaywallAssignment(featureKey, g.id);
            await load();
          } catch (e: any) {
            showAlert("Couldn't update", e?.message ?? 'Something went wrong.');
          }
        },
      })),
    ];
    showPickerOverlay(`Assign "${featureKey}"`, options);
  };

  if (loading || !groups) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Groups */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{
            fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.6,
          }}>
            Tiers
          </Text>
          <TouchableOpacity onPress={openCreateSheet} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add-circle" size={20} color={colors.primary} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.primary }}>New tier</Text>
          </TouchableOpacity>
        </View>

        {groups.length === 0 && (
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 16 }}>
            No tiers yet — add one to start assigning features.
          </Text>
        )}

        {groups.map(group => (
          <View
            key={group.id}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingVertical: 13, paddingHorizontal: 14,
              borderRadius: RADIUS.md, backgroundColor: colors.card,
              borderWidth: 1, borderColor: colors.border, marginBottom: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{group.label}</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
                {group.description || group.key}
              </Text>
            </View>
            <TouchableOpacity onPress={() => openEditSheet(group)} activeOpacity={0.7} style={{ padding: 6 }}>
              <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDeleteGroup(group)} activeOpacity={0.7} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Feature assignments */}
        <Text style={{
          fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10,
        }}>
          Feature Assignments
        </Text>
        {ALL_FEATURE_KEYS.map(featureKey => {
          const assigned = assignedGroupFor(featureKey);
          return (
            <TouchableOpacity
              key={featureKey}
              activeOpacity={0.7}
              onPress={() => openAssignPicker(featureKey)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 13, paddingHorizontal: 14,
                borderRadius: RADIUS.md, backgroundColor: colors.card,
                borderWidth: 1, borderColor: colors.border, marginBottom: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{featureKey}</Text>
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full ?? 999,
                backgroundColor: assigned ? colors.primaryLight : colors.surface,
              }}>
                <Text style={{
                  fontSize: TYPO.micro, fontWeight: '700',
                  color: assigned ? colors.primary : colors.textTertiary,
                }}>
                  {assigned ? assigned.label : 'Free'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <AppBottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editingGroup ? 'Rename Tier' : 'New Tier'}
        footer={
          <TouchableOpacity
            onPress={saveGroup}
            disabled={saving}
            activeOpacity={0.8}
            style={{
              backgroundColor: colors.primary, borderRadius: RADIUS.md,
              paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>
                {editingGroup ? 'Save Changes' : 'Create Tier'}
              </Text>
            )}
          </TouchableOpacity>
        }
      >
        <View style={{ gap: 14 }}>
          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Name</Text>
            <TextInput
              value={labelInput}
              onChangeText={setLabelInput}
              placeholder="e.g. Plus"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1,
                borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: TYPO.body, color: colors.textPrimary,
              }}
            />
          </View>
          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput
              value={descInput}
              onChangeText={setDescInput}
              placeholder="What this tier unlocks"
              placeholderTextColor={colors.placeholder}
              multiline
              style={{
                backgroundColor: colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1,
                borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: TYPO.body, color: colors.textPrimary, minHeight: 70, textAlignVertical: 'top',
              }}
            />
          </View>
        </View>
      </AppBottomSheet>
    </SafeAreaView>
  );
}
