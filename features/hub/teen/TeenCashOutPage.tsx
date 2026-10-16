/**
 * TeenCashOutPage — full-page Figma/Gemini-rhythm replacement for
 * TeenCashOutSection's old TeenTileSheet bottom sheet ["touturing and
 * cashout should be full page overlay with figma /gemini rythem"].
 * Plain View-rooted — no self FullPageOverlay wrap; KidOverlays applies
 * that, matching every Ask-Parent form's own convention.
 *
 * Defaults to a Pending/Settled/Rejected/All history view of the teen's
 * own cash-out requests, with a banner CTA that opens the request form
 * (the page's only content before this rework) ["the page also should
 * have the tabs ... with a banner to open a cashout form"].
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, Landmark, Apple, X, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import { FieldCardSection } from '../kid/forms/shared/FieldCard';
import { BeforeYouSendBox } from '../kid/forms/shared/BeforeYouSendBox';
import { SentConfirmation } from '../kid/forms/shared/SentConfirmation';
import type { KidRequest, RequestStatus } from '@/store/kidRequestStore';

const CASH_METHODS = [
  { label: 'Venmo Teen', Icon: CreditCard },
  { label: 'Greenlight', Icon: Landmark },
  { label: 'Apple Cash', Icon: Apple },
] as const;

type TabKey = 'pending' | 'settled' | 'rejected' | 'all';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'settled', label: 'Settled' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function statusBucket(status: RequestStatus): 'pending' | 'settled' | 'rejected' {
  if (status === 'pending') return 'pending';
  if (status === 'approved' || status === 'completed') return 'settled';
  return 'rejected';
}

function statusMeta(status: RequestStatus, colors: any) {
  const bucket = statusBucket(status);
  if (bucket === 'pending') return { label: 'Pending', color: colors.amber, Icon: Clock };
  if (bucket === 'settled') return { label: 'Settled', color: colors.success, Icon: CheckCircle2 };
  return { label: 'Rejected', color: colors.danger, Icon: XCircle };
}

function parseCashOutDetail(detail: string): { amount?: string; method?: string } {
  const m = detail.match(/\$([\d.]+)\s+via\s+([^(]+)/i);
  if (!m) return {};
  return { amount: m[1], method: m[2].trim() };
}

export function TeenCashOutPage({
  balance, cashOuts, onRequest, onClose,
}: {
  balance: number; cashOuts: KidRequest[]; onRequest: (amount: string, method: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [cashMethod, setCashMethod] = useState<string>(CASH_METHODS[0].label);
  const [cashAmount, setCashAmount] = useState('');
  const [sent, setSent] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<TabKey>('pending');

  const canvas = isDark ? colors.background : GEMINI.canvas;

  const isCleanAmount = /^\d*\.?\d*$/.test(cashAmount.trim());
  const requestedAmount = isCleanAmount ? (parseFloat(cashAmount) || 0) : 0;
  const overBalance = requestedAmount > balance;
  const invalidFormat = cashAmount.trim().length > 0 && !isCleanAmount;
  const canSubmit = !!cashAmount.trim() && !overBalance && requestedAmount > 0 && !invalidFormat;

  const pendingCount = useMemo(() => cashOuts.filter(r => r.status === 'pending').length, [cashOuts]);
  const filtered = useMemo(() => {
    if (tab === 'all') return cashOuts;
    return cashOuts.filter(r => statusBucket(r.status) === tab);
  }, [cashOuts, tab]);

  const submit = () => {
    if (!canSubmit) return;
    onRequest(cashAmount, cashMethod);
    setSent(true);
  };

  const close = () => { setCashAmount(''); setSent(false); setShowForm(false); onClose(); };
  const backToHistory = () => { setCashAmount(''); setSent(false); setShowForm(false); };

  if (showForm) {
    return (
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <View style={{ backgroundColor: canvas }}>
          {!sent && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: insets.top + 8 }}>
              <Pressable onPress={backToHistory} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>‹ Cash Out</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          <PageHeading
            title="Cash Out Earnings"
            subtitle={sent ? undefined : 'Request a payout for completed errands.'}
            accent="amber"
            Icon={CreditCard}
            topInset={0}
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
          {sent ? (
            <SentConfirmation
              title="Sent · awaiting a reply"
              message={`Cash-out request for $${cashAmount} via ${cashMethod} delivered. A parent will approve before transfer.`}
              onReturn={close}
              colors={colors}
            />
          ) : (
            <>
              <FieldCardSection title="How would you like to be paid?" colors={colors} isDark={isDark}>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {CASH_METHODS.map(({ label, Icon }) => (
                    <Pressable key={label} onPress={() => setCashMethod(label)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                        borderColor: cashMethod === label ? colors.amber : colors.border,
                        backgroundColor: cashMethod === label ? colors.amberLight : 'transparent' }}>
                      <Icon size={13} color={cashMethod === label ? colors.amber : colors.textSecondary} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                        color: cashMethod === label ? colors.amber : colors.textSecondary }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Amount ($)</Text>
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    value={cashAmount}
                    onChangeText={setCashAmount}
                    keyboardType="decimal-pad"
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                      padding: 10, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary,
                      backgroundColor: isDark ? colors.surface : GEMINI.cardBg }}
                  />
                  <Text style={{ fontSize: TYPO.micro, color: (overBalance || invalidFormat) ? colors.danger : colors.textTertiary, marginTop: 4, fontWeight: (overBalance || invalidFormat) ? '700' : '400' }}>
                    {invalidFormat ? 'Enter a valid amount, like 12.50' : overBalance ? `Only ${balance} coins available` : `Balance: ${balance} coins`}
                  </Text>
                </View>
              </FieldCardSection>

              <BeforeYouSendBox
                recipientLabel="To your parents"
                note="A parent approves before any transfer happens."
                colors={colors}
              />

              <Pressable onPress={submit} disabled={!canSubmit}
                style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                  backgroundColor: canSubmit ? colors.amber : colors.surface }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmit ? '#fff' : colors.textTertiary }}>
                  Request cash out
                </Text>
              </Pressable>

              <Pressable onPress={backToHistory} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                  Cancel · return unchanged
                </Text>
              </Pressable>
            </>
          )}
          </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: insets.top + 8 }}>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>‹ Teen Hub</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        <PageHeading
          title="Cash Out"
          subtitle={`Balance: ${balance} coins`}
          accent="amber"
          Icon={CreditCard}
          topInset={0}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => setShowForm(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
            borderRadius: 18, padding: 14, backgroundColor: colors.amberLight }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.amber,
            alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Request a cash out</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
              {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}` : 'Get paid for completed errands'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {TABS.map(({ key, label }) => (
            <Pressable key={key} onPress={() => setTab(key)}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: tab === key ? colors.amber : (isDark ? colors.surface : GEMINI.cardBg),
                borderWidth: 1, borderColor: tab === key ? colors.amber : colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                color: tab === key ? '#fff' : colors.textSecondary }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          {filtered.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>
                No {tab === 'all' ? '' : tab} cash-out requests yet.
              </Text>
            </View>
          ) : (
            filtered.map(r => {
              const { label, color, Icon } = statusMeta(r.status, colors);
              const { amount, method } = parseCashOutDetail(r.detail);
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderRadius: 14, padding: 12, backgroundColor: isDark ? colors.surface : GEMINI.cardBg,
                  borderWidth: 1, borderColor: colors.border }}>
                  <Icon size={18} color={color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                      {amount ? `$${amount}` : 'Cash out'}{method ? ` · ${method}` : ''}
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
                      {r.parentNote || r.detail}
                    </Text>
                  </View>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color }}>{label}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
