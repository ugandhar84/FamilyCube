import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import BottomSheet from '@/components/BottomSheet';
import { showAlert } from '@/components/AppAlert';
import { IconCubeMark, Wordmark } from '@/components/FamilyCubeLogo';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatReady } from '@/lib/subscription';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { supabase } from '@/lib/supabase';

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
  const { user } = useAuthStore();
  const { tier: currentTier, isTrial, trialDaysLeft } = useSubscriptionStore();

  const [billing, setBilling]       = useState<'annual' | 'monthly'>('annual');
  const [offering, setOffering]     = useState<any>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring]   = useState(false);
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
    const fallback = pricingConfig?.yearlyPriceDisplay ?? '$47.88';
    const numeric = parseFloat(fallback.replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? `$${(numeric / 12).toFixed(2)}/mo` : null;
  };

  const hasTrial = () => {
    const pkg = getPkg();
    return !!pkg?.product?.introPrice;
  };

  const handlePurchase = async () => {
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
    ? localizedPrice(pricingConfig?.yearlyPriceDisplay ?? '$47.88')
    : localizedPrice(pricingConfig?.monthlyPriceDisplay ?? '$3.99');
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

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismiss={handleDismiss}
      title="Family Plan"
      titleIcon={<Text style={{ fontSize: 22 }}>🏡</Text>}
      subtitle="Everything your family needs, in one place"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        bounces={false}
      >

        {/* Logo — same mark as the splash screen / launch icon, for brand consistency */}
        <View style={s.logoRow}>
          <IconCubeMark size={48} />
          <Wordmark fontSize={22} dark={dark} />
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

        {/* Headline */}
        <Text style={[s.headline, { color: colors.textPrimary }]}>
          {headline ?? 'Keep your family organized, connected, and rewarded'}
        </Text>

        {/* Features grid */}
        <View style={s.featuresGrid}>
          {FEATURES.map((f, i) => (
            <View key={i} style={[s.featureRow, { borderBottomColor: colors.border }]}>
              <View style={s.featureIcon}>
                <Ionicons name={f.icon} size={18} color={colors.primary} />
              </View>
              <Text style={[s.featureText, { color: colors.textPrimary }]}>{f.text}</Text>
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
              <Text style={[s.priceWas, { color: dark ? colors.primaryLight : colors.primaryText ?? colors.primary }]}>
                {wasPrice}
              </Text>
            )}
            <Text style={[s.priceMain, { color: dark ? colors.primaryLight : colors.primaryText ?? colors.primary }]}>{price}</Text>
            <Text style={[s.pricePer, { color: dark ? colors.primaryLight : colors.primaryText ?? colors.primary }]}>
              {billing === 'annual' ? ' / year' : ' / month'}
            </Text>
          </View>
          {equiv && (
            <Text style={[s.priceEquiv, { color: dark ? colors.primaryLight : colors.primaryText ?? colors.primary }]}>
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
          style={[s.cta, { backgroundColor: colors.primary }]}
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

      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  content:          { paddingBottom: 32, gap: 16 },
  logoRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 4 },
  trialBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  trialBannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  trialBannerSub:   { fontSize: 12, lineHeight: 16 },
  headline:         { fontSize: 17, fontWeight: '700', textAlign: 'center', lineHeight: 24, paddingHorizontal: 4 },
  featuresGrid:     { borderRadius: 14, overflow: 'hidden' },
  featureRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  featureIcon:      { width: 26, alignItems: 'center', justifyContent: 'center' },
  featureText:      { flex: 1, fontSize: 14, fontWeight: '500' },
  billingToggle:    { flexDirection: 'row', padding: 4, gap: 4 },
  billingOption:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 8 },
  billingLabel:     { fontSize: 14, fontWeight: '600' },
  savePill:         { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  savePillText:     { fontSize: 11, fontWeight: '700' },
  priceCard:        { borderWidth: 1.5, borderRadius: 16, padding: 18, alignItems: 'center', gap: 4 },
  priceRow:         { flexDirection: 'row', alignItems: 'baseline' },
  priceWas:         { fontSize: 18, fontWeight: '600', textDecorationLine: 'line-through', opacity: 0.55, marginRight: 6 },
  priceMain:        { fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  pricePer:         { fontSize: 16, fontWeight: '600' },
  priceEquiv:       { fontSize: 13, fontWeight: '500', opacity: 0.8 },
  trialNote:        { fontSize: 12, textAlign: 'center', marginTop: 2 },
  cta:              { borderRadius: 16, paddingVertical: 17, alignItems: 'center', shadowColor: '#CD7B57', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 6 },
  ctaText:          { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  restoreBtn:       { alignItems: 'center', paddingVertical: 4 },
  restoreText:      { fontSize: 13 },
  legal:            { fontSize: 11, textAlign: 'center', lineHeight: 16, opacity: 0.7 },
});
