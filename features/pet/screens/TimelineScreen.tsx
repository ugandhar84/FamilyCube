import { showAlert } from '@/components/AppAlert';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, Share, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { getSharedTimeline } from '@/lib/db/timeline';
import { TYPO } from '@/constants/theme';

const { width } = Dimensions.get('window');

interface TimelineEntry {
  id: string;
  title: string;
  description: string;
  event_date: string;
  category: 'milestone' | 'health' | 'achievement' | 'moment';
  is_pinned: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  milestone: '#7C5CBF',
  health: '#E74C3C',
  achievement: '#F39C12',
  moment: '#3498DB',
};

const CATEGORY_ICONS: Record<string, string> = {
  milestone: 'star',
  health: 'heart',
  achievement: 'checkmark-circle',
  moment: 'camera',
};

export default function SharedTimelineScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [petName, setPetName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    loadTimeline();
  }, [token]);

  const loadTimeline = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const { entries: data, pet_id } = await getSharedTimeline(token);
      setEntries(data);

      // Try to fetch pet name
      const { data: petData } = await (
        await import('@/lib/supabase')
      ).supabase
        .from('pets')
        .select('name')
        .eq('id', pet_id)
        .maybeSingle();

      setPetName(petData?.name ?? 'Pet');
    } catch (err: any) {
      setError('Could not load timeline. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleShare = useCallback(async () => {
    if (!token) return;
    const shareUrl = `https://pawbond.app/timeline/${token}`;
    try {
      await Share.share({
        message: `Check out ${petName}'s timeline! 🐾\n\n${shareUrl}`,
        url: shareUrl,
        title: `${petName}'s Pet Timeline`,
      });
    } catch (err: any) {
      showAlert('Error', err.message);
    }
  }, [token, petName]);

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Timeline</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primaryText ?? colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Timeline</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="alert-circle" size={48} color={colors.textTertiary} style={{ marginBottom: 16 }} />
          <Text style={[s.errorTitle, { color: colors.textPrimary }]}>{error}</Text>
          <TouchableOpacity
            style={[s.backBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{petName}'s Timeline</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="share-social" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: 24 }}>
        {entries.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 60 }}>
            <Ionicons name="albums-outline" size={40} color={colors.textTertiary} style={{ marginBottom: 12 }} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No timeline entries yet</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12, paddingTop: 16 }}>
            <Text style={[s.subtitle, { color: colors.textSecondary }]}>
              {entries.length} {entries.length === 1 ? 'milestone' : 'milestones'} in {petName}'s story
            </Text>

            {/* Timeline visualization */}
            <View style={{ marginTop: 20 }}>
              {entries.map((entry, idx) => {
                const catColor = CATEGORY_COLORS[entry.category] || '#7C5CBF';
                const catIcon = CATEGORY_ICONS[entry.category] || 'star';
                const isExpanded = expanded === entry.id;
                const isFirst = idx === 0;
                const isLast = idx === entries.length - 1;

                return (
                  <View key={entry.id} style={{ marginBottom: 20 }}>
                    {/* Timeline connector */}
                    {!isLast && (
                      <View
                        style={[
                          s.connector,
                          { backgroundColor: catColor, left: 20, top: 32, height: 60 },
                        ]}
                      />
                    )}

                    {/* Timeline dot and card */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                      <View style={{ alignItems: 'center', width: 40 }}>
                        <View
                          style={[
                            s.dot,
                            { backgroundColor: catColor },
                            entry.is_pinned && { borderColor: '#FFD700', borderWidth: 2 },
                          ]}>
                          <Ionicons name={catIcon as any} size={14} color="#fff" />
                        </View>
                      </View>

                      {/* Card */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setExpanded(isExpanded ? null : entry.id)}
                        style={[
                          s.card,
                          { backgroundColor: colors.card, borderColor: catColor },
                          { flex: 1 },
                        ]}>
                        {/* Date and title */}
                        <Text style={[s.date, { color: colors.textSecondary }]}>
                          {new Date(entry.event_date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </Text>
                        <Text style={[s.entryTitle, { color: colors.textPrimary }]}>
                          {entry.title}
                        </Text>

                        {/* Description */}
                        {isExpanded && (
                          <Text style={[s.description, { color: colors.textSecondary, marginTop: 8 }]}>
                            {entry.description}
                          </Text>
                        )}

                        {/* Category badge */}
                        <View
                          style={[
                            s.badge,
                            { backgroundColor: `${catColor}20`, marginTop: isExpanded ? 10 : 8 },
                          ]}>
                          <Text style={[s.badgeText, { color: catColor }]}>
                            {entry.category}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={[
          s.footer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
        ]}>
        <Text style={[s.footerText, { color: colors.textSecondary }]}>
          Shared timeline powered by PawBond 🐾
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: TYPO.subheading, fontWeight: '700', flex: 1, textAlign: 'center' },
  subtitle: { fontSize: TYPO.body, fontWeight: '600', textAlign: 'center' },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: { position: 'absolute', width: 2 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flex: 1,
  },
  date: { fontSize: TYPO.body, fontWeight: '600', marginBottom: 6 },
  entryTitle: { fontSize: TYPO.body, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: TYPO.body, lineHeight: 18, marginBottom: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: TYPO.body, fontWeight: '600', textTransform: 'capitalize' },
  emptyTitle: { fontSize: TYPO.subheading, fontWeight: '700', textAlign: 'center' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  footerText: { fontSize: TYPO.body, textAlign: 'center' },
  backBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 16 },
  errorTitle: { fontSize: TYPO.subheading, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
});
