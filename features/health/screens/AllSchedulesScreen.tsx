import { showAlert } from '@/components/AppAlert';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { getTodayScheduleAllPets, markScheduleItemDone, type TodayItem } from '@/lib/weather';
import { updateAppointmentStatus } from '@/lib/db/appointments';
import { insertChecklistItem } from '@/lib/db/daily';
import { format } from 'date-fns';
import { TYPO } from '@/constants/theme';

export default function AllSchedulesScreen() {
  const { colors, isDark } = useTheme();
  const { pets } = usePetStore(useShallow(s => ({ pets: s.pets })));
  const { user } = useAuthStore();
  const [items, setItems] = useState<TodayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(''));
  };

  const TEAL  = colors.primary ?? '#1DC8BC';
  const AMBER = isDark ? '#F0A832' : '#B87800';
  const CORAL = isDark ? '#E86F6F' : '#CC4F4F';

  const load = useCallback(async () => {
    if (!pets.length) return;
    const petMeta = pets.map(p => ({ id: p.id, name: p.name, emoji: (p as any).emoji ?? '🐾' }));
    const result = await getTodayScheduleAllPets(pets.map(p => p.id), petMeta);
    setItems(result);
  }, [pets]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // Re-fetch when navigating back to this screen so it stays in sync with
  // any mark-done actions taken on the home page or other screens.
  const lastFocusFetch = useRef(0);
  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastFocusFetch.current < 5000) return; // debounce 5 s
    lastFocusFetch.current = now;
    load();
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };


  const handleMedDone = async (item: TodayItem) => {
    markScheduleItemDone(item.id);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const nowIso = new Date().toISOString();
    // Immediately update the Zustand checklist so Care Daily Log circles reflect the change
    usePetStore.setState((s: any) => ({
      checklist: {
        ...s.checklist,
        [item.petId]: [
          ...(s.checklist[item.petId] ?? []),
          {
            id: `optimistic-${item.id}`,
            pet_id: item.petId,
            date: todayStr,
            type: 'medicine',
            label: item.title,
            completed: true,
            completed_by: user?.id ?? null,
            completed_at: nowIso,
            due_time: null,
            created_at: nowIso,
          },
        ],
      },
    }));
    // Remove from UI immediately
    setItems(prev => prev.filter(i => i.id !== item.id));
    showToast(`✅ ${item.title} marked as given`);
    try {
      await insertChecklistItem({
        pet_id: item.petId, date: todayStr, type: 'medicine',
        label: item.title, completed: true,
        completed_by: user?.id ?? null, completed_at: nowIso,
      });
      usePetStore.getState().fetchChecklist(item.petId, todayStr);
    } catch {
      // Rollback optimistic checklist entry and restore item in list
      usePetStore.setState((s: any) => ({
        checklist: {
          ...s.checklist,
          [item.petId]: (s.checklist[item.petId] ?? []).filter(
            (i: any) => i.id !== `optimistic-${item.id}`,
          ),
        },
      }));
      setItems(prev => [...prev, item].sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return a.sortTime - b.sortTime;
      }));
    }
  };

  const handleApptOverdue = (item: TodayItem) => {
    if (!item.apptId) return;
    showAlert(
      'Mark as Completed?',
      `"${item.title}" was scheduled for ${item.timeLabel}.\nMark it as done?`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark as Done',
          onPress: async () => {
            markScheduleItemDone(item.id);
            setItems(prev => prev.filter(i => i.id !== item.id));
            showToast(`✅ ${item.title} marked as done`);
            try {
              await updateAppointmentStatus(item.apptId!, 'completed');
            } catch {
              // Rollback
              setItems(prev => [...prev, item].sort((a, b) => {
                if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
                return a.sortTime - b.sortTime;
              }));
            }
          },
        },
      ],
    );
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (item: TodayItem) => {
    if (item.isOverdue && item.type === 'appointment') { handleApptOverdue(item); return; }
    setExpandedId(prev => prev === item.id ? null : item.id);
  };

  const todayLabel = format(new Date(), 'EEEE, MMMM d');
  const pending = items.filter(i => !i.isOverdue).length;
  const overdue = items.filter(i => i.isOverdue).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Toast */}
      {toast !== '' && (
        <Animated.View style={{
          position: 'absolute', bottom: 32, left: 24, right: 24, zIndex: 999,
          backgroundColor: '#1C1C1E', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12,
          opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}>
          <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '600', textAlign: 'center' }}>{toast}</Text>
        </Animated.View>
      )}
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>
            Today's Schedule
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{todayLabel} · All pets</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {overdue > 0 && (
            <View style={{ backgroundColor: CORAL + '22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: CORAL }}>{overdue} overdue</Text>
            </View>
          )}
          {pending > 0 && (
            <View style={{ backgroundColor: TEAL + '22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: TEAL }}>{pending} pending</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PawBondLoader size={52} isDark={isDark} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16, gap: 8 }}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>
                All clear today!
              </Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
                No appointments or medications{'\n'}scheduled across any pets
              </Text>
            </View>
          ) : (
            items.map((item) => {
              const isMed      = item.type === 'medication';
              const isOverdue  = item.isOverdue;
              const accentColor = isOverdue ? CORAL : isMed ? AMBER : TEAL;
              const isExpanded  = expandedId === item.id;

              const detailRows = isMed ? [
                item.medDosage    && { icon: 'fitness-outline' as const,       label: 'Dosage',    value: item.medDosage },
                item.medFrequency && { icon: 'repeat-outline' as const,        label: 'Frequency', value: item.medFrequency.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
                item.medStartDate && { icon: 'calendar-outline' as const,      label: 'Started',   value: format(new Date(item.medStartDate), 'MMM d, yyyy') },
                item.medEndDate   && { icon: 'calendar-outline' as const,      label: 'Ends',      value: format(new Date(item.medEndDate), 'MMM d, yyyy') },
                item.medNotes     && { icon: 'document-text-outline' as const, label: 'Notes',     value: item.medNotes },
              ].filter(Boolean) as { icon: any; label: string; value: string }[] : [
                item.apptType          && { icon: 'medical-outline' as const,       label: 'Type',    value: item.apptType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
                item.apptVetName       && { icon: 'person-outline' as const,        label: 'Vet',     value: item.apptVetName },
                item.apptVetPhone      && { icon: 'call-outline' as const,          label: 'Phone',   value: item.apptVetPhone },
                item.apptClinicName    && { icon: 'business-outline' as const,      label: 'Clinic',  value: item.apptClinicName },
                item.apptClinicAddress && { icon: 'map-outline' as const,           label: 'Address', value: item.apptClinicAddress },
                item.apptCost != null  && { icon: 'card-outline' as const,          label: 'Cost',    value: `$${Number(item.apptCost).toFixed(2)}` },
                item.apptNotes         && { icon: 'document-text-outline' as const, label: 'Notes',   value: item.apptNotes },
              ].filter(Boolean) as { icon: any; label: string; value: string }[];

              return (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: colors.surface, borderRadius: 14,
                    borderWidth: 1, overflow: 'hidden',
                    borderColor: isOverdue ? CORAL + '40' : (colors.border ?? (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)')),
                  }}
                >
                  {/* Tappable header row */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => toggleExpand(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
                  >
                    {/* Left accent bar */}
                    <View style={{ width: 3, height: 44, borderRadius: 2, flexShrink: 0, backgroundColor: accentColor }} />

                    {/* Main content */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{item.title}</Text>
                        {isOverdue && (
                          <View style={{ backgroundColor: CORAL + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: CORAL, letterSpacing: 0.5 }}>OVERDUE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>{item.subtitle}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: isOverdue ? CORAL : colors.textSecondary, fontVariant: ['tabular-nums'] }}>
                          {item.timeLabel}
                        </Text>
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>·</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: TYPO.caption }}>{item.petEmoji}</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>{item.petName}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Chevron */}
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary ?? colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                      {detailRows.length > 0 && (
                        <View style={{ borderRadius: 10, borderWidth: 1, overflow: 'hidden', borderColor: accentColor + '30', backgroundColor: isDark ? colors.card + 'CC' : colors.background, marginBottom: 10 }}>
                          {detailRows.map((r, i) => (
                            <View key={r.label} style={{
                              flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                              paddingHorizontal: 12, paddingVertical: 9,
                              borderBottomWidth: i < detailRows.length - 1 ? 1 : 0,
                              borderBottomColor: colors.border,
                            }}>
                              <Ionicons name={r.icon} size={14} color={accentColor} style={{ marginTop: 2 }} />
                              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, width: 68 }}>{r.label}</Text>
                              <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, flex: 1, fontWeight: '500' }}>{r.value}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {/* Action button */}
                      {isMed && (
                        <TouchableOpacity
                          onPress={() => showAlert('Mark as given?', `Record ${item.title} as given to ${item.petName}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Mark as Given', onPress: () => { handleMedDone(item); setExpandedId(null); } },
                          ])}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 9, backgroundColor: AMBER + '18', borderWidth: 1, borderColor: AMBER + '50' }}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color={AMBER} />
                          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: AMBER }}>Mark as Given</Text>
                        </TouchableOpacity>
                      )}
                      {item.type === 'appointment' && isOverdue && (
                        <TouchableOpacity
                          onPress={() => { handleApptOverdue(item); setExpandedId(null); }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 9, backgroundColor: CORAL + '18', borderWidth: 1, borderColor: CORAL + '50' }}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color={CORAL} />
                          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: CORAL }}>Mark as Completed</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
