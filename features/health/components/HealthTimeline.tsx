import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import TeaserGate from '@/components/TeaserGate';
import MonthAccordionTimeline from '@/features/health/components/MonthAccordionTimeline';
import type { TLEvent, TLType } from '@/features/health/components/HealthUtils';
import { TYPO } from '@/constants/theme';

const TL_FILTERS: { key: string; label: string }[] = [
  { key: 'all',         label: 'All'          },
  { key: 'appointment', label: 'Appointments' },
  { key: 'vaccine',     label: 'Vaccines'     },
  { key: 'medication',  label: 'Medications'  },
  { key: 'lab',         label: 'Lab results'  },
  { key: 'weight',      label: 'Weight'       },
  { key: 'allergy',     label: 'Allergies'    },
];

const FREE_HISTORY_DAYS = 14;

interface HealthTimelineProps {
  filteredTL: TLEvent[];
  tlFilter: string;
  setTlFilter: (key: string) => void;
  tlDateFrom: string | null;
  tlDateTo: string | null;
  setTlDateFrom: (d: string | null) => void;
  setTlDateTo: (d: string | null) => void;
  tier: string;
  petName: string | undefined;
  colors: any;
  accent: string;
  monthsShown: number;
  setMonthsShown: React.Dispatch<React.SetStateAction<number>>;
  aiSummaryMap: Record<string, any>;
  s: any;
  typeCfg: Record<string, any>;
  onPressAppt: (ev: TLEvent) => void;
  onPressMed: (ev: TLEvent) => void;
  onToggleMedActive: (id: string, newActive: boolean) => Promise<void>;
  onDeleteEntry: (ev: TLEvent) => void;
  onDeleteGroup: (evs: TLEvent[], label: string) => void;
  onEditEntry?: (ev: TLEvent) => void;
}

export const HealthTimeline = React.memo(function HealthTimeline({
  filteredTL, tlFilter, setTlFilter,
  tlDateFrom, tlDateTo, setTlDateFrom, setTlDateTo,
  tier, petName, colors, accent,
  monthsShown, setMonthsShown, aiSummaryMap, s, typeCfg,
  onPressAppt, onPressMed, onToggleMedActive, onDeleteEntry, onDeleteGroup, onEditEntry,
}: HealthTimelineProps) {
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);
  const hasDateFilter = !!(tlDateFrom || tlDateTo);

  return (
    <>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 7, flexDirection: 'row', paddingBottom: 8 }}>
        {TL_FILTERS.map(f => {
          const active = tlFilter === f.key;
          const cfg = f.key === 'all' ? null : typeCfg[f.key as TLType];
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setTlFilter(f.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                borderWidth: 1, borderColor: active ? (cfg?.color ?? accent) : colors.border,
                backgroundColor: active ? (cfg?.bg ?? accent + '18') : colors.card,
              }}
            >
              {cfg && <Ionicons name={cfg.icon as any} size={12} color={active ? cfg.color : colors.textSecondary} />}
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: active ? (cfg?.color ?? accent) : colors.textSecondary }}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Date range row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Ionicons name="calendar-outline" size={14} color={hasDateFilter ? accent : colors.textSecondary} />
        <TouchableOpacity activeOpacity={0.75} onPress={() => setDatePickerTarget('from')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
            backgroundColor: tlDateFrom ? accent + '18' : colors.card,
            borderWidth: 1, borderColor: tlDateFrom ? accent : colors.border }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: tlDateFrom ? '700' : '500', color: tlDateFrom ? accent : colors.textSecondary }}>
            {tlDateFrom ? format(parseISO(tlDateFrom), 'MMM d, yyyy') : 'From'}
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>–</Text>
        <TouchableOpacity activeOpacity={0.75} onPress={() => setDatePickerTarget('to')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
            backgroundColor: tlDateTo ? accent + '18' : colors.card,
            borderWidth: 1, borderColor: tlDateTo ? accent : colors.border }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: tlDateTo ? '700' : '500', color: tlDateTo ? accent : colors.textSecondary }}>
            {tlDateTo ? format(parseISO(tlDateTo), 'MMM d, yyyy') : 'To'}
          </Text>
        </TouchableOpacity>
        {hasDateFilter && (
          <TouchableOpacity onPress={() => { setTlDateFrom(null); setTlDateTo(null); }}
            style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
            <Ionicons name="close" size={13} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Date picker */}
      <AppDateTimePicker
        visible={!!datePickerTarget}
        mode="date"
        value={datePickerTarget === 'to'
          ? (tlDateTo ? parseISO(tlDateTo) : new Date())
          : (tlDateFrom ? parseISO(tlDateFrom) : new Date())}
        accent={accent}
        onCancel={() => setDatePickerTarget(null)}
        onConfirm={(date) => {
          const ds = format(date, 'yyyy-MM-dd');
          if (datePickerTarget === 'from') {
            setTlDateFrom(ds);
            if (tlDateTo && ds > tlDateTo) setTlDateTo(null);
          } else {
            setTlDateTo(ds);
            if (tlDateFrom && ds < tlDateFrom) setTlDateFrom(null);
          }
          setDatePickerTarget(null);
        }}
      />

      {filteredTL.length === 0 ? (
        <View style={s.tlEmpty}>
          <Ionicons name="document-text-outline" size={36} color={colors.textTertiary} />
          <Text style={s.tlEmptyText}>No records yet</Text>
          <Text style={[s.tlEmptySub, { color: colors.textSecondary }]}>Entries appear here as you log health data or use FurAI</Text>
        </View>
      ) : (() => {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - FREE_HISTORY_DAYS);
        const isFreeTier = tier === 'free';
        const visibleEvents = isFreeTier ? filteredTL.filter(e => new Date(e.date) >= cutoff) : filteredTL;
        const lockedEvents  = isFreeTier ? filteredTL.filter(e => new Date(e.date) < cutoff)  : [];

        return (
          <>
            <MonthAccordionTimeline
              events={visibleEvents}
              colors={colors}
              accent={accent}
              monthsShown={monthsShown}
              onLoadOlder={() => setMonthsShown(n => n + 6)}
              aiSummaryMap={aiSummaryMap}
              onPressAppt={onPressAppt}
              onPressMed={onPressMed}
              onToggleMedActive={onToggleMedActive}
              onDeleteEntry={onDeleteEntry}
              onDeleteGroup={onDeleteGroup}
              onEditEntry={onEditEntry}
            />
            {lockedEvents.length > 0 && (
              <TeaserGate
                locked
                headline={`Don't lose track of ${petName ?? 'your baby'}'s health trends.`}
                body={`Free accounts show the last ${FREE_HISTORY_DAYS} days. Upgrade to Pro to unlock every vet visit, vaccine record, and weight change — stored for life.`}
                ctaLabel={`Secure ${petName ?? 'your baby'}'s records`}
                petName={petName}
                minHeight={200}
              >
                <MonthAccordionTimeline
                  events={lockedEvents}
                  colors={colors}
                  accent={accent}
                  monthsShown={monthsShown}
                  onLoadOlder={() => {}}
                  aiSummaryMap={aiSummaryMap}
                  onPressAppt={() => {}}
                  onPressMed={() => {}}
                  onToggleMedActive={async () => {}}
                  onDeleteEntry={() => {}}
                  onDeleteGroup={() => {}}
                />
              </TeaserGate>
            )}
          </>
        );
      })()}
    </>
  );
});
