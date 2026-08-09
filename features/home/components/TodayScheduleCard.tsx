/**
 * TodayScheduleCard — today's appointments and medications on the Home screen.
 *
 * Renders a compact list of up to 5 TodayItems (appointments + medication reminders)
 * sorted by time. Each row is tappable to expand an inline detail panel:
 *  - Medication rows show dosage, frequency, start/end dates, and a "Mark as Given" button.
 *  - Appointment rows show type, vet, clinic, phone, address (tappable to dial/map), and cost.
 *  - Overdue appointments bypass the expand and immediately call onApptOverdue.
 *
 * More than 5 items shows a "See all" link to the full schedule screen.
 *
 * Memoized: re-renders only when items or colour tokens change.
 */
import React, { memo, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Modal } from 'react-native';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { showAlert } from '@/components/AppAlert';
import type { TodayItem } from '@/lib/weather';
import { TYPO } from '@/constants/theme';

interface TodayScheduleCardProps {
  /** Merged list of appointments and medication reminders due today, sorted by time. */
  items: TodayItem[];
  /** Theme colour tokens. */
  colors: any;
  /** True when the app is in dark mode. */
  isDark: boolean;
  /** Reserved — not currently called; appointment navigation goes via expand panel. */
  onApptPress?: (apptId: string) => void;
  /** Called immediately when an overdue appointment row is tapped (bypasses expand). */
  onApptOverdue: (item: TodayItem) => void;
  /** Called when the user confirms "Mark as Given" for a medication item. */
  onMedDone: (item: TodayItem) => void;
  /** Reserved — not currently called; medication detail goes via expand panel. */
  onMedPress?: (medId: string, petId: string) => void;
}

