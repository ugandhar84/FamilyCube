import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { CreditCard, Landmark, Apple } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

const CASH_METHODS = [
  { label: 'Venmo Teen', Icon: CreditCard },
  { label: 'Greenlight', Icon: Landmark },
  { label: 'Apple Cash', Icon: Apple },
] as const;

// Sheet body for the "Cash Out" tile: pick a method and amount, parent
// approves before transfer.
export function TeenCashOutSection({ balance, onRequest, colors, isDark }: {
  balance: number; onRequest: (amount: string, method: string) => void;
  colors: any; isDark: boolean;
}) {
  const [cashMethod, setCashMethod] = useState<string>(CASH_METHODS[0].label);
  const [cashAmount, setCashAmount] = useState('');
  // Was no client-side check at all — the Store's own redeem button
  // already disables/labels itself when a request exceeds the balance
  // (canRedeem); this had no equivalent, so a teen could submit (and only
  // find out it was invalid once a parent reviewed it) a cash-out request
  // for more than they actually have (QA sweep, teen-role audit, Low).
  // The real backstop is still parent approval — this is just parity with
  // the Store's own sanity check, not a new authorization boundary.
  const requestedAmount = parseFloat(cashAmount) || 0;
  const overBalance = requestedAmount > balance;

  const submit = () => {
    if (!cashAmount.trim() || overBalance || requestedAmount <= 0) return;
    onRequest(cashAmount, cashMethod);
    setCashAmount('');
  };

  return (
    <View>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 12 }}>
        Request a payout for completed errands. Parent approves before transfer.
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {CASH_METHODS.map(({ label, Icon }) => (
          <Pressable key={label} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=teen selected "${label}" for "cash-out method" on "TeenCashOutSection" [features/hub/teen/TeenCashOutSection.tsx:44]`); setCashMethod(label); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
              borderColor: cashMethod === label ? BRAND.amber : colors.border,
              backgroundColor: cashMethod === label ? BRAND.amber + '18' : 'transparent' }}>
            <Icon size={13} color={cashMethod === label ? BRAND.amber : colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700',
              color: cashMethod === label ? BRAND.amber : colors.textSecondary }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          placeholder="Amount ($)"
          placeholderTextColor={colors.textTertiary}
          value={cashAmount}
          onChangeText={setCashAmount}
          onBlur={() => { console.log(`[UserAction] FORM screen=Hub role=teen field="cash-out amount" on "TeenCashOutSection" newValue=${cashAmount} [features/hub/teen/TeenCashOutSection.tsx:61]`); }}
          keyboardType="decimal-pad"
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
            padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
            backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
        />
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=teen tapped "Request" on "TeenCashOutSection" amount=${cashAmount} method=${cashMethod} → onRequest [features/hub/teen/TeenCashOutSection.tsx:65]`); submit(); }} disabled={overBalance || requestedAmount <= 0}
          style={({ pressed }) => ({ backgroundColor: (overBalance || requestedAmount <= 0) ? colors.border : BRAND.amber,
            borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: (overBalance || requestedAmount <= 0) ? colors.textTertiary : '#fff' }}>Request</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: TYPO.micro, color: overBalance ? colors.danger : colors.textTertiary, marginTop: 8, fontWeight: overBalance ? '700' : '400' }}>
        {overBalance ? `Only ${balance} coins available` : `Balance: ${balance} coins`}
      </Text>
    </View>
  );
}
