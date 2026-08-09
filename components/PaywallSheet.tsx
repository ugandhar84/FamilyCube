import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import BottomSheet from '@/components/BottomSheet';
import { showAlert } from '@/components/AppAlert';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatReady } from '@/lib/subscription';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePaywallCopy } from '@/lib/hooks/usePaywallCopy';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeatures';

interface PaywallSheetProps {
  visible: boolean;
  onClose: () => void;
  headline: string;
  body: string;
  petName?: string;
  perks?: string[];
}

export default function PaywallSheet({
  visible,
  onClose,
  headline,
  body,
  petName,
  perks,
}: PaywallSheetProps) {
  const copy = usePaywallCopy();
  const planFeatures = usePlanFeatures();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { tier: currentTier } = useSubscriptionStore();
  const resolvedPerks = perks?.length
    ? perks
    : planFeatures[currentTier === 'pro' ? 'ultimate' : 'pro']
        .filter(f => f.included)
        .map(f => f.text);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'ultimate'>('ultimate');
  const [billing, setBilling]           = useState<'annual' | 'monthly'>('annual');
  const [offering, setOffering]         = useState<any>(null);
  const [purchasing, setPurchasing]     = useState<string | null>(null);
  const [restoring, setRestoring]       = useState(false);
  const mountedRef = useRef(true);
  const purchasingRef = useRef(false);
  const pendingAlertRef = useRef<{ title: string; message?: string; buttons?: { text: string; onPress?: () => void }[] } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      // Reset UI state every time the sheet opens
      setSelectedPlan('ultimate');
      setBilling('annual');
      setPurchasing(null);
      setRestoring(false);
      if (!offering) {
        getOfferings().then(o => { if (mountedRef.current) setOffering(o); }).catch(() => {});
      }
    } else {
      // Clear in-flight states when sheet closes so nothing fires on unmounted component
      if (mountedRef.current) {
        setPurchasing(null);
        setRestoring(false);
      }
    }
  }, [visible]);

  const localizedPrice = (idSubstr: string, fallback: string) => {
    const pkg = offering?.availablePackages?.find((p: any) =>
      (p.product?.productIdentifier ?? '').includes(idSubstr)
    );
    return pkg?.product?.localizedPriceString ?? `$${fallback}`;
  };

  // Close sheet then show alert after the dismiss animation fully completes.
  // Uses onDismiss (fired by iOS Modal after animation) instead of a fixed timeout
  // to avoid the stacked-Modal touch freeze when the alert fires too early.
  const closeAndAlert = (title: string, message?: string, buttons?: { text: string; onPress?: () => void }[]) => {
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

  const handlePurchase = async (planKey: 'pro' | 'ultimate') => {
    if (purchasingRef.current) return;
    if (planKey === currentTier) {
      closeAndAlert('Already subscribed', `You are already on the ${planKey === 'ultimate' ? 'Ultimate' : 'Pro'} plan.`);
      return;
    }
    if (!isRevenueCatReady()) {
      closeAndAlert('Not available', 'Subscriptions require a TestFlight or App Store build.');
      return;
    }
    if (!user?.id) {
      closeAndAlert('Sign in required', 'Please sign in to purchase a subscription.');
      return;
    }
    if (!offering) {
      closeAndAlert('No Offering', `RC returned no offering. RC ready: ${isRevenueCatReady()}, user: ${!!user?.id}`);
      return;
    }
    const packages: any[] = offering.availablePackages ?? [];
    const pkgDebug = packages.map((p: any) => `${p.product?.identifier ?? p.product?.productIdentifier}|${p.packageType}`).join(', ');
    const pkg = packages.find((p: any) => {
      const id: string = p.product?.identifier ?? p.product?.productIdentifier ?? '';
      const rcType: string = p.packageType ?? '';
      const isUltimate = id.includes('ultimate');
      const isPro = id.includes('pro') && !isUltimate;
      if (planKey === 'pro') {
        if (billing === 'annual') return id.includes('pro_annual') || (isPro && rcType === 'ANNUAL');
        return id.includes('pro_monthly') || (isPro && rcType === 'MONTHLY');
      }
      if (planKey === 'ultimate') {
        if (billing === 'annual') return id.includes('ultimate_annual') || (isUltimate && rcType === 'ANNUAL');
        return id.includes('ultimate_monthly') || (isUltimate && rcType === 'MONTHLY');
      }
      return false;
    });
    if (!pkg) {
      closeAndAlert('Package not found', `Plan: ${planKey}, billing: ${billing}\nPackages: ${pkgDebug || 'none'}`);
      return;
    }
    purchasingRef.current = true;
    setPurchasing(planKey);
    await new Promise(r => setTimeout(r, 0)); // flush UI before async call
    const result = await purchasePackage(pkg, user.id);
    purchasingRef.current = false;
    if (!mountedRef.current) {
      if (!result.success && result.error) showAlert('Purchase failed', result.error);
      return;
    }
    setPurchasing(null);
    if (result.success) {
      closeAndAlert(
        'Welcome! 🎉',
        `You are now on ${result.tier === 'ultimate' ? 'Ultimate' : 'Pro'}! Tap Reload to activate all features now.`,
        [
          { text: 'Restart', onPress: () => Alert.alert('Restart PawBond', 'Please close and reopen the app to activate all features.') },
          { text: 'Later' },
        ],
      );
    } else if (result.error) {
      closeAndAlert('Purchase failed', result.error ?? 'Please try again.');
    }
  };

  const handleRestore = async () => {
    if (!user?.id) {
      closeAndAlert('Sign in required', 'Please sign in to restore purchases.');
      return;
    }
    if (!isRevenueCatReady()) {
      closeAndAlert('Not available', 'Restore requires a TestFlight or App Store build.');
      return;
    }
    setRestoring(true);
    const result = await restorePurchases(user.id);
    if (!mountedRef.current) return;
    setRestoring(false);
    if (result.success && result.tier && result.tier !== 'free') {
      onClose();
      setTimeout(() => showAlert(
        'Restored! 🎉',
        `Your ${result.tier === 'ultimate' ? 'Ultimate' : 'Pro'} subscription is active. Tap Reload to activate all features now.`,
        [
          { text: 'Restart', onPress: () => Alert.alert('Restart PawBond', 'Please close and reopen the app to activate all features.') },
          { text: 'Later' },
        ],
      ), 400);
    } else if (result.error) {
      closeAndAlert('Restore failed', result.error);
    } else {
      closeAndAlert('Nothing to restore', 'No active subscription found on this Apple ID. Make sure you are signed in with the same Apple ID used for the original purchase.');
    }
  };

  const proPrice = billing === 'annual'
    ? localizedPrice('pro_annual',    '39.99')
    : localizedPrice('pro_monthly',   '5.99');
  const pawPrice = billing === 'annual'
    ? localizedPrice('ultimate_annual', '69.99')
    : localizedPrice('ultimate_monthly','9.99');

  // Derive per-month from RevenueCat annual package price
  const annualProPkg  = offering?.availablePackages?.find((p: any) => (p.product?.productIdentifier ?? '').includes('pro_annual'));
  const annualPawPkg  = offering?.availablePackages?.find((p: any) => (p.product?.productIdentifier ?? '').includes('ultimate_annual'));
  const proMo  = billing === 'annual' && annualProPkg
    ? `${annualProPkg.product.currencyCode ?? '$'}${(annualProPkg.product.price / 12).toFixed(2)}/mo`
    : null;
  const pawMo  = billing === 'annual' && annualPawPkg
    ? `${annualPawPkg.product.currencyCode ?? '$'}${(annualPawPkg.product.price / 12).toFixed(2)}/mo`
    : null;

  const sheetTitle    = currentTier === 'pro' ? 'PawBond Ultimate' : 'PawBond Pro';
  const sheetSubtitle = currentTier === 'pro' ? 'Unlock the full Ultimate experience' : 'Unlock the full experience';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismiss={handleDismiss}
      title={currentTier === 'pro' ? 'Upgrade to Ultimate' : 'PawBond Pro & Ultimate'}
      titleIcon={<Text style={{ fontSize: 22 }}>🩺</Text>}
      subtitle={copy.trial_subtitle}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content} bounces={false}>

        {/* Emotional headline */}
        <Text style={[s.headline, { color: colors.textPrimary }]}>{headline}</Text>

        {/* Price anchor */}
        <View style={[s.anchorBanner, { backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.20)' }]}>
          <Text style={{ fontSize: 16 }}>🏥</Text>
          <Text style={[s.anchorText, { color: colors.textPrimary }]}>{copy.anchor_text}</Text>
        </View>

        {/* Perks */}
        <View style={[s.perksCard, { backgroundColor: 'rgba(124,92,191,0.07)', borderColor: 'rgba(124,92,191,0.18)' }]}>
          {resolvedPerks.map((perk, i) => (
            <View key={i} style={s.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#7C5CBF" />
              <Text style={[s.perkText, { color: colors.textPrimary }]}>{perk}</Text>
            </View>
          ))}
        </View>

        {/* Billing toggle */}
        <View style={[s.billingToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['annual', 'monthly'] as const).map(b => (
            <TouchableOpacity
              key={b}
              onPress={() => setBilling(b)}
              style={[s.billingOption, billing === b && { backgroundColor: colors.primary, borderRadius: 10 }]}
              activeOpacity={0.8}
            >
              <Text style={[s.billingOptionText, { color: billing === b ? '#fff' : colors.textSecondary }]}>
                {b === 'annual' ? copy.annual_save_label : 'Monthly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Plan cards — Pro users skip the Pro card entirely, see only the upgrade price */}
        {currentTier === 'pro' && (
          <View style={[s.currentPlanBanner, { backgroundColor: 'rgba(124,92,191,0.10)', borderColor: 'rgba(124,92,191,0.25)' }]}>
            <Ionicons name="checkmark-circle" size={14} color="#7C5CBF" />
            <Text style={[s.currentPlanText, { color: colors.primaryText ?? colors.primary }]}>You're on Pro · Upgrade price to Ultimate below</Text>
          </View>
        )}

        <View style={s.planRow}>
          {currentTier === 'free' && (
            <TouchableOpacity
              style={[s.planCard, { backgroundColor: colors.card, borderColor: selectedPlan === 'pro' ? colors.primary : colors.border, borderWidth: selectedPlan === 'pro' ? 2 : StyleSheet.hairlineWidth }]}
              onPress={() => setSelectedPlan('pro')}
              activeOpacity={0.82}
            >
              <Text style={[s.planLabel, { color: colors.textTertiary ?? colors.textSecondary }]}>PRO</Text>
              <Text style={[s.planPrice, { color: colors.textPrimary }]}>
                {proPrice}<Text style={[s.planPer, { color: colors.textSecondary }]}>{billing === 'annual' ? '/yr' : '/mo'}</Text>
              </Text>
              {proMo && <Text style={[s.planMo, { color: colors.textSecondary }]}>{proMo}</Text>}
              <Text style={[s.planFeatureNote, { color: colors.textTertiary ?? colors.textSecondary }]}>{copy.pro_feature_note}</Text>
            </TouchableOpacity>
          )}

          {/* Ultimate — full width when Pro user (no side-by-side card), pre-selected with glow for free users */}
          <TouchableOpacity
            style={[s.planCard, { backgroundColor: colors.card },
              (selectedPlan === 'ultimate' || currentTier === 'pro') && s.planCardGlow,
              currentTier === 'ultimate' && { borderColor: colors.primary, borderWidth: 2 },
              currentTier === 'pro' && { flex: 1 },
            ]}
            onPress={() => setSelectedPlan('ultimate')}
            activeOpacity={0.82}
            disabled={currentTier === 'ultimate'}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[s.planLabel, { color: colors.textTertiary ?? colors.textSecondary }]}>ULTIMATE</Text>
              <View style={s.recoBadge}><Text style={s.recoBadgeTxt}>⭐ Best</Text></View>
            </View>
            <Text style={[s.planPrice, { color: colors.textPrimary }]}>
              {pawPrice}<Text style={[s.planPer, { color: colors.textSecondary }]}>{billing === 'annual' ? '/yr' : '/mo'}</Text>
            </Text>
            {pawMo && <Text style={[s.pawMo, { color: colors.primaryText ?? colors.primary }]}>Only {pawMo}</Text>}
            {currentTier === 'pro' && (
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                Upgrade from Pro · Apple automatically credits unused Pro time so you only pay the difference.
              </Text>
            )}
            <Text style={[s.planFeatureNote, { color: colors.textTertiary ?? colors.textSecondary }]}>{copy.ultimate_feature_note}</Text>
            {currentTier === 'ultimate' && <Text style={s.currentBadge}>Current plan</Text>}
          </TouchableOpacity>
        </View>

        {/* Primary CTA — 7-day free trial */}
        <TouchableOpacity
          style={[s.trialCta, (!!purchasing || restoring) && s.trialCtaDisabled]}
          onPress={() => handlePurchase(currentTier === 'pro' ? 'ultimate' : selectedPlan)}
          disabled={!!purchasing || restoring || currentTier === 'ultimate'}
          activeOpacity={0.87}
        >
          {purchasing ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={s.trialCtaText}>Processing…</Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 18 }}>🎯</Text>
              <Text style={s.trialCtaText}>{copy.trial_cta_text}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} disabled={restoring || !!purchasing} style={s.restoreBtn}>
          {restoring
            ? <ActivityIndicator size="small" color={colors.textTertiary} />
            : <Text style={[s.restoreText, { color: colors.textTertiary ?? colors.textSecondary }]}>Restore purchase</Text>}
        </TouchableOpacity>
        <Text style={[s.microCopy, { color: colors.textTertiary ?? colors.textSecondary }]}>{copy.micro_copy}</Text>
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  content:      { paddingBottom: 16, gap: 14 },
  headline:     { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, lineHeight: 26 },
  anchorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  anchorText:   { fontSize: 14, lineHeight: 19, flex: 1 },
  perksCard:    { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  perkRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText:     { fontSize: 14, fontWeight: '500', flex: 1 },
  billingToggle:{ flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 2 },
  billingOption:{ flex: 1, paddingVertical: 8, alignItems: 'center' },
  billingOptionText: { fontSize: 14, fontWeight: '700' },
  planRow:      { flexDirection: 'row', gap: 10 },
  planCard:     { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, gap: 5 },
  planCardGlow: { borderWidth: 2.5, borderColor: "#7C5CBF",
                  shadowColor: "#7C5CBF", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  planLabel:    { fontSize: 14, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  planPrice:    { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  planPer:      { fontSize: 14, fontWeight: '500' },
  planMo:       { fontSize: 14, fontWeight: '700' },
  pawMo:        { fontSize: 14, fontWeight: '800' },
  planFeatureNote: { fontSize: 14, marginTop: 2 },
  currentBadge: { fontSize: 14, fontWeight: '700', color: "#7C5CBF", marginTop: 4, textAlign: 'center' },
  recoBadge:    { backgroundColor: "#7C5CBF", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  recoBadgeTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  currentPlanBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  currentPlanText:   { fontSize: 14, fontWeight: '600', flex: 1 },
  trialCta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  backgroundColor: '#5B21B6', borderRadius: 18, paddingVertical: 17,
                  shadowColor: '#5B21B6', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  trialCtaDisabled: { backgroundColor: '#9E9E9E', shadowOpacity: 0, elevation: 0 },
  trialCtaText: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 0.1 },
  restoreBtn:   { alignItems: 'center', paddingVertical: 4 },
  restoreText:  { fontSize: 14, fontWeight: '500' },
  microCopy:    { fontSize: 14, textAlign: 'center' },
});
