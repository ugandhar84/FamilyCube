import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text,  TouchableOpacity, StyleSheet,
  RefreshControl, Modal, ScrollView, Linking, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

function ha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const TYPE_COLORS: Record<string, string> = {
  bug:     '#EF4444',
  ux:      '#F59E0B',
  feature: '#7C5CBF',
  other:   '#6B7280',
};
const TYPE_LABELS: Record<string, string> = {
  bug:     '🐛 Bug',
  ux:      '😕 UX',
  feature: '💡 Feature',
  other:   '💬 Other',
};

type Report = {
  id: string;
  created_at: string;
  user_id: string | null;
  app_name: string | null;
  issue_type: string | null;
  description: string;
  screenshot_url: string | null;
  screenshot_urls: string[] | null;
  app_version: string | null;
  os_name: string | null;
  os_version: string | null;
  device_name: string | null;
  screen_size: string | null;
  user_email?: string | null;
};

const PAGE = 30;

export default function AdminFeedbackScreen() {
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<any>>(null);
  const [reports,    setReports]    = useState<Report[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showGoTop,  setShowGoTop]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState<Report | null>(null);
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [urlLoading, setUrlLoading] = useState(false);
  const [filter,     setFilter]     = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    let q = supabase
      .from('feedback_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (filter) q = q.eq('issue_type', filter);
    const { data, error } = await q;
    if (error) showAlert('Error', error.message);
    else setReports(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Collect all paths for this report (prefer screenshot_urls array, fall back to single)
  const getAttachmentPaths = (r: Report): string[] => {
    if (r.screenshot_urls && r.screenshot_urls.length > 0) return r.screenshot_urls;
    if (r.screenshot_url) return [r.screenshot_url];
    return [];
  };

  const openDetail = async (r: Report) => {
    setSelected(r);
    setSignedUrls([]);
    const paths = getAttachmentPaths(r);
    if (paths.length === 0) return;
    setUrlLoading(true);
    const results = await Promise.all(
      paths.map(p =>
        supabase.storage.from('feedback').createSignedUrl(p, 3600)
      )
    );
    setUrlLoading(false);
    setSignedUrls(
      results.flatMap(({ data, error }) =>
        !error && data?.signedUrl ? [data.signedUrl] : []
      )
    );
  };

  const deleteReport = async (id: string) => {
    showAlert('Delete report', 'Remove this feedback report?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('feedback_reports').delete().eq('id', id);
          setSelected(null);
          load(true);
        },
      },
    ]);
  };

  const FILTERS = [null, 'bug', 'ux', 'feature', 'other'] as const;

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Feedback & Bug Reports' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PawBondLoader size={52} isDark={false} />
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Feedback & Bug Reports' }} />

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ height: 52, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' }}>
        {FILTERS.map(f => {
          const active = filter === f;
          const label  = f === null ? '⭐ All' : (TYPE_LABELS[f] ?? f);
          const color  = f ? TYPE_COLORS[f] : colors.primary;
          return (
            <TouchableOpacity key={String(f)} onPress={() => setFilter(f)}
              style={[s.chip, { borderColor: active ? color : colors.border,
                backgroundColor: active ? ha(color, 0.09) : 'transparent' }]}>
              <Text style={[s.chipText, { color: active ? color : colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlashList
        ref={listRef}
        data={reports}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
        scrollEventThrottle={16}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: TYPO.hero, marginBottom: 8 }}>📬</Text>
            <Text style={[s.empty, { color: colors.textSecondary }]}>No feedback reports yet</Text>
          </View>
        }
        renderItem={({ item: r }) => {
          const typeColor = TYPE_COLORS[r.issue_type ?? 'other'] ?? '#6B7280';
          const typeLabel = TYPE_LABELS[r.issue_type ?? 'other'] ?? r.issue_type;
          const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const attachCount = getAttachmentPaths(r).length;
          return (
            <TouchableOpacity onPress={() => openDetail(r)} activeOpacity={0.8}
              style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.cardHeader}>
                <View style={[s.badge, { backgroundColor: ha(typeColor, 0.13) }]}>
                  <Text style={[s.badgeText, { color: typeColor }]}>{typeLabel}</Text>
                </View>
                <Text style={[s.date, { color: colors.textSecondary }]}>{date}</Text>
                {attachCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="image-outline" size={13} color={colors.textSecondary} />
                    {attachCount > 1 && (
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>{attachCount}</Text>
                    )}
                  </View>
                )}
              </View>
              <Text style={[s.desc, { color: colors.textPrimary }]} numberOfLines={2}>
                {r.description}
              </Text>
              <Text style={[s.meta, { color: colors.textSecondary }]}>
                {r.app_name ?? 'PawBond'} v{r.app_version} · {r.os_name} {r.os_version} · {r.device_name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Report detail</Text>
              <TouchableOpacity onPress={() => deleteReport(selected.id)} hitSlop={12}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
              {/* Type + date */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[s.badge, { backgroundColor: ha(TYPE_COLORS[selected.issue_type ?? 'other'] ?? '#6B7280', 0.13) }]}>
                  <Text style={[s.badgeText, { color: TYPE_COLORS[selected.issue_type ?? 'other'] ?? '#6B7280' }]}>
                    {TYPE_LABELS[selected.issue_type ?? 'other'] ?? selected.issue_type}
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>
                  {new Date(selected.created_at).toLocaleString()}
                </Text>
              </View>

              {/* Description */}
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Description</Text>
                <Text style={[s.sectionBody, { color: colors.textPrimary }]}>{selected.description}</Text>
              </View>

              {/* Attachments */}
              {getAttachmentPaths(selected).length > 0 && (
                <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
                    Attachments ({getAttachmentPaths(selected).length})
                  </Text>

                  {urlLoading && (
                    <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  )}

                  {!urlLoading && signedUrls.length === 0 && (
                    <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>
                      Could not load attachments — storage permission may not be set up yet.
                    </Text>
                  )}

                  {signedUrls.map((url, i) => (
                    <View key={i} style={{ gap: 8 }}>
                      <Image source={{ uri: url }} cachePolicy="memory-disk" style={s.screenshot} contentFit="contain" />
                      <TouchableOpacity
                        onPress={() => Linking.openURL(url)}
                        style={[s.dlBtn, { borderColor: colors.primary }]}
                      >
                        <Ionicons name="download-outline" size={16} color={colors.primary} />
                        <Text style={[s.dlText, { color: colors.primary }]}>
                          Download attachment {signedUrls.length > 1 ? `${i + 1}` : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Device info */}
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Device info</Text>
                {[
                  ['App',    `${selected.app_name ?? 'PawBond'} v${selected.app_version}`],
                  ['OS',     `${selected.os_name} ${selected.os_version}`],
                  ['Device', selected.device_name],
                  ['Screen', selected.screen_size],
                ].map(([lbl, val]) => (
                  <View key={lbl} style={s.metaRow}>
                    <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, width: 60 }}>{lbl}</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: TYPO.body, fontWeight: '600', flex: 1 }}>{val ?? '—'}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
      {showGoTop && (
        <TouchableOpacity
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  chipText:    { fontSize: TYPO.body, fontWeight: '600' },
  card:        { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText:   { fontSize: TYPO.body, fontWeight: '700' },
  date:        { fontSize: TYPO.body, flex: 1 },
  desc:        { fontSize: TYPO.body, lineHeight: 20, marginBottom: 6 },
  meta:        { fontSize: TYPO.body, lineHeight: 16 },
  empty:       { fontSize: TYPO.body },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle:  { fontSize: TYPO.subheading, fontWeight: '700' },
  section:     { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  sectionTitle:{ fontSize: TYPO.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { fontSize: TYPO.body, lineHeight: 21 },
  screenshot:  { width: '100%', height: 220, borderRadius: 10 },
  dlBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5,
                 borderRadius: 10, padding: 10, justifyContent: 'center' },
  dlText:      { fontSize: TYPO.body, fontWeight: '600' },
  metaRow:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
