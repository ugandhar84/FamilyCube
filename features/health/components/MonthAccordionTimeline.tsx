import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { toTitle } from '@/lib/format';
import { usesImperial } from '@/lib/units';
import { getTypeCfg, safeISO, type TLEvent, type TLType } from '@/features/health/components/HealthUtils';
import { TYPO } from '@/constants/theme';

// ─── MonthAccordionTimeline ────────────────────────────────────────────────────

interface MonthAccordionTimelineProps {
  events: TLEvent[];
  colors: any;
  accent: string;
  monthsShown: number;
  onLoadOlder: () => void;
  aiSummaryMap: Record<string, string>;
  onPressAppt: (ev: TLEvent) => void;
  onPressMed: (ev: TLEvent) => void;
  onToggleMedActive: (id: string, newActive: boolean) => void;
  onDeleteEntry: (ev: TLEvent) => void;
  onDeleteGroup: (evs: TLEvent[], label: string) => void;
}

const MonthAccordionTimeline = React.memo(function MonthAccordionTimeline({
  events, colors, accent, monthsShown, onLoadOlder, aiSummaryMap,
  onPressAppt, onPressMed, onToggleMedActive, onDeleteEntry, onDeleteGroup,
}: MonthAccordionTimelineProps) {
  const TYPE_CFG = useMemo(() => getTypeCfg(colors), [colors]);

  const monthGroups = useMemo(() => {
    const map = new Map<string, TLEvent[]>();
    for (const ev of events) {
      const key = ev.date ? ev.date.slice(0, 7) : 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  const allMonths   = monthGroups.map(([k]) => k);
  const shownMonths = allMonths.slice(0, monthsShown);
  const hasOlder    = allMonths.length > monthsShown;
  const oldestShown = shownMonths[shownMonths.length - 1];

  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set([currentMonthKey]));
  const toggleMonth = (key: string) =>
    setOpenMonths(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const press = (ev: TLEvent) => {
    if (ev.type === 'appointment') onPressAppt(ev);
    else if (ev.type === 'medication') onPressMed(ev);
    else if (ev.type === 'vaccine') router.push('/health/vaccines');
  };

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const renderItem = (ev: TLEvent, dateKey: string, isLast: boolean, groupKey?: string) => {
    const cfg = TYPE_CFG[ev.type];
    const tappable = ev.type === 'appointment' || ev.type === 'medication' || ev.type === 'vaccine';
    const isPastDate   = dateKey < todayKey;
    const isFutureDate = dateKey > todayKey;
    const iconBg    = isPastDate ? colors.background : isFutureDate ? colors.primaryLight : cfg.bg;
    const iconColor = isPastDate ? colors.textDisabled : isFutureDate ? colors.primary : cfg.color;
    const titleOpacity = isPastDate ? 0.55 : 1;
    return (
      <TouchableOpacity
        key={ev.id}
        style={{
          flexDirection: 'row', alignItems: 'flex-start', padding: 13, gap: 10,
          backgroundColor: colors.card,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
        activeOpacity={tappable ? 0.7 : 1}
        onPress={() => { if (groupKey) toggleGroup(groupKey); press(ev); }}
        onLongPress={() => onDeleteEntry(ev)}
        delayLongPress={500}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name={cfg.icon as any} size={17} color={iconColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0, opacity: titleOpacity }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
            {ev.title}
          </Text>
          <SingleItemDetail ev={ev} cfg={cfg} colors={colors} onToggleMedActive={onToggleMedActive} />
        </View>
        {tappable && <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} style={{ marginTop: 2 }} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>

      {hasOlder && (
        <TouchableOpacity
          onPress={onLoadOlder}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10, marginBottom: 8, borderRadius: 20,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card }}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '500' }}>
            Load records before {(() => { const d = safeISO(oldestShown + '-01'); return d ? format(d, 'MMM yyyy') : oldestShown; })()}
          </Text>
        </TouchableOpacity>
      )}

      {shownMonths.map(monthKey => {
        const monthEvents = monthGroups.find(([k]) => k === monthKey)?.[1] ?? [];
        const isOpen = openMonths.has(monthKey);
        const monthDate = safeISO(monthKey + '-01');
        const monthLabel = monthDate ? format(monthDate, 'MMMM yyyy') : monthKey;
        const isCurrentMonth = monthKey === currentMonthKey;
        const isFutureMonth  = monthKey > currentMonthKey;
        const isPastMonth    = monthKey < currentMonthKey;
        const monthDotColor  = isFutureMonth ? colors.primary : isPastMonth ? colors.textDisabled : accent;

        const typeCounts = (Object.keys(TYPE_CFG) as TLType[]).map(t => ({
          type: t, cfg: TYPE_CFG[t], count: monthEvents.filter(e => e.type === t).length,
        })).filter(t => t.count > 0);

        const dateMap = new Map<string, TLEvent[]>();
        for (const ev of monthEvents) {
          const dk = ev.date ? ev.date.slice(0, 10) : 'unknown';
          if (!dateMap.has(dk)) dateMap.set(dk, []);
          dateMap.get(dk)!.push(ev);
        }
        const dateEntries = Array.from(dateMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

        return (
          <View key={monthKey} style={{ marginBottom: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: isOpen ? accent + '40' : colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>

            {/* Month header */}
            <TouchableOpacity onPress={() => toggleMonth(monthKey)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOpen ? monthDotColor : colors.textTertiary, marginRight: 10 }} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{monthLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: isOpen ? accent + '18' : colors.background }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isOpen ? accent : colors.textSecondary }}>
                    {monthEvents.length} record{monthEvents.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* Collapsed preview pills */}
            {!isOpen && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 12 }}>
                {typeCounts.map(({ type, cfg, count }) => (
                  <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: cfg.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: cfg.color + '30' }}>
                    <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
                    <Text style={{ fontSize: TYPO.body, color: cfg.color, fontWeight: '500' }}>
                      {count} {cfg.label.toLowerCase()}{count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Expanded */}
            {isOpen && (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                {dateEntries.map(([dateKey, dayEvents], di) => {
                  const dayDate = dateKey !== 'unknown' ? safeISO(dateKey) : null;
                  const todayKeyInner    = format(new Date(), 'yyyy-MM-dd');
                  const yesterdayKey = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
                  const isToday   = dateKey === todayKeyInner;
                  const isFuture  = dateKey > todayKeyInner;
                  const dayLabel  = isToday ? 'Today' : dateKey === yesterdayKey ? 'Yesterday' : dayDate ? format(dayDate, 'EEE, MMM d') : 'Unknown';
                  const dayLabelColor = isToday ? accent : isFuture ? colors.primary : colors.textDisabled;
                  const isLastDay = di === dateEntries.length - 1;

                  const catGroups = (Object.keys(TYPE_CFG) as TLType[])
                    .map(type => ({ type, items: dayEvents.filter(e => e.type === type), cfg: TYPE_CFG[type] }))
                    .filter(g => g.items.length > 0);

                  return (
                    <View key={dateKey} style={{ borderBottomWidth: isLastDay ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                      {/* Day divider */}
                      <View style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.background + 'CC', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: dayLabelColor }} />
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: dayLabelColor, letterSpacing: 0.3 }}>
                          {dayLabel.toUpperCase()}
                        </Text>
                      </View>

                      {/* AI summary */}
                      {aiSummaryMap[dateKey] && (
                        <View style={{ marginHorizontal: 10, marginBottom: 6, backgroundColor: accent + '10', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 6 }}>
                          <Ionicons name="sparkles-outline" size={12} color={accent} style={{ marginTop: 1 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: accent, letterSpacing: 0.4, marginBottom: 2 }}>FURAI SUMMARY</Text>
                            <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, lineHeight: 17 }}>{aiSummaryMap[dateKey]}</Text>
                          </View>
                        </View>
                      )}

                      {catGroups.map((grp, ci) => {
                        const isLastCat = ci === catGroups.length - 1;
                        const groupKey = `${dateKey}-${grp.type}`;
                        const isGroupOpen = expanded.has(groupKey);
                        const forceGrouped = grp.type === 'medication' || grp.type === 'lab';

                        if (grp.items.length === 1 && !forceGrouped) {
                          return (
                            <View key={groupKey} style={{ borderTopWidth: ci === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                              {renderItem(grp.items[0], dateKey, isLastCat && isLastDay, undefined)}
                            </View>
                          );
                        }

                        return (
                          <View key={groupKey} style={{ borderTopWidth: ci === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                            <TouchableOpacity
                              onPress={() => toggleGroup(groupKey)}
                              onLongPress={() => onDeleteGroup(grp.items, `${grp.cfg.label.toLowerCase()}s`)}
                              delayLongPress={500}
                              style={{ flexDirection: 'row', alignItems: 'center', padding: 13, gap: 10 }}>
                              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: grp.cfg.bg, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name={grp.cfg.icon as any} size={17} color={grp.cfg.color} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{grp.cfg.label}s</Text>
                                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{grp.items.length} records</Text>
                              </View>
                              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: grp.cfg.bg }}>
                                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: grp.cfg.color }}>{grp.items.length}</Text>
                              </View>
                              <Ionicons name={isGroupOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
                            </TouchableOpacity>
                            {isGroupOpen && (
                              <View style={{ marginHorizontal: 8, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: grp.cfg.color + '30', borderRadius: 12, overflow: 'hidden' }}>
                                {grp.items.map((ev, ei) => renderItem(ev, dateKey, ei === grp.items.length - 1, groupKey))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {!hasOlder && monthGroups.length > 0 && (
        <Text style={{ textAlign: 'center', fontSize: TYPO.body, color: colors.textSecondary, paddingVertical: 8 }}>
          All records shown · Long-press any entry to delete
        </Text>
      )}
    </View>
  );
});

export default MonthAccordionTimeline;

// ─── SingleItemDetail ─────────────────────────────────────────────────────────

interface SingleItemDetailProps {
  ev: TLEvent;
  cfg: { label: string; color: string; bg: string; icon: string };
  colors: any;
  onToggleMedActive?: (id: string, newActive: boolean) => void;
}

export function SingleItemDetail({ ev, cfg, colors, onToggleMedActive }: SingleItemDetailProps) {
  if (ev.type === 'lab') {
    const explanation = ev.raw.interpretation ?? ev.raw.notes;
    const value = ev.raw.result_value ?? ev.raw.result;
    return (
      <>
        {explanation && (
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 17, marginBottom: 5 }} numberOfLines={4}>
            {explanation}
          </Text>
        )}
        {value && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, fontFamily: 'monospace' }}>
              {value}{ev.raw.unit ? ` ${ev.raw.unit}` : ''}
            </Text>
            {ev.raw.is_abnormal === true && (
              <View style={{ backgroundColor: colors.dangerLight, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.danger }}>ABNORMAL</Text>
              </View>
            )}
            {ev.raw.is_abnormal === false && (
              <View style={{ backgroundColor: colors.successLight, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.success }}>NORMAL</Text>
              </View>
            )}
            {ev.raw.reference_range && (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Ref: {ev.raw.reference_range}</Text>
            )}
          </View>
        )}
      </>
    );
  }

  if (ev.type === 'medication') {
    return (
      <>
        {ev.raw.notes && (
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 17, marginBottom: 5 }} numberOfLines={4}>
            {ev.raw.notes}
          </Text>
        )}
        {(ev.raw.dosage || ev.raw.frequency) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="medical-outline" size={11} color={cfg.color} />
              <Text style={{ fontSize: TYPO.body, color: cfg.color, fontWeight: '600' }}>
                {[ev.raw.dosage, ev.raw.frequency ? toTitle(ev.raw.frequency.replace(/_/g, ' ')) : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onToggleMedActive?.(ev.raw.id, !ev.raw.is_active)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
                backgroundColor: ev.raw.is_active ? colors.success + '18' : colors.textDisabled + '18',
                borderWidth: 1,
                borderColor: ev.raw.is_active ? colors.success + '40' : colors.textDisabled + '40',
              }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ev.raw.is_active ? colors.success : colors.textDisabled }} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ev.raw.is_active ? colors.success : colors.textDisabled }}>
                {ev.raw.is_active ? 'Active' : 'Stopped'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  }

  if (ev.type === 'vaccine') {
    return (
      <>
        {ev.raw.notes && (
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 17, marginBottom: 5 }} numberOfLines={4}>
            {ev.raw.notes}
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {ev.raw.manufacturer && <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{ev.raw.manufacturer}</Text>}
          {ev.raw.last_given && (
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
              Given {format(parseISO(ev.raw.last_given), 'MMM d, yyyy')}
            </Text>
          )}
          {ev.raw.next_due && (
            <View style={{ backgroundColor: colors.successLight, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.success }}>
                Due {format(parseISO(ev.raw.next_due), 'MMM d, yyyy')}
              </Text>
            </View>
          )}
        </View>
      </>
    );
  }

  if (ev.type === 'appointment') {
    return (
      <>
        {ev.raw.notes && (
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 17, marginBottom: 5 }} numberOfLines={4}>
            {ev.raw.notes}
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, alignItems: 'center' }}>
          {ev.badge && (
            <View style={{
              backgroundColor: (ev.badgeColor ?? cfg.color) + '22',
              borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
              borderWidth: 1, borderColor: (ev.badgeColor ?? cfg.color) + '55',
            }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: ev.badgeColor ?? cfg.color, letterSpacing: 0.3 }}>
                {ev.badge}
              </Text>
            </View>
          )}
          {ev.clinic && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="business-outline" size={10} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{ev.clinic}</Text>
            </View>
          )}
        </View>
      </>
    );
  }

  if (ev.type === 'weight') {
    const imperial = usesImperial();
    const display  = imperial ? (ev.raw.weight_kg * 2.20462).toFixed(1) : ev.raw.weight_kg;
    const unitLbl  = imperial ? 'lb' : 'kg';
    return (
      <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: cfg.color, marginTop: 2 }}>
        {display} <Text style={{ fontSize: TYPO.body, fontWeight: '500', color: colors.textSecondary }}>{unitLbl}</Text>
      </Text>
    );
  }

  if (ev.type === 'allergy') {
    return (
      <>
        {ev.raw.notes && (
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 17, marginBottom: 5 }} numberOfLines={3}>
            {ev.raw.notes}
          </Text>
        )}
        {ev.badge && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{
              backgroundColor:
                ev.raw.severity === 'severe' || ev.raw.severity === 'life_threatening' ? colors.dangerLight
                : ev.raw.severity === 'moderate' ? colors.warningLight : colors.successLight,
              borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
            }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: ev.badgeColor ?? cfg.color }}>
                {ev.badge.toUpperCase()}
              </Text>
            </View>
            {ev.raw.symptoms && (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }} numberOfLines={1}>{ev.raw.symptoms}</Text>
            )}
          </View>
        )}
      </>
    );
  }

  return null;
}
