// Admin Users screen — searchable/filterable roster of every signed-up
// account, with when they joined, onboarding status, family, and
// subscription tier. Backed by admin_list_users(), is_app_admin()-gated.
// Block/unblock (real Supabase Auth ban) and delete (soft-delete, 7-day
// grace period, same mechanism as self-service account deletion) actions
// live behind a per-row action sheet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { showAlert } from '@/components/AppAlert';
import AppBottomSheet from '@/components/AppBottomSheet';
import { getAdminUsers, setUserBlocked, deleteUserAccount, type AdminUserRow, type AdminUserFilter } from '@/lib/db/admin';

const FILTERS: { key: AdminUserFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new7d', label: 'New (7d)' },
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'not_onboarded', label: 'Stuck' },
  { key: 'admin', label: 'Admins' },
  { key: 'blocked', label: 'Blocked' },
];

const PAGE_SIZE = 50;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const TIER_COLOR: Record<string, string> = { free: '', pro: 'parent', ultimate: 'accent' };

function UserRow({ user, colors, onPress }: { user: AdminUserRow; colors: any; onPress: () => void }) {
  const tierKey = user.subscriptionTier && TIER_COLOR[user.subscriptionTier];
  const blocked = !!user.blockedAt;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        paddingVertical: 12, paddingHorizontal: 14,
        borderRadius: RADIUS.md, backgroundColor: colors.card,
        borderWidth: 1, borderColor: blocked ? colors.danger + '55' : colors.border, marginBottom: 8, gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
          {user.fullName || user.email || 'Unnamed'}
        </Text>
        {blocked && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: colors.danger + '22' }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.danger }}>Blocked</Text>
          </View>
        )}
        {user.isAdmin && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: colors.primaryLight }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.primary }}>Admin</Text>
          </View>
        )}
        {tierKey && (
          <View style={{
            paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full,
            backgroundColor: tierKey === 'parent' ? colors.tealLight : colors.pinkLight,
          }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors[tierKey] }}>
              {user.subscriptionTier}
            </Text>
          </View>
        )}
        <Ionicons name="ellipsis-horizontal" size={16} color={colors.textTertiary} />
      </View>
      {user.email && user.fullName && (
        <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }} numberOfLines={1}>{user.email}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Ionicons
          name={user.onboardingCompleted ? 'checkmark-circle' : 'time-outline'}
          size={13}
          color={user.onboardingCompleted ? colors.parent : colors.kid}
        />
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
          {user.onboardingCompleted ? 'Onboarded' : 'Onboarding incomplete'} · joined {timeAgo(user.createdAt)}
          {user.familyName ? ` · ${user.familyName}` : ''}
          {user.memberRole ? ` (${user.memberRole})` : ''}
          {user.otherFamilyCount > 0 ? ` · +${user.otherFamilyCount} more ${user.otherFamilyCount === 1 ? 'family' : 'families'}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function UsersScreen() {
  const { colors } = useTheme();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AdminUserFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (opts: { reset?: boolean; refresh?: boolean } = {}) => {
    const { reset = true, refresh = false } = opts;
    if (refresh) setRefreshing(true);
    else if (reset) setLoading(true);
    try {
      const rows = await getAdminUsers({ search, filter, offset: 0, limit: PAGE_SIZE });
      setUsers(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e: any) {
      showAlert("Couldn't load users", e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, filter]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => load(), search ? 300 : 0);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await getAdminUsers({ search, filter, offset: users.length, limit: PAGE_SIZE });
      setUsers(prev => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e: any) {
      showAlert("Couldn't load more", e?.message ?? 'Something went wrong.');
    } finally {
      setLoadingMore(false);
    }
  };

  const closeSheet = () => { if (!actionLoading) setSelected(null); };

  const toggleBlock = () => {
    if (!selected) return;
    const willBlock = !selected.blockedAt;
    showAlert(
      willBlock ? `Block ${selected.fullName || selected.email || 'this user'}?` : `Unblock this user?`,
      willBlock
        ? 'They will be signed out and unable to sign back in until unblocked.'
        : 'They will be able to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willBlock ? 'Block' : 'Unblock', style: willBlock ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoading(true);
            try {
              await setUserBlocked(selected.authUserId, willBlock);
              setSelected(null);
              await load({ refresh: true });
            } catch (e: any) {
              showAlert("Couldn't update", e?.message ?? 'Something went wrong.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (!selected) return;
    showAlert(
      `Delete ${selected.fullName || selected.email || 'this account'}?`,
      "This starts a 7-day grace period, same as self-service deletion — the account is restored automatically if they log back in within 7 days, then permanently removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await deleteUserAccount(selected.authUserId);
              setSelected(null);
              await load({ refresh: true });
            } catch (e: any) {
              showAlert("Couldn't delete", e?.message ?? 'Something went wrong.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.inputBorder,
          paddingHorizontal: 12, marginBottom: 12,
        }}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or email"
            placeholderTextColor={colors.placeholder}
            style={{ flex: 1, paddingVertical: 10, fontSize: TYPO.body, color: colors.textPrimary }}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {FILTERS.map(f => {
            const selectedFilter = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full,
                  backgroundColor: selectedFilter ? colors.primary : colors.card,
                  borderWidth: 1, borderColor: selectedFilter ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: selectedFilter ? '#fff' : colors.textSecondary }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} tintColor={colors.primary} />}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) loadMore();
          }}
          scrollEventThrottle={200}
        >
          {users.length === 0 ? (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>
              No users match this search.
            </Text>
          ) : (
            <>
              {users.map(u => <UserRow key={u.authUserId} user={u} colors={colors} onPress={() => setSelected(u)} />)}
              {loadingMore && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
            </>
          )}
        </ScrollView>
      )}

      <AppBottomSheet
        visible={!!selected}
        onClose={closeSheet}
        title={selected?.fullName || selected?.email || 'User'}
        subtitle={selected?.email && selected?.fullName ? selected.email : undefined}
      >
        {selected && (
          <View style={{ gap: 10 }}>
            {selected.isAdmin ? (
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 }}>
                This account is a platform admin — block/delete actions are disabled here to prevent locking out an admin by mistake.
              </Text>
            ) : (
              <>
                <TouchableOpacity
                  onPress={toggleBlock}
                  disabled={actionLoading}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 13, paddingHorizontal: 14, borderRadius: RADIUS.md,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Ionicons
                    name={selected.blockedAt ? 'lock-open-outline' : 'ban-outline'}
                    size={18}
                    color={selected.blockedAt ? colors.parent : colors.kid}
                  />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {selected.blockedAt ? 'Unblock user' : 'Block user'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={confirmDelete}
                  disabled={actionLoading}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 13, paddingHorizontal: 14, borderRadius: RADIUS.md,
                    backgroundColor: colors.danger + '15',
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.danger }}>Delete account</Text>
                </TouchableOpacity>
              </>
            )}
            {actionLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />}
          </View>
        )}
      </AppBottomSheet>
    </SafeAreaView>
  );
}
