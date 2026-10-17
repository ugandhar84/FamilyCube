/**
 * PinResetFlow — "Forgot PIN?" for a member who has their own login. Emails a 6-digit code to the account email, then lets
 * them choose a new 4-digit PIN. Only the person signed in as that account can do this; everyone else asks a parent.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { GEMINI } from '@/constants/geminiRhythm';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';

export default function PinResetFlow({ member, onDone, onBack }: { member: FamilyMember; onDone: () => void; onBack: () => void }) {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<'send' | 'enter'>('send');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const field = [s.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF', color: colors.textPrimary, borderColor: colors.border }];

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('request-pin-reset', { body: { memberId: member.id } });
      let err = data?.error as string | undefined;
      if (error && !err) {
        try { const b = await (error as any).context?.json?.(); err = b?.error; } catch { /* generic below */ }
        err = err ?? 'Could not send the code. Check your connection and try again.';
      }
      if (err) { setMsg(err); return; }
      setSentTo(data?.sentTo ?? 'your email'); setStep('enter');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setMsg('Enter the 6-digit code from the email.'); return; }
    if (!/^\d{4}$/.test(pin)) { setMsg('Your new PIN must be exactly 4 digits.'); return; }
    if (pin !== pin2) { setMsg('The two PINs do not match.'); return; }
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc('confirm_pin_reset', { p_member_id: member.id, p_code: code, p_new_pin: pin });
      if (error) { setMsg(error.message); return; }
      if (!data) { setMsg('That code is not right. Check the email and try again.'); return; }
      await useFamilyStore.getState().syncFromDB().catch(() => {});
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <View style={{ width: '100%', paddingHorizontal: 24, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Reset your PIN</Text>
      {step === 'send' ? (
        <>
          <Text style={s.body(colors)}>We will email a 6-digit code to the address on your account. It works for 10 minutes. The code is the only thing sent; your PIN is never emailed.</Text>
          <TouchableOpacity disabled={busy} onPress={send} style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Email me a code</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.body(colors)}>We sent a code to {sentTo}. Enter it and choose a new PIN.</Text>
          <TextInput style={field} value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" maxLength={6} />
          <TextInput style={field} value={pin} onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))} placeholder="New 4-digit PIN" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry maxLength={4} />
          <TextInput style={field} value={pin2} onChangeText={t => setPin2(t.replace(/\D/g, '').slice(0, 4))} placeholder="Repeat the new PIN" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry maxLength={4} />
          <TouchableOpacity disabled={busy} onPress={confirm} style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Save new PIN</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={send} disabled={busy}><Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700' }}>Send a new code</Text></TouchableOpacity>
        </>
      )}
      {!!msg && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, fontWeight: '700', lineHeight: 20 }}>{msg}</Text>}
      <TouchableOpacity onPress={onBack}><Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: '600', paddingVertical: 8 }}>Back to PIN</Text></TouchableOpacity>
    </View>
  );
}

const s = {
  input: { height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, fontSize: 18, fontWeight: '700' } as const,
  btn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' } as const,
  btnT: { color: '#fff', fontSize: 16, fontWeight: '800' } as const,
  body: (c: any) => ({ fontSize: 14, lineHeight: 20, color: c.textSecondary }) as const,
};
void StyleSheet;
