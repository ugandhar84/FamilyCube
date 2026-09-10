/**
 * ProgramEditorSheet — full weekly program editor for one smart thermostat.
 * Replaces the ENTIRE program on save (see smart_device_programs' and the
 * adapter's own comments on why this is a full replace, not a per-period
 * patch) — so this always edits a local copy and only calls onSave once.
 */
import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import type { SmartDevice, SmartHubProgram, SmartHubProgramPeriod } from '@/store/smartHubStore';

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };

function newPeriod(): SmartHubProgramPeriod {
  return {
    id: `period-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: 'New period', days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    startTime: '08:00', endTime: '17:00',
    targetTempHeatF: 68, targetTempCoolF: 76, fanMode: 'auto',
  };
}

export function ProgramEditorSheet({ visible, device, program, onClose, onSave }: {
  visible: boolean;
  device: SmartDevice;
  program: SmartHubProgram;
  onClose: () => void;
  onSave: (program: SmartHubProgram) => void;
}) {
  const { colors } = useTheme();
  const [periods, setPeriods] = useState<SmartHubProgramPeriod[]>(program.periods.length ? program.periods : [newPeriod()]);

  const updatePeriod = (id: string, patch: Partial<SmartHubProgramPeriod>) =>
    setPeriods(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));

  const toggleDay = (period: SmartHubProgramPeriod, day: string) => {
    const has = period.days.includes(day);
    updatePeriod(period.id, { days: has ? period.days.filter(d => d !== day) : [...period.days, day] });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={onClose}><Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>Cancel</Text></Pressable>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{device.displayName} program</Text>
          <Pressable onPress={() => onSave({ periods, holds: program.holds })}>
            <Text style={{ color: colors.primary, fontSize: TYPO.body, fontWeight: '800' }}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {periods.map(period => (
            <View key={period.id} style={{
              borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.card, padding: 12, marginBottom: 12,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={period.name}
                  onChangeText={t => updatePeriod(period.id, { name: t })}
                  style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, paddingVertical: 4 }}
                />
                {periods.length > 1 && (
                  <Pressable onPress={() => setPeriods(ps => ps.filter(p => p.id !== period.id))}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {ALL_DAYS.map(day => {
                  const active = period.days.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => toggleDay(period, day)}
                      style={{
                        width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: active ? colors.primary : colors.surface,
                      }}
                    >
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>{DAY_LABEL[day]}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                <LabeledInput label="Start" value={period.startTime} colors={colors} onChangeText={t => updatePeriod(period.id, { startTime: t })} />
                <LabeledInput label="End" value={period.endTime} colors={colors} onChangeText={t => updatePeriod(period.id, { endTime: t })} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                <LabeledInput label="Heat °F" value={String(period.targetTempHeatF ?? '')} colors={colors} keyboardType="number-pad"
                  onChangeText={t => updatePeriod(period.id, { targetTempHeatF: t ? parseInt(t, 10) : null })} />
                <LabeledInput label="Cool °F" value={String(period.targetTempCoolF ?? '')} colors={colors} keyboardType="number-pad"
                  onChangeText={t => updatePeriod(period.id, { targetTempCoolF: t ? parseInt(t, 10) : null })} />
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => setPeriods(ps => [...ps, newPeriod()])}
            style={{ borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: TYPO.caption }}>+ Add period</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LabeledInput({ label, value, onChangeText, colors, keyboardType }: {
  label: string; value: string; onChangeText: (t: string) => void; colors: any; keyboardType?: 'number-pad';
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
          paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: TYPO.body,
        }}
      />
    </View>
  );
}
