import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import FullPageOverlay from '@/components/FullPageOverlay';
import { showAlert } from '@/components/AppAlert';
import { IconCubeMark, Wordmark } from '@/components/FamilyCubeLogo';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatReady } from '@/lib/subscription';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { supabase } from '@/lib/supabase';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { GEMINI } from '@/constants/geminiRhythm';

// Ionicons names (matches the icon set already used throughout this
// component and the rest of the app, e.g. PinEntryModal) — SVG glyphs
// instead of emoji, which render inconsistently across devices/OS versions.
const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'people-outline',          text: 'Unlimited family members' },
  { icon: 'calendar-outline',        text: 'Shared family calendar & events' },
  { icon: 'checkmark-done-outline',  text: 'Chores & quest system with rewards' },
  { icon: 'chatbubbles-outline',     text: 'Family chat & group messaging' },
  { icon: 'car-outline',             text: 'Ride requests & approval flow' },
  { icon: 'notifications-outline',   text: 'Smart reminders & call alerts' },
  { icon: 'trophy-outline',          text: 'Leaderboards, streaks & XP' },
  { icon: 'stats-chart-outline',     text: 'Spending & allowance tracker' },
];

interface PaywallSheetProps {
  visible: boolean;
  onClose: () => void;
  headline?: string;
  body?: string;
  perks?: string[];
}

