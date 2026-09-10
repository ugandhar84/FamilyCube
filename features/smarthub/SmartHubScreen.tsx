/**
 * SmartHubScreen — parent-only. Connect a smart-home vendor account
 * (mock today; see docs/smart-hub-mock-adapter.md), see live device
 * state, quick-set a hold, edit the full program, track filter changes,
 * and manage general manual maintenance reminders per device.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useSmartHubStore, type SmartDevice, type SmartHubProgramPeriod } from '@/store/smartHubStore';
import { showAlert } from '@/components/AppAlert';
import { ProgramEditorSheet } from './ProgramEditorSheet';
import { MaintenanceRemindersSheet } from './MaintenanceRemindersSheet';

const DAY_LABEL: Record<string, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };

export default function SmartHubScreen() {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? null;
  const isParent = activeMember?.role === 'parent';

  const { accounts, devices, programs, filterTracking, reminders, isLoading, isSyncing,
    loadAll, connectAccount, syncNow, setHold, saveProgram, setManualFilterInterval } = useSmartHubStore();

  const [connecting, setConnecting] = useState(false);
  const [programDevice, setProgramDevice] = useState<SmartDevice | null>(null);
  const [remindersDevice, setRemindersDevice] = useState<SmartDevice | null>(null);
  const [holdDeviceId, setHoldDeviceId] = useState<string | null>(null);
  const [holdTemp, setHoldTemp] = useState('');

  useEffect(() => {
    if (familyId) loadAll(familyId);
  }, [familyId]);

  if (!isParent) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
          Smart Hub is a parent-only feature.
        </Text>
      </View>
    );
  }

  const onConnect = async () => {
    if (!activeMemberId) return;
    setConnecting(true);
    const { error } = await connectAccount({ memberId: activeMemberId, vendor: 'mock', label: 'Experimental mock thermostat' });
    setConnecting(false);
    if (error) showAlert('Could not connect', error);
  };

  const onSetHold = async (deviceId: string) => {
    const temp = parseInt(holdTemp, 10);
    if (!activeMemberId || Number.isNaN(temp)) return;
    const { error } = await setHold({
      memberId: activeMemberId, deviceId,
      hold: { type: 'until_next_period', targetTempHeatF: temp, targetTempCoolF: temp, startsAt: new Date().toISOString(), endsAt: null },
    });
    if (error) showAlert('Could not set hold', error);
    setHoldDeviceId(null);
    setHoldTemp('');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>Smart Hub</Text>
      </View>

      <View style={{
        backgroundColor: colors.amberLight, borderRadius: RADIUS.md, padding: 12, marginBottom: 16,
        borderWidth: 1, borderColor: colors.amber,
      }}>
        <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, fontWeight: '700' }}>Experimental</Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
          Running against a mock thermostat while a real vendor connection (Honeywell/Resideo) is set up. See docs/smart-hub-mock-adapter.md.
        </Text>
      </View>

      {accounts.length === 0 ? (
        <Pressable
          onPress={onConnect}
          disabled={connecting}
          style={{
            borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
            backgroundColor: colors.card, padding: 16, alignItems: 'center',
          }}
        >
          {connecting ? <ActivityIndicator color={colors.primary} /> : (
            <>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Connect a smart device account</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 4 }}>Mock vendor · thermostats</Text>
            </>
          )}
        </Pressable>
      ) : (
        <>
          <Pressable
            onPress={() => familyId && syncNow(familyId)}
            disabled={isSyncing}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 12 }}
          >
            {isSyncing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={16} color={colors.primary} />}
            <Text style={{ fontSize: TYPO.caption, color: colors.primary, fontWeight: '700' }}>Sync now</Text>
          </Pressable>

          {isLoading && devices.length === 0 && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}

          {devices.map(device => {
            const state = device.lastState;
            const tracking = filterTracking[device.id];
            const account = accounts.find(a => a.id === device.accountId);
            return (
              <View key={device.id} style={{
                borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
                backgroundColor: colors.card, padding: 14, marginBottom: 12,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{device.displayName}</Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{device.deviceType} · {account?.status ?? 'connected'}</Text>
                  </View>
                  {state && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>{Math.round(state.currentTempF)}°</Text>
                  )}
                </View>

                {state && (
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 6 }}>
                    Mode: {state.mode} · Heat to {state.targetTempHeatF ?? '—'}° / Cool to {state.targetTempCoolF ?? '—'}°
                    {state.humidityPct != null ? ` · ${state.humidityPct}% humidity` : ''}
                  </Text>
                )}

                {tracking && (
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 4 }}>
                    Filter: {tracking.source === 'vendor' ? 'vendor-reported' : 'manual schedule'}
                    {tracking.nextDueDate ? ` · next change ${tracking.nextDueDate}` : ''}
                  </Text>
                )}

                {holdDeviceId === device.id ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                    <TextInput
                      value={holdTemp}
                      onChangeText={setHoldTemp}
                      keyboardType="number-pad"
                      placeholder="Temp °F"
                      placeholderTextColor={colors.textTertiary}
                      style={{
                        flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                        paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: TYPO.body,
                      }}
                    />
                    <Pressable onPress={() => onSetHold(device.id)} style={{ backgroundColor: colors.primary, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.caption }}>Set</Text>
                    </Pressable>
                    <Pressable onPress={() => { setHoldDeviceId(null); setHoldTemp(''); }} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption }}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <SmallButton label="Quick set" colors={colors} onPress={() => setHoldDeviceId(device.id)} />
                    <SmallButton label="Edit program" colors={colors} onPress={() => setProgramDevice(device)} />
                    <SmallButton label="Filter interval" colors={colors} onPress={() => promptManualInterval(device, familyId, setManualFilterInterval)} />
                    <SmallButton label="Maintenance" colors={colors} onPress={() => setRemindersDevice(device)} />
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {programDevice && (
        <ProgramEditorSheet
          visible
          device={programDevice}
          program={programs[programDevice.id] ?? { periods: [], holds: [] }}
          onClose={() => setProgramDevice(null)}
          onSave={async (program) => {
            if (!activeMemberId) return;
            const { error } = await saveProgram({ memberId: activeMemberId, deviceId: programDevice.id, program });
            if (error) showAlert('Could not save program', error);
            else setProgramDevice(null);
          }}
        />
      )}

      {remindersDevice && familyId && activeMemberId && (
        <MaintenanceRemindersSheet
          visible
          device={remindersDevice}
          familyId={familyId}
          activeMemberId={activeMemberId}
          reminders={reminders.filter(r => r.deviceId === remindersDevice.id)}
          onClose={() => setRemindersDevice(null)}
        />
      )}
    </ScrollView>
  );
}

function SmallButton({ label, colors, onPress }: { label: string; colors: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{
      borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
      paddingHorizontal: 10, paddingVertical: 6,
    }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

function promptManualInterval(device: SmartDevice, familyId: string | null, setManualFilterInterval: (p: { familyId: string; deviceId: string; intervalDays: number }) => Promise<{ error?: string }>) {
  if (!familyId) return;
  showAlert(
    'Filter change interval',
    'How many days between filter changes?',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: '30 days', onPress: () => setManualFilterInterval({ familyId, deviceId: device.id, intervalDays: 30 }) },
      { text: '90 days', onPress: () => setManualFilterInterval({ familyId, deviceId: device.id, intervalDays: 90 }) },
      { text: '180 days', onPress: () => setManualFilterInterval({ familyId, deviceId: device.id, intervalDays: 180 }) },
    ],
  );
}
