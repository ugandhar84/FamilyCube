/**
 * TeenGasVehiclePage — full-page Figma/Gemini-rhythm landing page for Gas
 * & Vehicle, replacing TeenGasLogSection's old TeenTileSheet bottom sheet
 * ["Gas and vehical lab laso should have the dedicated landing page with
 * all status /logs"]. Plain View-rooted — no self FullPageOverlay wrap;
 * KidOverlays applies that, matching every other Teen Hub full-page
 * screen's convention.
 *
 * Shows the FULL fill-up and issue-report history (not sliced to the old
 * sheet's top 3/5), plus a form to log a new fill-up or report an issue.
 */
import { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fuel, AlertTriangle, Check, X, TrendingUp } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import { FieldCard, FieldCardSection } from '../kid/forms/shared/FieldCard';

const GAS_LOG_KEY = (memberId: string) => `@familycube_gas_log_${memberId}`;
const ISSUE_LOG_KEY = (memberId: string) => `@familycube_issue_log_${memberId}`;

type GasEntry = { id: string; date: string; gallons: string; odometer: string; note: string; cost?: string };
type IssueEntry = { id: string; date: string; detail: string };
type TabKey = 'fillups' | 'issues' | 'trends';
type TrendPeriod = 'monthly' | 'quarterly' | 'yearly';

// "YYYY-MM-DD" → the bucket key + a human label for that bucket, per period.
function trendBucket(dateStr: string, period: TrendPeriod): { key: string; label: string } | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  if (period === 'monthly') {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return { key, label };
  }
  if (period === 'quarterly') {
    const q = Math.floor(month / 3) + 1;
    return { key: `${year}-Q${q}`, label: `Q${q} '${String(year).slice(2)}` };
  }
  return { key: `${year}`, label: `${year}` };
}