export default function PaywallSheet({
  visible,
  onClose,
  headline,
}: PaywallSheetProps) {
  const { colors, isDark: dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { tier: currentTier, isTrial, trialDaysLeft } = useSubscriptionStore();

  const [billing, setBilling]       = useState<'annual' | 'monthly'>('annual');
  const [offering, setOffering]     = useState<any>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring]   = useState(false);

  // Parental gate — required by App Store guideline 1.3 (Kids category):
  // a child must not be able to trigger purchases without a parent solving
  // a simple math challenge first. Gate is shown before every purchase
  // attempt and re-generated each time.
  const [gateVisible, setGateVisible]   = useState(false);
  const [gateQuestion, setGateQuestion] = useState<{ a: number; b: number; answer: number }>({ a: 0, b: 0, answer: 0 });
  const [gateInput, setGateInput]       = useState('');
  const [gateError, setGateError]       = useState(false);
  // Admin-editable DISPLAY pricing (pricing_config table) — used only as
  // the fallback before RevenueCat's real offering loads, and as the
  // source of the discount badge/strikethrough RevenueCat has no
  // equivalent field for [live-requested: "admin should be able to
  // change the price in future both monthly and yearly with discount
  // showing"]. The real StoreKit price always wins once `offering` loads.
  const [pricingConfig, setPricingConfig] = useState<{
    monthlyPriceDisplay: string; yearlyPriceDisplay: string;
    monthlyWasPriceDisplay: string | null; yearlyWasPriceDisplay: string | null;
    yearlyDiscountPct: number | null; yearlyDiscountBadgeText: string | null;
  } | null>(null);
  const mountedRef       = useRef(true);
  const purchasingRef    = useRef(false);
  const pendingAlertRef  = useRef<{ title: string; message?: string; buttons?: any[] } | null>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (visible) {
      setBilling('annual');
      setPurchasing(false);
      setRestoring(false);
      if (!offering) {
        getOfferings().then(o => { if (mountedRef.current) setOffering(o); }).catch(() => {});
      }
      if (!pricingConfig) {
        (async () => {
          try {
            const { data } = await supabase.from('pricing_config').select('*').eq('plan_key', 'family_plan').maybeSingle();
            if (!mountedRef.current || !data) return;
            setPricingConfig({
              monthlyPriceDisplay: data.monthly_price_display, yearlyPriceDisplay: data.yearly_price_display,
              monthlyWasPriceDisplay: data.monthly_was_price_display, yearlyWasPriceDisplay: data.yearly_was_price_display,
              yearlyDiscountPct: data.yearly_discount_pct != null ? Number(data.yearly_discount_pct) : null,
              yearlyDiscountBadgeText: data.yearly_discount_badge_text,
            });
          } catch {}
        })();
      }
    } else {
      if (mountedRef.current) { setPurchasing(false); setRestoring(false); }
    }
  }, [visible]);

  const closeAndAlert = (title: string, message?: string, buttons?: any[]) => {
    pendingAlertRef.current = { title, message, buttons };
    onClose();
  };

  const handleDismiss = () => {
    if (pendingAlertRef.current) {
      const { title, message, buttons } = pendingAlertRef.current;
      pendingAlertRef.current = null;
      showAlert(title, message, buttons);
    }
  };

  const getPkg = () => {
    const pkgs: any[] = offering?.availablePackages ?? [];
    return pkgs.find((p: any) => {
      const rcId: string = p.identifier ?? '';
      const prodId: string = p.product?.identifier ?? p.product?.productIdentifier ?? '';
      const type: string = p.packageType ?? '';
      if (billing === 'annual') {
        return prodId === 'familycube_yearly' || rcId === '$rc_annual' || rcId.includes('annual') || type === 'ANNUAL';
      }
      return prodId === 'familycube_monthly' || rcId === '$rc_monthly' || rcId.includes('monthly') || type === 'MONTHLY';
    });
  };

  const localizedPrice = (fallback: string) => {
    const pkg = getPkg();
    return pkg?.product?.localizedPriceString ?? pkg?.product?.priceString ?? fallback;
  };

  const monthlyEquiv = () => {
    const pkg = getPkg();
    if (billing !== 'annual') return null;
    if (pkg?.product?.price != null) return `$${(pkg.product.price / 12).toFixed(2)}/mo`;
    // No live package yet — fall back to the admin-configured yearly
    // display price divided by 12, stripping any non-numeric chars
    // (currency symbol) so this works regardless of what symbol the
    // admin typed.
    const fallback = pricingConfig?.yearlyPriceDisplay ?? '$49.99';
    const numeric = parseFloat(fallback.replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? `$${(numeric / 12).toFixed(2)}/mo` : null;
  };

  const hasTrial = () => {
    const pkg = getPkg();
    return !!pkg?.product?.introPrice;
  };

  const openGate = () => {
    const a = Math.floor(Math.random() * 90) + 10;
    const b = Math.floor(Math.random() * 90) + 10;
    setGateQuestion({ a, b, answer: a + b });
    setGateInput('');
    setGateError(false);
    setGateVisible(true);
  };

  const confirmGate = () => {
    if (parseInt(gateInput, 10) === gateQuestion.answer) {
      setGateVisible(false);
      executePurchase();
    } else {
      setGateError(true);
      setGateInput('');
    }
  };

  const executePurchase = async () => {
    if (purchasingRef.current) return;
    if (!isRevenueCatReady()) {
      closeAndAlert('Not available', 'Subscriptions require a TestFlight or App Store build.');
      return;
    }
    if (!user?.id) {
      closeAndAlert('Sign in required', 'Please sign in to purchase a subscription.');
      return;
    }
    const pkg = getPkg();
    if (!pkg) {
      closeAndAlert('Not available', 'Subscription products are loading. Please try again in a moment.');
      return;
    }
    purchasingRef.current = true;
    setPurchasing(true);
    const result = await purchasePackage(pkg, user.id);
    purchasingRef.current = false;
    if (!mountedRef.current) return;
    setPurchasing(false);
    if (result.success) {
      closeAndAlert(
        'Welcome to Family Plan! 🎉',
        'Your subscription is active. Enjoy the full Family Cube experience.',
        [{ text: 'Got it!' }],
      );
    } else if (result.error) {
      closeAndAlert('Purchase failed', result.error);
    }
  };

  const handlePurchase = () => openGate();

  const handleRestore = async () => {
    if (!user?.id) { closeAndAlert('Sign in required', 'Please sign in to restore purchases.'); return; }
    if (!isRevenueCatReady()) { closeAndAlert('Not available', 'Restore requires a TestFlight or App Store build.'); return; }
    setRestoring(true);
    const result = await restorePurchases(user.id);
    if (!mountedRef.current) return;
    setRestoring(false);
    if (result.success && result.tier && result.tier !== 'free') {
      onClose();
      setTimeout(() => showAlert('Restored! 🎉', 'Your Family Plan subscription is active.', [{ text: 'Great!' }]), 400);
    } else if (result.error) {
      closeAndAlert('Restore failed', result.error);
    } else {
      closeAndAlert('Nothing to restore', 'No active subscription found for this Apple ID.');
    }
  };

  // Fallback strings come from the admin-editable pricing_config
  // [live-requested: "admin should be able to change the price in future
  // both monthly and yearly"] — the real StoreKit price always wins once
  // `offering` has loaded; these only show for the brief pre-load moment
  // or if RevenueCat fails to load entirely.
  const price = billing === 'annual'
    ? localizedPrice(pricingConfig?.yearlyPriceDisplay ?? '$49.99')
    : localizedPrice(pricingConfig?.monthlyPriceDisplay ?? '$7.99');
  const equiv = monthlyEquiv();
  const trialText = hasTrial() ? '7-day free trial, then ' : '';
  // "Was" price + discount badge — admin-editable, purely display copy
  // [live-requested: "with discounted strike value to show" / "we can
  // also add % badge too"]. Only rendered for annual, only when the
  // admin has actually set one of these fields.
  const wasPrice = billing === 'annual' ? pricingConfig?.yearlyWasPriceDisplay : pricingConfig?.monthlyWasPriceDisplay;
  const discountBadgeText = billing === 'annual'
    ? (pricingConfig?.yearlyDiscountBadgeText
        || (pricingConfig?.yearlyDiscountPct ? `Save ${pricingConfig.yearlyDiscountPct}%` : null))
    : null;

  if (!visible) return null;

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={70}>
      <View style={{ flex: 1, backgroundColor: dark ? colors.background : GEMINI.canvas }}>
        {/* Same Figma header rhythm as InvitePage.tsx — breadcrumb link,
            eyebrow, big title, subtitle — instead of a bottom sheet
            [live-requested: "lets make the paywall as full page overley" /
            "with figma rythem"]. */}
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24, paddingBottom: 2 }}>
          <TouchableOpacity onPress={() => { handleDismiss(); onClose(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: GEMINI.blue }}>← Close</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 19, fontWeight: '800', color: dark ? colors.textPrimary : GEMINI.titleColor, marginTop: 6, lineHeight: 24 }} numberOfLines={2}>
            {headline ?? 'Keep your family organized, connected, and rewarded'}
          </Text>
        </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingHorizontal: 24, paddingTop: 10, paddingBottom: insets.bottom + 12 }]}
        bounces={false}
      >

        {/* Logo — same mark as the splash screen / launch icon, for brand consistency */}
        <View style={s.logoRow}>
          <IconCubeMark size={32} />
          <Wordmark fontSize={17} dark={dark} />
        </View>

        {/* Trial countdown banner */}
        {isTrial && trialDaysLeft > 0 && (
          <View style={[s.trialBanner, { backgroundColor: dark ? 'rgba(200,150,26,0.15)' : colors.amberLight, borderColor: colors.amber }]}>
            <Text style={{ fontSize: 18 }}>⏳</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.trialBannerTitle, { color: colors.primaryText ?? colors.primary }]}>
                {trialDaysLeft === 1 ? 'Last day of your free trial' : `${trialDaysLeft} days left in your free trial`}
              </Text>
              <Text style={[s.trialBannerSub, { color: colors.textSecondary }]}>
                Subscribe now to keep full access after your trial ends.
              </Text>
            </View>
          </View>
        )}

        {/* Features — bordered Gemini card instead of a borderless grid,
            matching InvitePage.tsx's "Add Someone New" card language. */}
        <View style={{
          borderRadius: 22, borderWidth: 1, padding: 20,
          backgroundColor: dark ? colors.card : GEMINI.cardBg,
          borderColor: dark ? colors.border : GEMINI.border,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: dark ? colors.textSecondary : GEMINI.bodyColor, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            What's included
          </Text>
          {FEATURES.map((f, i) => (
            <View key={i} style={[s.featureRow, { borderBottomColor: dark ? colors.border : GEMINI.border, borderBottomWidth: i < FEATURES.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
              <View style={s.featureIcon}>
                <Ionicons name={f.icon} size={18} color={GEMINI.blue} />
              </View>
              <Text style={[s.featureText, { color: dark ? colors.textPrimary : GEMINI.titleColor }]}>{f.text}</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.teal} />
            </View>
          ))}
        </View>

        {/* Billing toggle */}
        <View style={[s.billingToggle, { backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', borderRadius: 14 }]}>
          {(['annual', 'monthly'] as const).map(b => (
            <TouchableOpacity
              key={b}
              onPress={() => setBilling(b)}
              activeOpacity={0.85}
              style={[
                s.billingOption,
                billing === b && { backgroundColor: colors.primary, borderRadius: 11 },
              ]}
            >
              <Text style={[s.billingLabel, { color: billing === b ? '#fff' : colors.textSecondary }]}>
                {b === 'annual' ? 'Annual' : 'Monthly'}
              </Text>
              {/* Discount badge — admin-editable (pricing_config), only
                  shown when the admin has set a % or override text
                  [live-requested: "with discounted strike value to
                  show" / "we can also add % badge too"]. Was previously
                  hardcoded "Save 40%" at a pricing tier with no actual
                  discount; now genuinely reflects whatever the admin
                  configures. */}
              {b === 'annual' && discountBadgeText && (
                <View style={[s.savePill, { backgroundColor: billing === 'annual' ? 'rgba(255,255,255,0.25)' : colors.primaryLight }]}>
                  <Text style={[s.savePillText, { color: billing === 'annual' ? '#fff' : colors.primaryText ?? colors.primary }]}>{discountBadgeText}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Price card */}
        <View style={[s.priceCard, {
          backgroundColor: dark ? 'rgba(205,123,87,0.15)' : colors.primaryLight,
          borderColor: colors.primary,
        }]}>
          <View style={s.priceRow}>
            {/* Strikethrough "was" price — admin-editable, only shown
                when set [live-requested: "with discounted strike value
                to show"]. */}
            {wasPrice && (
              <Text style={[s.priceWas, { color: colors.danger }]}>
                {wasPrice}
              </Text>
            )}
            <Text style={[s.priceMain, { color: dark ? colors.primary : colors.primaryText ?? colors.primary }]}>{price}</Text>
            <Text style={[s.pricePer, { color: dark ? colors.primary : colors.primaryText ?? colors.primary }]}>
              {billing === 'annual' ? ' / year' : ' / month'}
            </Text>
          </View>
          {equiv && (
            <Text style={[s.priceEquiv, { color: dark ? colors.primary : colors.primaryText ?? colors.primary }]}>
              That's just {equiv} — less than a coffee
            </Text>
          )}
          {trialText !== '' && (
            <Text style={[s.trialNote, { color: colors.textSecondary }]}>
              {trialText}billed {billing === 'annual' ? 'annually' : 'monthly'}. Cancel anytime.
            </Text>
          )}
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={handlePurchase}
          disabled={purchasing}
          activeOpacity={0.88}
          style={withAndroidShadowFix([s.cta, { backgroundColor: colors.primary }])}
        >
          {purchasing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.ctaText}>
                {hasTrial() ? 'Start 7-Day Free Trial' : 'Subscribe — Family Plan'}
              </Text>
          }
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={s.restoreBtn}>
          {restoring
            ? <ActivityIndicator color={colors.textSecondary} size="small" />
            : <Text style={[s.restoreText, { color: colors.textSecondary }]}>Restore previous purchase</Text>
          }
        </TouchableOpacity>

        {/* Legal */}
        <Text style={[s.legal, { color: colors.textSecondary }]}>
          Payment will be charged to your Apple ID at confirmation. Subscription renews automatically unless cancelled at least 24 hours before the current period ends. Manage or cancel in Settings › Subscriptions.
        </Text>
        {/* App Store guideline 3.1.2: working links to the Terms of Use (EULA) and the Privacy Policy on the subscription screen. */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingBottom: 8 }}>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link">
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' }}>Terms of Use</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onClose(); router.push('/terms'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link">
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Parental gate — App Store guideline 1.3 (Kids category):
          a parent must solve a simple addition challenge before any
          purchase can proceed. A child cannot easily bypass this. */}
      <Modal supportedOrientations={['portrait', 'landscape']}
        visible={gateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGateVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.gateOverlay}
        >
          <View style={[s.gateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={[s.gateTitle, { color: colors.textPrimary }]}>Parent Check</Text>
            <Text style={[s.gateSub, { color: colors.textSecondary }]}>
              To confirm this purchase, please answer the question below.
            </Text>
            <Text style={[s.gateQ, { color: colors.textPrimary }]}>
              What is {gateQuestion.a} + {gateQuestion.b}?
            </Text>
            <TextInput
              style={[s.gateInput, {
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderColor: gateError ? colors.danger : colors.border,
              }]}
              keyboardType="number-pad"
              value={gateInput}
              onChangeText={v => { setGateInput(v); setGateError(false); }}
              placeholder="Your answer"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              maxLength={6}
            />
            {gateError && (
              <Text style={[s.gateErr, { color: colors.danger }]}>Incorrect — please try again.</Text>
            )}
            <View style={s.gateButtons}>
              <TouchableOpacity
                onPress={() => setGateVisible(false)}
                style={[s.gateCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[s.gateCancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmGate}
                style={[s.gateConfirmBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={s.gateConfirmTxt}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      </View>
    </FullPageOverlay>
  );
}

const s = StyleSheet.create({
  content:          { paddingBottom: 16, gap: 10 },
  logoRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 0 },
  trialBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 },
  trialBannerTitle: { fontSize: 13, fontWeight: '700', marginBottom: 1 },
  trialBannerSub:   { fontSize: 11, lineHeight: 14 },
  headline:         { fontSize: 17, fontWeight: '700', textAlign: 'center', lineHeight: 24, paddingHorizontal: 4 },
  featuresGrid:     { borderRadius: 14, overflow: 'hidden' },
  featureRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  featureIcon:      { width: 22, alignItems: 'center', justifyContent: 'center' },
  featureText:      { flex: 1, fontSize: 12.5, fontWeight: '500' },
  billingToggle:    { flexDirection: 'row', padding: 3, gap: 3 },
  billingOption:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 6 },
  billingLabel:     { fontSize: 13, fontWeight: '600' },
  savePill:         { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5 },
  savePillText:     { fontSize: 11, fontWeight: '700' },
  priceCard:        { borderWidth: 1.5, borderRadius: 14, padding: 12, alignItems: 'center', gap: 2 },
  priceRow:         { flexDirection: 'row', alignItems: 'baseline' },
  priceWas:         { fontSize: 14, fontWeight: '600', textDecorationLine: 'line-through', opacity: 0.55, marginRight: 5 },
  priceMain:        { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  pricePer:         { fontSize: 13, fontWeight: '600' },
  priceEquiv:       { fontSize: 11, fontWeight: '500', opacity: 0.8 },
  trialNote:        { fontSize: 10.5, textAlign: 'center', marginTop: 1 },
  cta:              { borderRadius: 14, paddingVertical: 13, alignItems: 'center', shadowColor: '#CD7B57', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 4 },
  ctaText:          { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  restoreBtn:       { alignItems: 'center', paddingVertical: 2 },
  restoreText:      { fontSize: 12 },
  legal:            { fontSize: 10, textAlign: 'center', lineHeight: 13, opacity: 0.7 },
  gateOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  gateCard:         { width: '100%', borderRadius: 20, borderWidth: 1, padding: 24, gap: 10 },
  gateTitle:        { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  gateSub:          { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  gateQ:            { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  gateInput:        { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  gateErr:          { fontSize: 13, textAlign: 'center' },
  gateButtons:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  gateCancelBtn:    { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  gateCancelTxt:    { fontSize: 15, fontWeight: '600' },
  gateConfirmBtn:   { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  gateConfirmTxt:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});
