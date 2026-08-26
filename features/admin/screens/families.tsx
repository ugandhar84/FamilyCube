// Admin cross-family directory — lists every family on the platform with a
// member count, and drills into one family's member roster on tap. Backed
// by admin_list_families()/admin_list_family_members(), both
// security-definer RPCs gated by is_app_admin() — SELECT-only, no write
// path to another family's data exists from this screen.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { showAlert } from '@/components/AppAlert';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  getAdminFamilies, getAdminFamilyMembers, getDuplicateFamilyCreators, deleteEmptyFamily,
  type AdminFamilyRow, type AdminFamilyMemberRow, type DuplicateFamilyCreator,
} from '@/lib/db/admin';

const ROLE_LABEL: Record<string, string> = { parent: 'Parent', kid: 'Kid', child: 'Kid', grandparent: 'Grandparent' };

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function FamiliesScreen() {
  const { colors } = useTheme();
  const [families, setFamilies] = useState<AdminFamilyRow[] | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateFamilyCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<AdminFamilyRow | null>(null);
  const [members, setMembers] = useState<AdminFamilyMemberRow[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [fams, dupes] = await Promise.all([getAdminFamilies(), getDuplicateFamilyCreators()]);
      setFamilies(fams);
      setDuplicates(dupes);
    } catch (e: any) {
      showAlert("Couldn't load families", e?.message ?? 'Something went wrong.');
      setFamilies([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openFamily = async (family: AdminFamilyRow) => {
    setSelectedFamily(family);
    setSheetVisible(true);
    setMembersLoading(true);
    try {
      setMembers(await getAdminFamilyMembers(family.familyId));
    } catch (e: any) {
      showAlert("Couldn't load members", e?.message ?? 'Something went wrong.');
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const confirmDeleteFamily = (family: AdminFamilyRow) => {
    showAlert(
      `Delete "${family.familyName}"?`,
      'This family has no members — deleting it is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingId(family.familyId);
            try {
              await deleteEmptyFamily(family.familyId);
              await load();
            } catch (e: any) {
              showAlert("Couldn't delete", e?.message ?? 'Something went wrong.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading || !families) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        {duplicates.length > 0 && (
          <View style={{
            flexDirection: 'row', gap: 10, alignItems: 'flex-start',
            backgroundColor: colors.primaryLight, borderRadius: RADIUS.md, padding: 12, marginBottom: 16,
          }}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>
              {duplicates.length} {duplicates.length === 1 ? 'account has' : 'accounts have'} created more than one family
              {duplicates[0].creatorEmail ? ` (${duplicates.map(d => d.creatorEmail).join(', ')})` : ''}.
              Each account should own exactly one family — delete the empty duplicate below to fix this.
            </Text>
          </View>
        )}

        <Text style={{
          fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
        }}>
          {families.length} {families.length === 1 ? 'Family' : 'Families'}
        </Text>

        {families.map(family => {
          const canDelete = family.memberCount === 0;
          return (
            <TouchableOpacity
              key={family.familyId}
              activeOpacity={0.7}
              onPress={() => openFamily(family)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 13, paddingHorizontal: 14,
                borderRadius: RADIUS.md, backgroundColor: colors.card,
                borderWidth: 1, borderColor: canDelete ? colors.danger + '55' : colors.border, marginBottom: 8,
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.primaryLight,
              }}>
                <Ionicons name="home-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{family.familyName}</Text>
                {family.creatorEmail && (
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
                    {family.creatorEmail}
                  </Text>
                )}
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
                  {family.memberCount} {family.memberCount === 1 ? 'member' : 'members'} · created {timeAgo(family.createdAt)}
                </Text>
              </View>
              {family.isSoloFamily && (
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full ?? 999,
                  backgroundColor: colors.pinkLight,
                }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.accent }}>Solo</Text>
                </View>
              )}
              {canDelete && (
                <TouchableOpacity
                  onPress={() => confirmDeleteFamily(family)}
                  disabled={deletingId === family.familyId}
                  activeOpacity={0.7}
                  style={{ padding: 6 }}
                >
                  {deletingId === family.familyId ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  )}
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <AppBottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={selectedFamily?.familyName ?? 'Family'}
        subtitle={selectedFamily?.creatorEmail ?? undefined}
      >
        {membersLoading || !members ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <View style={{ gap: 8 }}>
            {members.map(m => (
              <View
                key={m.memberId}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 12, paddingHorizontal: 14,
                  borderRadius: RADIUS.md, backgroundColor: colors.surface,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
                    {ROLE_LABEL[m.role] ?? m.role} · Lv {m.level} · {m.coins} coins · active {timeAgo(m.lastActive)}
                  </Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full ?? 999,
                  backgroundColor: m.role === 'parent' ? colors.tealLight : colors.amberLight,
                }}>
                  <Text style={{
                    fontSize: TYPO.micro, fontWeight: '700',
                    color: m.role === 'parent' ? colors.parent : colors.kid,
                  }}>
                    {ROLE_LABEL[m.role] ?? m.role}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </AppBottomSheet>
    </SafeAreaView>
  );
}