export const TodayScheduleCard = memo(function TodayScheduleCard({
  items, colors, isDark,
  onApptOverdue, onMedDone,
}: TodayScheduleCardProps) {
  const TEAL   = colors.primary ?? '#1DC8BC';
  const AMBER  = isDark ? '#F0A832' : '#B87800';
  const CORAL  = isDark ? '#E86F6F' : '#CC4F4F';

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dotColor = (item: TodayItem) => {
    if (item.isOverdue) return CORAL;
    if (item.type === 'medication') return AMBER;
    return TEAL;
  };

  const toggleExpand = (item: TodayItem) => {
    if (item.isOverdue && item.type === 'appointment') { onApptOverdue(item); return; }
    setExpandedId(prev => prev === item.id ? null : item.id);
  };

  const renderExpandedDetail = (item: TodayItem) => {
    const accentColor = item.type === 'medication' ? AMBER : TEAL;
    if (item.type === 'medication') {
      const safeFormatDate = (dateStr?: string) => {
        if (!dateStr) return null;
        try {
          const d = new Date(dateStr);
          return isNaN(d.getTime()) ? null : format(d, 'MMM d, yyyy');
        } catch {
          return null;
        }
      };

      const rows = [
        item.medDosage    && { icon: 'fitness-outline' as const,       label: 'Dosage',    value: item.medDosage },
        item.medFrequency && { icon: 'repeat-outline' as const,        label: 'Frequency', value: item.medFrequency.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
        safeFormatDate(item.medStartDate) && { icon: 'calendar-outline' as const,      label: 'Started',   value: safeFormatDate(item.medStartDate) ?? '' },
        safeFormatDate(item.medEndDate) && { icon: 'calendar-outline' as const,      label: 'Ends',      value: safeFormatDate(item.medEndDate) ?? '' },
        item.medNotes     && { icon: 'document-text-outline' as const, label: 'Notes',     value: item.medNotes },
      ].filter(Boolean) as { icon: any; label: string; value: string }[];

      return (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <View style={{
            borderRadius: 12, borderWidth: 1, overflow: 'hidden',
            backgroundColor: isDark ? colors.card + 'CC' : colors.background,
            borderColor: accentColor + '30',
          }}>
            {rows.map((r, i) => (
              <View key={r.label} style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                paddingHorizontal: 12, paddingVertical: 9,
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}>
                <Ionicons name={r.icon} size={14} color={accentColor} style={{ marginTop: 2 }} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, width: 68 }}>{r.label}</Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, flex: 1, fontWeight: '500' }}>{r.value}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => showAlert(
              'Mark as given?',
              `Record ${item.title} as given to ${item.petName}?`,
              [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark as Given', onPress: () => { onMedDone(item); setExpandedId(null); } }],
            )}
            style={{
              marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, borderRadius: 10, paddingVertical: 9,
              backgroundColor: AMBER + '18', borderWidth: 1, borderColor: AMBER + '50',
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={AMBER} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: AMBER }}>Mark as Given</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Appointment
    const rows = [
      item.apptType        && { icon: 'medical-outline' as const,    label: 'Type',    value: item.apptType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
      item.apptVetName     && { icon: 'person-outline' as const,     label: 'Vet',     value: item.apptVetName },
      item.apptVetPhone    && { icon: 'call-outline' as const,       label: 'Phone',   value: item.apptVetPhone },
      item.apptClinicName  && { icon: 'business-outline' as const,   label: 'Clinic',  value: item.apptClinicName },
      item.apptClinicAddress && { icon: 'map-outline' as const,      label: 'Address', value: item.apptClinicAddress },
      item.apptCost != null  && { icon: 'card-outline' as const,     label: 'Cost',    value: `$${Number(item.apptCost).toFixed(2)}` },
      item.apptNotes       && { icon: 'document-text-outline' as const, label: 'Notes', value: item.apptNotes },
    ].filter(Boolean) as { icon: any; label: string; value: string }[];

    const statusColor = item.apptStatus === 'completed' ? colors.success : item.isOverdue ? CORAL : TEAL;
    return (
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
            backgroundColor: statusColor + '20', borderWidth: 1, borderColor: statusColor + '50',
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: statusColor, textTransform: 'capitalize' }}>
              {item.isOverdue ? 'Overdue' : (item.apptStatus ?? 'scheduled')}
            </Text>
          </View>
        </View>
        {rows.length > 0 && (
          <View style={{
            borderRadius: 12, borderWidth: 1, overflow: 'hidden',
            backgroundColor: isDark ? colors.card + 'CC' : colors.background,
            borderColor: accentColor + '30',
          }}>
            {rows.map((r, i) => (
              <TouchableOpacity
                key={r.label}
                disabled={r.label !== 'Phone' && r.label !== 'Address'}
                activeOpacity={0.7}
                onPress={() => {
                  if (r.label === 'Phone') Linking.openURL(`tel:${r.value}`);
                  if (r.label === 'Address') Linking.openURL(`maps://?q=${encodeURIComponent(r.value)}`).catch(() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(r.value)}`));
                }}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 9,
                  borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Ionicons name={r.icon} size={14} color={accentColor} style={{ marginTop: 2 }} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, width: 56 }}>{r.label}</Text>
                <Text style={{ fontSize: TYPO.caption, color: (r.label === 'Phone' || r.label === 'Address') ? accentColor : colors.textPrimary, flex: 1, fontWeight: '500' }}>{r.value}</Text>
                {(r.label === 'Phone' || r.label === 'Address') && (
                  <Ionicons name="open-outline" size={12} color={accentColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        {item.apptStatus !== 'completed' && (
          <TouchableOpacity
            onPress={() => showAlert(
              'Mark appointment as completed?',
              `Record ${item.title} for ${item.petName} as completed?`,
              [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark as Completed', onPress: () => { onApptOverdue(item); setExpandedId(null); } }],
            )}
            style={{
              marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, borderRadius: 10, paddingVertical: 9,
              backgroundColor: TEAL + '18', borderWidth: 1, borderColor: TEAL + '50',
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={TEAL} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: TEAL }}>Mark as Completed</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View>
      {/* Section header — outside the card */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.9 }}>
            Today's Schedule
          </Text>
          {items.length > 0 && (
            <View style={{ backgroundColor: TEAL + '22', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: TEAL }}>{items.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => router.push('/health/all-schedules' as any)}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: TEAL }}>See all ›</Text>
        </TouchableOpacity>
      </View>

      <View style={{
        marginHorizontal: 16, marginBottom: 4,
        backgroundColor: colors.surface,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        borderWidth: 1,
        borderColor: colors.border ?? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'),
        overflow: 'hidden',
      }}>

      {items.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Text style={{ fontSize: TYPO.body }}>🎉</Text>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>All clear today</Text>
        </View>
      ) : (
        <>
          {items.slice(0, 5).map((item, idx) => {
            const isExpanded = expandedId === item.id;
            const dc = dotColor(item);
            const isLast = idx >= Math.min(items.length, 5) - 1;
            return (
              <View key={item.id} style={{ borderBottomWidth: isLast && !isExpanded ? 0 : 1, borderBottomColor: colors.border ?? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggleExpand(item)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  <Text style={{ width: 44, fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary, fontVariant: ['tabular-nums'], flexShrink: 0 }}>
                    {item.timeLabel}
                  </Text>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dc, flexShrink: 0, shadowColor: dc, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>
                      {item.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: TYPO.caption }}>{item.petEmoji}</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>{item.petName}</Text>
                      </View>
                    </View>
                  </View>
                  {item.isOverdue && item.type === 'appointment' && (
                    <View style={{ backgroundColor: CORAL + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: CORAL, letterSpacing: 0.5 }}>OVERDUE</Text>
                    </View>
                  )}
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary ?? colors.textSecondary} />
                </TouchableOpacity>
                {isExpanded && renderExpandedDetail(item)}
              </View>
            );
          })}
          {items.length > 5 && (
            <TouchableOpacity
              onPress={() => router.push('/health/all-schedules' as any)}
              style={{ paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: TEAL }}>
                +{items.length - 5} more · See all ›
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
    </View>
  );
});
