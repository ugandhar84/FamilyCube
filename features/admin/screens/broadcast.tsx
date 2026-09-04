// Admin push-broadcast screen — sends a push notification to either every
// registered device or parents only (for paywall/upsell nudges that
// shouldn't reach a kid's device), via the existing send-broadcast edge
// function (checks app_admins instead of the old profiles.is_admin).
import { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { showAlert } from '@/components/AppAlert';
import { sendAdminBroadcast, type BroadcastAudience } from '@/lib/db/admin';

const AUDIENCES: { key: BroadcastAudience; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'Everyone', description: 'Every device with a push token', icon: 'people-outline' },
  { key: 'parents', label: 'Parents only', description: 'Good for paywall or upgrade nudges', icon: 'person-outline' },
];

export default function BroadcastScreen() {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [sending, setSending] = useState(false);

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending;

  const confirmSend = () => {
    const who = audience === 'parents' ? 'every parent' : 'every family';
    showAlert(
      `Send to ${who}?`,
      `This notification goes out immediately. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'destructive', onPress: doSend },
      ],
    );
  };

  const doSend = async () => {
    setSending(true);
    try {
      const { sent } = await sendAdminBroadcast(title.trim(), body.trim(), audience);
      showAlert('Broadcast sent', `Delivered to ${sent} ${sent === 1 ? 'device' : 'devices'}.`);
      setTitle('');
      setBody('');
    } catch (e: any) {
      showAlert("Couldn't send broadcast", e?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{
            flexDirection: 'row', gap: 10, alignItems: 'flex-start',
            backgroundColor: colors.amberLight, borderRadius: RADIUS.md, padding: 12, marginBottom: 20,
          }}>
            <Ionicons name="warning-outline" size={18} color={colors.kid} />
            <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>
              Goes out immediately to the chosen audience. Use sparingly.
            </Text>
          </View>

          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Audience</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {AUDIENCES.map(a => {
              const selected = audience === a.key;
              return (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => setAudience(a.key)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 12, paddingHorizontal: 12, borderRadius: RADIUS.md,
                    backgroundColor: selected ? colors.primaryLight : colors.card,
                    borderWidth: 1, borderColor: selected ? colors.primary : colors.border,
                  }}
                >
                  <Ionicons name={a.icon} size={18} color={selected ? colors.primary : colors.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: selected ? colors.primary : colors.textPrimary }}>
                      {a.label}
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>{a.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={audience === 'parents' ? 'e.g. Unlock Premium for your family' : 'e.g. New feature: Ask Fam'}
            placeholderTextColor={colors.placeholder}
            maxLength={80}
            style={{
              backgroundColor: colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1,
              borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
              fontSize: TYPO.body, color: colors.textPrimary, marginBottom: 16,
            }}
          />

          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Message</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What's new, and why it matters to families"
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={200}
            style={{
              backgroundColor: colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1,
              borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
              fontSize: TYPO.body, color: colors.textPrimary, minHeight: 90, textAlignVertical: 'top',
            }}
          />

          <TouchableOpacity
            onPress={confirmSend}
            disabled={!canSend}
            activeOpacity={0.8}
            style={{
              marginTop: 20, backgroundColor: colors.primary, borderRadius: RADIUS.md,
              paddingVertical: 14, alignItems: 'center', opacity: canSend ? 1 : 0.5,
            }}
          >
            {sending ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>
                {audience === 'parents' ? 'Send to Parents' : 'Send Broadcast'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
