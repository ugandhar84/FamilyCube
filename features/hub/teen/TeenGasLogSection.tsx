import { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fuel, AlertTriangle, Check } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';

const GAS_LOG_KEY = (memberId: string) => `@familycube_gas_log_${memberId}`;
const ISSUE_LOG_KEY = (memberId: string) => `@familycube_issue_log_${memberId}`;

type GasEntry = { id: string; date: string; gallons: string; odometer: string; note: string };
// A reported issue previously vanished the moment the 2s "Sent to Parents"
// label reverted — unlike every fill-up, which gets a permanent "Recent"
// entry, there was zero record anywhere that a teen had reported a vehicle
// issue at all once that timer expired.
type IssueEntry = { id: string; date: string; detail: string };

// Sheet body for the "Gas Log" tile: fill-up log (local, per-device) + a
// one-tap "report vehicle issue" that goes to the parent as a kid request.
export function TeenGasLogSection({ activeId, today, onReportIssue, colors, isDark }: {
  activeId: string; today: string;
  onReportIssue: (detail: string) => void;
  colors: any; isDark: boolean;
}) {
  const [gasLog, setGasLog] = useState<GasEntry[]>([]);
  const [issueLog, setIssueLog] = useState<IssueEntry[]>([]);
  const [newGallons, setNewGallons] = useState('');
  const [newOdo, setNewOdo] = useState('');
  const [newGasNote, setNewGasNote] = useState('');
  const [vehicleIssue, setVehicleIssue] = useState('');
  const [issueSent, setIssueSent] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GAS_LOG_KEY(activeId)).then(raw => {
      if (raw) { try { setGasLog(JSON.parse(raw)); } catch { /* ignore */ } }
    });
    AsyncStorage.getItem(ISSUE_LOG_KEY(activeId)).then(raw => {
      if (raw) { try { setIssueLog(JSON.parse(raw)); } catch { /* ignore */ } }
    });
  }, [activeId]);

  const persistGasLog = (log: GasEntry[]) => {
    AsyncStorage.setItem(GAS_LOG_KEY(activeId), JSON.stringify(log));
  };
  const persistIssueLog = (log: IssueEntry[]) => {
    AsyncStorage.setItem(ISSUE_LOG_KEY(activeId), JSON.stringify(log));
  };

  const addGasEntry = () => {
    if (!newGallons.trim()) return;
    const entry: GasEntry = { id: Date.now().toString(), date: today, gallons: newGallons, odometer: newOdo, note: newGasNote };
    const updated = [entry, ...gasLog];
    setGasLog(updated);
    persistGasLog(updated);
    setNewGallons(''); setNewOdo(''); setNewGasNote('');
  };

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
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: isDark ? colors.danger + '10' : '#FEF2F2', borderRadius: 14,
        borderWidth: 1, borderColor: colors.danger + '30', padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={14} color={colors.danger} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Report Vehicle Issue</Text>
        </View>
        <TextInput
          placeholder="Describe the issue (e.g. low tire, weird noise)"
          placeholderTextColor={colors.textTertiary}
          value={vehicleIssue}
          onChangeText={setVehicleIssue}
          style={{ borderWidth: 1, borderColor: colors.danger + '70', borderRadius: 10,
            padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
            backgroundColor: isDark ? colors.surface : '#fff' }}
        />
        <Pressable onPress={reportIssue}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.danger, borderRadius: 10,
            paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}>
          {issueSent ? <Check size={14} color="#fff" /> : <AlertTriangle size={14} color="#fff" />}
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
            {issueSent ? 'Sent to Parents' : 'Send Report'}
          </Text>
        </Pressable>
        {issueLog.length > 0 && (
          <View style={{ gap: 4, marginTop: 2 }}>
            {issueLog.slice(0, 3).map(entry => (
              <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, flex: 1 }} numberOfLines={1}>
                  {entry.detail}
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{entry.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 }}>Log Fill-Up</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          placeholder="Gallons"
          placeholderTextColor={colors.textTertiary}
          value={newGallons}
          onChangeText={setNewGallons}
          keyboardType="decimal-pad"
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
            padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
            backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
        />
        <TextInput
          placeholder="Odometer"
          placeholderTextColor={colors.textTertiary}
          value={newOdo}
          onChangeText={setNewOdo}
          keyboardType="number-pad"
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
            padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
            backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
        />
      </View>
      <TextInput
        placeholder="Note (optional)"
        placeholderTextColor={colors.textTertiary}
        value={newGasNote}
        onChangeText={setNewGasNote}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10,
          padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
          backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
      />
      <Pressable onPress={() => { addGasEntry(); }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.success, borderRadius: 10,
          paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}>
        <Fuel size={14} color="#fff" />
        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Log Fill-Up</Text>
      </Pressable>

      {gasLog.length > 0 && (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.8 }}>Recent</Text>
          {gasLog.slice(0, 5).map(entry => (
            <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              padding: 10, borderRadius: 10,
              backgroundColor: isDark ? colors.success + '10' : '#ECFDF5',
              borderWidth: 1, borderColor: colors.success + '30' }}>
              <Fuel size={14} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
                  {entry.gallons} gal{entry.odometer ? ` · ${entry.odometer} mi` : ''}
                </Text>
                {entry.note ? <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{entry.note}</Text> : null}
              </View>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{entry.date.slice(5)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
