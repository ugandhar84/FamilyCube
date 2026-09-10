/**
 * MaintenanceRemindersSheet — general manual maintenance reminders for one
 * device (distinct from filter tracking — e.g. "descale humidifier",
 * "check batteries in sensor"). Always manual entry per the user's own
 * explicit scope ("it's manual entry").
 */
import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useSmartHubStore, type SmartDevice, type SmartDeviceMaintenanceReminder } from '@/store/smartHubStore';
import { showAlert } from '@/components/AppAlert';

export function MaintenanceRemindersSheet({ visible, device, familyId, activeMemberId, reminders, onClose }: {
  visible: boolean;
  device: SmartDevice;
  familyId: string;
  activeMemberId: string;
  reminders: SmartDeviceMaintenanceReminder[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { addMaintenanceReminder, completeMaintenanceReminder, deleteMaintenanceReminder } = useSmartHubStore();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [recurDays, setRecurDays] = useState('');

  const onAdd = async () => {
    if (!title.trim()) return;
    const { error } = await addMaintenanceReminder({
      deviceId: device.id, familyId, title: title.trim(), dueDate,
      recurEveryDays: recurDays ? parseInt(recurDays, 10) : undefined,
      createdBy: activeMemberId,
    });
    if (error) showAlert('Could not add reminder', error);
    else { setTitle(''); setRecurDays(''); }
  };

  const onDelete = (id: string) => {
    showAlert('Delete reminder?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMaintenanceReminder(id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{device.displayName} maintenance</Text>
          <Pressable onPress={onClose}><Text style={{ color: colors.primary, fontSize: TYPO.body, fontWeight: '800' }}>Done</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {reminders.length === 0 && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 16 }}>No maintenance reminders yet.</Text>
          )}
          {reminders.map(r => (
            <View key={r.id} style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1,
              borderColor: colors.border, backgroundColor: colors.card, padding: 12, marginBottom: 10,
            }}>
              <Pressable onPress={() => completeMaintenanceReminder(r.id)} hitSlop={8} style={{ marginRight: 10 }}>
                <Ionicons name={r.completedAt ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={r.completedAt ? colors.success : colors.textTertiary} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, textDecorationLine: r.completedAt ? 'line-through' : 'none' }}>
                  {r.title}
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                  Due {r.dueDate}{r.recurEveryDays ? ` · every ${r.recurEveryDays}d` : ''}
                </Text>
              </View>
              <Pressable onPress={() => onDelete(r.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}

          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>Add a reminder</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Descale humidifier tray"
              placeholderTextColor={colors.textTertiary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: TYPO.body, marginBottom: 8,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
                style={{
                  flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                  paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: TYPO.body,
                }}
              />
              <TextInput
                value={recurDays}
                onChangeText={setRecurDays}
                placeholder="Repeat every N days (optional)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={{
                  flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                  paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: TYPO.body,
                }}
              />
            </View>
            <Pressable onPress={onAdd} style={{ backgroundColor: colors.primary, borderRadius: RADIUS.sm, padding: 10, alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Add reminder</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
