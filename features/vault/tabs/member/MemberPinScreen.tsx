/**
 * MemberPinScreen — full-page PIN entry (replaces the old
 * MemberProfileSheet's 'pin' AppBottomSheet section). Carried over
 * verbatim from MemberProfileSheet.tsx's PinSection — same validation
 * (4-6 digits, must match, numbers only), same deferred-write pattern —
 * just rendered as its own FullPageOverlay screen instead of swapping
 * content inside a bottom sheet.
 *
 * PinBody (the actual form) is exported separately so
 * MemberProfileSheet.tsx's kiosk renderShell path can reuse the exact same
 * implementation.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';

export function MemberPinScreen({
  visible, member, onClose, onSave, colors, isDark, zIndex = 50,
}: {
  visible: boolean;
  member: any;
  onClose: () => void;
  onSave: (memberId: string, pin: string) => Promise<void>;
  colors: any; isDark: boolean; zIndex?: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.primary }}>‹ {member.name}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: 8 }}>
            {member.pin ? 'Change PIN' : 'Set PIN'}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 10 }}>
          <PinBody member={member} onCancel={onClose} onSave={onSave} colors={colors} isDark={isDark} />
        </View>
      </View>
    </FullPageOverlay>
  );
}

// ─── PIN form body — carried over from the old PinModal/MemberProfileSheet
// PinSection unchanged. Exported so MemberProfileSheet.tsx's kiosk
// renderShell path can reuse the exact same implementation instead of
// duplicating it. ────────────────────────────────────────────────────────

export function PinBody({ member, onCancel, onSave, colors, isDark }: {
  member: any;
  onCancel: () => void;
  onSave: (memberId: string, pin: string) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirm) { setError('PINs do not match.'); return; }
    if (!/^\d+$/.test(pin)) { setError('PIN must be numbers only.'); return; }
    setSaving(true);
    // Same deferred-write pattern as the old PinModal/PinSection: let this
    // screen's own close settle before the store write lands.
    InteractionManager.runAfterInteractions(() => {
      setSaving(false);
      onSave(member.id, pin);
    });
  };

  const inp = {
    borderRadius: 12, borderWidth: 1.5,
    borderColor: error ? colors.danger : colors.border,
    backgroundColor: isDark ? colors.card : '#F5F3FF', color: colors.textPrimary,
    paddingHorizontal: 13, paddingVertical: 11, textAlign: 'center' as const,
    letterSpacing: 8, fontSize: 22,
  };

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 16 }}>
        {member.role === 'kid' ? `${member.name} uses this to unlock their profile.` : 'Used to confirm sensitive actions.'}
      </Text>

      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>New PIN (digits only)</Text>
      <TextInput value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry maxLength={6}
        placeholder="••••" placeholderTextColor={colors.textTertiary} style={inp} />

      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 }}>Confirm PIN</Text>
      <TextInput value={confirm} onChangeText={setConfirm} keyboardType="numeric" secureTextEntry maxLength={6}
        placeholder="••••" placeholderTextColor={colors.textTertiary} style={inp} />

      {error ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 6 }}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <TouchableOpacity onPress={onCancel}
          style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving}
          style={{ flex: 2, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accent }}>
          {saving ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{member.pin ? 'Update PIN' : 'Set PIN'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
