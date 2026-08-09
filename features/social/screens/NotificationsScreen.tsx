import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, RefreshControl,
   ScrollView, Animated, Platform,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useTheme } from '@/lib/ThemeContext';
import { RADIUS, TYPO} from '@/constants/theme';
import PawBondLoader from '@/components/PawBondLoader';
import { NotifCard } from '@/features/social/components/NotifCard';
import { useRouter } from 'expo-router';
import { useNotifSelection } from '@/features/social/hooks/useNotifSelection';
import { useNotificationsData } from '@/features/social/hooks/useNotificationsData';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function NotificationsScreen({ hideHeader = false, onUnreadChange }: { hideHeader?: boolean; onUnreadChange?: (count: number) => void } = {}) {
  const router             = useRouter();
  const { colors, isDark } = useTheme();
  const { user }           = useAuthStore();
  const { fetchPets }      = usePetStore(useShallow(s => ({ fetchPets: s.fetchPets })));
  const params = useLocalSearchParams<{ petId?: string }>();

  const sosEnabled    = useFeatureFlag('sos_enabled', true);
  const familyEnabled = useFeatureFlag('connect_family_enabled', false);
  const hiddenTypes   = useMemo(() => {
    const s = new Set<string>();
    if (!sosEnabled)    { s.add('lost_alert'); s.add('pet_found'); }
    if (!familyEnabled) { s.add('invite'); s.add('family_update'); }
    return s;
  }, [sosEnabled, familyEnabled]);

  const [petFilter,  setPetFilter]  = useState(params.petId ?? 'all');
  const [dateFilter, setDateFilter] = useState('all');
  useEffect(() => { setPetFilter(params.petId ?? 'all'); }, [params.petId]);

  const listRef = useRef<FlashListRef<any>>(null);
  const sel     = useNotifSelection();
  const d       = useNotificationsData(user, hiddenTypes, petFilter, listRef, dateFilter);

  const isAllSelected = sel.selected.size === d.allIds.length && d.allIds.length > 0;

  useEffect(() => { if (user?.id) fetchPets(user.id); }, [user?.id]);
  useEffect(() => { onUnreadChange?.(d.unreadCount); }, [d.unreadCount, onUnreadChange]);

  // Handlers that wire selection + data
  const handlePress = useCallback((item: any) => {
    if (sel.selecting) { sel.toggleItem(item.id); return; }
    d.openNotif(item);
  }, [sel.selecting, sel.toggleItem, d.openNotif]);

  const handleLongPress = useCallback((item: any) => {
    sel.setSelecting(true);
    sel.setSelected(new Set([item.id]));
  }, []);

  const handleViewProfile = useCallback((petId: string) => {
    router.push(`/pet/card?id=${petId}`);
  }, [router]);

  const selHasUnread = [...sel.selected].some(id => { const n = d.notifs.find(n => n.id === id); return n && !n.read && !d.readIds.has(id); });
  const selHasRead   = [...sel.selected].some(id => { const n = d.notifs.find(n => n.id === id); return n && (n.read || d.readIds.has(id)); });

  const bg = isDark ? '#0E0A1A' : '#F5F3FF';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaView edges={hideHeader ? [] : ['top']} style={{ backgroundColor: bg }}>

        {!hideHeader && (
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
              {d.unreadCount > 0 && (
                <Text style={[styles.headerSub, { color: colors.primaryText ?? colors.primary }]}>{d.unreadCount} unread</Text>
              )}
            </View>
            <View style={styles.headerRight}>
              {d.unreadCount > 0 && !sel.selecting && (
                <TouchableOpacity onPress={d.markAllRead} style={[styles.headerBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name="checkmark-done" size={14} color={colors.primaryText ?? colors.primary} />
                  <Text style={[styles.headerBtnText, { color: colors.primaryText ?? colors.primary }]}>Mark all read</Text>
                </TouchableOpacity>
              )}
              {sel.selecting && (
                <TouchableOpacity onPress={() => sel.setSelecting(false)} style={[styles.headerBtn, { borderColor: colors.border }]}>
                  <Text style={[styles.headerBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Pet filter pills — only when user has more than one pet */}
        {d.pets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {[{ id: 'all', name: 'All Pets', emoji: '🐾' }, ...d.pets].map(p => {
              const active = petFilter === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setPetFilter(active ? 'all' : p.id)}
                  activeOpacity={0.75}
                  style={[styles.filterChip, active
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: isDark ? '#1A1030' : '#F3F0FF', borderColor: isDark ? '#2A1F48' : '#DDD6FE' }]}
                >
                  <Text style={styles.filterIcon}>{p.emoji ?? '🐾'}</Text>
                  <Text style={[styles.filterLabel, { color: active ? '#fff' : colors.textSecondary }]}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Date group filter — only when notifications span multiple groups */}
        {d.availableGroups.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {['all', ...d.availableGroups].map(g => {
              const active = dateFilter === g;
              const label  = g === 'all' ? '📅 All Time' : g;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => setDateFilter(active ? 'all' : g)}
                  activeOpacity={0.75}
                  style={[styles.filterChip, active
                    ? { backgroundColor: isDark ? '#7C3AED' : '#6D28D9', borderColor: isDark ? '#7C3AED' : '#6D28D9' }
                    : { backgroundColor: isDark ? '#1A1030' : '#F3F0FF', borderColor: isDark ? '#2A1F48' : '#DDD6FE' }]}
                >
                  <Text style={[styles.filterLabel, { color: active ? '#fff' : colors.textSecondary }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {d.loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PawBondLoader size={52} isDark={isDark} />
        </View>
      ) : d.sections.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: isDark ? '#1A1030' : '#EDE9FC' }]}>
            <Text style={{ fontSize: 36 }}>🔔</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All caught up!</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            Lost pet alerts, appointment reminders{'\n'}and family updates will appear here.
          </Text>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={d.flatItems}
          keyExtractor={fi => fi.kind === 'header' ? `h:${fi.title}` : fi.item.id}
          renderItem={({ item: fi }) => {
            if (fi.kind === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: isDark ? '#3A2A5A' : '#DDD6FE' }]} />
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{fi.title}</Text>
                  <View style={[styles.sectionLine, { backgroundColor: isDark ? '#2A1F48' : '#EDE9FC' }]} />
                </View>
              );
            }
            return (
              <NotifCard
                item={fi.item}
                isRead={fi.item.read || d.readIds.has(fi.item.id)}
                isSelected={sel.selected.has(fi.item.id)}
                isExpanded={d.expandedIds.has(fi.item.id)}
                selecting={sel.selecting}
                colors={colors}
                isDark={isDark}
                pets={d.pets}
                onPress={handlePress}
                onLongPress={handleLongPress}
                onViewProfile={handleViewProfile}
                onCareAction={d.handleCareAction}
              />
            );
          }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={d.refreshing}
              onRefresh={() => { d.setRefreshing(true); d.load(false); }}
              tintColor={colors.primary}
            />
          }
        />
      )}

      <Animated.View
        style={[styles.toolbar, { transform: [{ translateY: sel.toolbarY }] }]}
        pointerEvents={sel.selecting ? 'auto' : 'none'}
      >
        <View style={[styles.toolbarInner, {
          backgroundColor: isDark ? '#1A1030F5' : '#FFFFFFF5',
          borderColor: isDark ? '#3A2A5A' : '#DDD6FE',
        }]}>
          <TouchableOpacity style={styles.tbBtn} onPress={() => sel.setSelecting(false)}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
            <Text style={[styles.tbLabel, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: isDark ? '#3A2A5A' : '#DDD6FE' }]} />
          <Text style={[styles.selCount, { color: colors.textPrimary }]}>{sel.selected.size} selected</Text>
          <View style={[styles.divider, { backgroundColor: isDark ? '#3A2A5A' : '#DDD6FE' }]} />
          <TouchableOpacity style={styles.tbBtn} onPress={() => isAllSelected ? sel.setSelected(new Set()) : sel.setSelected(new Set(d.allIds))}>
            <Ionicons name={isAllSelected ? 'checkmark-done-circle' : 'checkmark-done-circle-outline'} size={22} color={colors.primaryText ?? colors.primary} />
            <Text style={[styles.tbLabel, { color: colors.primaryText ?? colors.primary }]}>All</Text>
          </TouchableOpacity>
          {selHasUnread && (
            <TouchableOpacity style={styles.tbBtn} onPress={() => { d.markRead([...sel.selected]); sel.setSelecting(false); }}>
              <Ionicons name="mail-open-outline" size={22} color="#1D9E75" />
              <Text style={[styles.tbLabel, { color: '#1D9E75' }]}>Read</Text>
            </TouchableOpacity>
          )}
          {selHasRead && (
            <TouchableOpacity style={styles.tbBtn} onPress={() => { d.markUnread([...sel.selected]); sel.setSelecting(false); }}>
              <Ionicons name="mail-outline" size={22} color={colors.primaryText ?? colors.primary} />
              <Text style={[styles.tbLabel, { color: colors.primaryText ?? colors.primary }]}>Unread</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.tbBtn} onPress={() => { d.removeNotifs([...sel.selected]); sel.setSelecting(false); }} disabled={sel.selected.size === 0}>
            <Ionicons name="trash-outline" size={22} color={sel.selected.size > 0 ? '#E24B4A' : colors.textSecondary} />
            <Text style={[styles.tbLabel, { color: sel.selected.size > 0 ? '#E24B4A' : colors.textSecondary }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle:   { fontSize: TYPO.hero, fontWeight: '800', letterSpacing: -0.5 },
  headerSub:     { fontSize: TYPO.body, fontWeight: '600', marginTop: 2 },
  headerRight:   { flexDirection: 'row', gap: 8, marginTop: 6 },
  headerBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1 },
  headerBtnText: { fontSize: TYPO.body, fontWeight: '600' },
  filterRow:     { paddingHorizontal: 20, paddingVertical: 6, paddingBottom: 6, gap: 8 },
  filterChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1 },
  filterIcon:    { fontSize: TYPO.body },
  filterLabel:   { fontSize: TYPO.body, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10 },
  sectionDot:    { width: 6, height: 6, borderRadius: 3 },
  sectionTitle:  { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionLine:   { flex: 1, height: 1 },
  list:          { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 4 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:     { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:    { fontSize: TYPO.heading, fontWeight: '700', marginBottom: 8 },
  emptySub:      { fontSize: TYPO.body, textAlign: 'center', lineHeight: 22 },
  toolbar:       { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: 8 },
  toolbarInner:  { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: -4 }, shadowRadius: 20, elevation: 10 },
  selCount:      { fontSize: TYPO.body, fontWeight: '600', flex: 1 },
  divider:       { width: 1, height: 24, marginHorizontal: 4 },
  tbBtn:         { alignItems: 'center', gap: 2, paddingHorizontal: 10 },
  tbLabel:       { fontSize: TYPO.body, fontWeight: '700' },
});