export function TeenGasVehiclePage({
  activeId, today, onReportIssue, onClose,
}: {
  activeId: string; today: string;
  onReportIssue: (detail: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [gasLog, setGasLog] = useState<GasEntry[]>([]);
  const [issueLog, setIssueLog] = useState<IssueEntry[]>([]);
  const [newGallons, setNewGallons] = useState('');
  const [newOdo, setNewOdo] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newGasNote, setNewGasNote] = useState('');
  const [vehicleIssue, setVehicleIssue] = useState('');
  const [issueSent, setIssueSent] = useState(false);
  const [tab, setTab] = useState<TabKey>('fillups');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('monthly');

  const canvas = isDark ? colors.background : GEMINI.canvas;

  useEffect(() => {
    AsyncStorage.getItem(GAS_LOG_KEY(activeId)).then(raw => {
      if (raw) { try { setGasLog(JSON.parse(raw)); } catch { /* ignore */ } }
    });
    AsyncStorage.getItem(ISSUE_LOG_KEY(activeId)).then(raw => {
      if (raw) { try { setIssueLog(JSON.parse(raw)); } catch { /* ignore */ } }
    });
  }, [activeId]);

  const persistGasLog = (log: GasEntry[]) => AsyncStorage.setItem(GAS_LOG_KEY(activeId), JSON.stringify(log));
  const persistIssueLog = (log: IssueEntry[]) => AsyncStorage.setItem(ISSUE_LOG_KEY(activeId), JSON.stringify(log));

  const addGasEntry = () => {
    if (!newGallons.trim()) return;
    const entry: GasEntry = { id: Date.now().toString(), date: today, gallons: newGallons, odometer: newOdo, note: newGasNote, cost: newCost };
    const updated = [entry, ...gasLog];
    setGasLog(updated);
    persistGasLog(updated);
    setNewGallons(''); setNewOdo(''); setNewCost(''); setNewGasNote('');
  };

  // Monthly/quarterly/yearly gallons + spend trends, newest bucket first.
  const trendRows = useMemo(() => {
    const buckets = new Map<string, { label: string; gallons: number; cost: number; count: number }>();
    for (const entry of gasLog) {
      const bucket = trendBucket(entry.date, trendPeriod);
      if (!bucket) continue;
      const existing = buckets.get(bucket.key) ?? { label: bucket.label, gallons: 0, cost: 0, count: 0 };
      existing.gallons += parseFloat(entry.gallons) || 0;
      existing.cost += parseFloat(entry.cost ?? '') || 0;
      existing.count += 1;
      buckets.set(bucket.key, existing);
    }
    return [...buckets.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, v]) => ({ key, ...v }));
  }, [gasLog, trendPeriod]);

  const reportIssue = () => {
    if (!vehicleIssue.trim()) return;
    onReportIssue(vehicleIssue.trim());
    const entry: IssueEntry = { id: Date.now().toString(), date: today, detail: vehicleIssue.trim() };
    const updated = [entry, ...issueLog];
    setIssueLog(updated);
    persistIssueLog(updated);
    setVehicleIssue('');
    setIssueSent(true);
    setTimeout(() => setIssueSent(false), 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          eyebrow="FAMILY CUBE · GAS & VEHICLE"
          title="Gas & Vehicle"
          subtitle="Log fill-ups and keep a record of reported issues."
          accent="primary"
          Icon={Fuel}
          onTitlePress={onClose}
          topInset={insets.top}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ gap: 16 }}>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([
              { key: 'fillups' as TabKey, label: 'Fill-Ups' },
              { key: 'trends' as TabKey, label: 'Trends' },
              { key: 'issues' as TabKey, label: 'Issues' },
            ]).map(({ key, label }) => (
              <Pressable key={key} onPress={() => setTab(key)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                  backgroundColor: tab === key ? colors.success : (isDark ? colors.surface : GEMINI.cardBg),
                  borderWidth: 1, borderColor: tab === key ? colors.success : colors.border }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                  color: tab === key ? '#fff' : colors.textSecondary }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'trends' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {([
                  { key: 'monthly' as TrendPeriod, label: 'Monthly' },
                  { key: 'quarterly' as TrendPeriod, label: 'Quarterly' },
                  { key: 'yearly' as TrendPeriod, label: 'Yearly' },
                ]).map(({ key, label }) => (
                  <Pressable key={key} onPress={() => setTrendPeriod(key)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      backgroundColor: trendPeriod === key ? colors.primary : (isDark ? colors.surface : GEMINI.cardBg),
                      borderWidth: 1, borderColor: trendPeriod === key ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                      color: trendPeriod === key ? '#fff' : colors.textSecondary }}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {trendRows.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>
                    Log a fill-up to see trends here.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {trendRows.map(row => (
                    <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 14,
                      backgroundColor: isDark ? colors.primary + '10' : colors.primaryLight,
                      borderWidth: 1, borderColor: colors.primary + '30' }}>
                      <TrendingUp size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                          {row.label}
                        </Text>
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
                          {row.gallons.toFixed(1)} gal · {row.count} fill-up{row.count === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.primary }}>
                        ${row.cost.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : tab === 'fillups' ? (
            <>
              <FieldCardSection title="Log a fill-up" colors={colors} isDark={isDark}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <FieldCard label="Gallons" focused={newGallons.length > 0} colors={colors} isDark={isDark} style={{ flex: 1 }}>
                    <TextInput
                      style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                      placeholder="0.0" placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad" value={newGallons} onChangeText={setNewGallons}
                    />
                  </FieldCard>
                  <FieldCard label="Odometer" focused={newOdo.length > 0} colors={colors} isDark={isDark} style={{ flex: 1 }}>
                    <TextInput
                      style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                      placeholder="mi" placeholderTextColor={colors.textTertiary}
                      keyboardType="number-pad" value={newOdo} onChangeText={setNewOdo}
                    />
                  </FieldCard>
                </View>
                <FieldCard label="Cost ($, optional)" focused={newCost.length > 0} colors={colors} isDark={isDark}>
                  <TextInput
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                    placeholder="0.00" placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad" value={newCost} onChangeText={setNewCost}
                  />
                </FieldCard>
                <FieldCard label="Note (optional)" focused={newGasNote.length > 0} colors={colors} isDark={isDark}>
                  <TextInput
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                    placeholder="e.g. Shell on Main St" placeholderTextColor={colors.textTertiary}
                    value={newGasNote} onChangeText={setNewGasNote}
                  />
                </FieldCard>
              </FieldCardSection>

              <Pressable onPress={addGasEntry} disabled={!newGallons.trim()}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 16, paddingVertical: 15,
                  backgroundColor: newGallons.trim() ? colors.success : colors.surface }}>
                <Fuel size={16} color={newGallons.trim() ? '#fff' : colors.textTertiary} />
                <Text style={{ fontSize: 15, fontWeight: '900', color: newGallons.trim() ? '#fff' : colors.textTertiary }}>
                  Log Fill-Up
                </Text>
              </Pressable>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textSecondary,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  All Fill-Ups ({gasLog.length})
                </Text>
                {gasLog.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>
                      No fill-ups logged yet.
                    </Text>
                  </View>
                ) : (
                  gasLog.map(entry => (
                    <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 14,
                      backgroundColor: isDark ? colors.success + '10' : '#ECFDF5',
                      borderWidth: 1, borderColor: colors.success + '30' }}>
                      <Fuel size={16} color={colors.success} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                          {entry.gallons} gal{entry.odometer ? ` · ${entry.odometer} mi` : ''}
                        </Text>
                        {entry.note ? <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{entry.note}</Text> : null}
                      </View>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{entry.date.slice(5)}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : (
            <>
              <View style={{ backgroundColor: isDark ? colors.danger + '10' : '#FEF2F2', borderRadius: 16,
                borderWidth: 1, borderColor: colors.danger + '30', padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={16} color={colors.danger} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Report Vehicle Issue</Text>
                </View>
                <TextInput
                  placeholder="Describe the issue (e.g. low tire, weird noise)"
                  placeholderTextColor={colors.textTertiary}
                  value={vehicleIssue}
                  onChangeText={setVehicleIssue}
                  style={{ borderWidth: 1, borderColor: colors.danger + '70', borderRadius: 10,
                    padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
                    backgroundColor: isDark ? colors.surface : '#fff' }}
                />
                <Pressable onPress={reportIssue} disabled={!vehicleIssue.trim()}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 12, opacity: pressed ? 0.8 : 1 })}>
                  {issueSent ? <Check size={14} color="#fff" /> : <AlertTriangle size={14} color="#fff" />}
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                    {issueSent ? 'Sent to Parents' : 'Send Report'}
                  </Text>
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textSecondary,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  All Reports ({issueLog.length})
                </Text>
                {issueLog.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>
                      No issues reported yet.
                    </Text>
                  </View>
                ) : (
                  issueLog.map(entry => (
                    <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 14,
                      backgroundColor: isDark ? colors.danger + '10' : '#FEF2F2',
                      borderWidth: 1, borderColor: colors.danger + '30' }}>
                      <AlertTriangle size={16} color={colors.danger} />
                      <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>
                        {entry.detail}
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{entry.date.slice(5)}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}

        </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </View>
  );
}
