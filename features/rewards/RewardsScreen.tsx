import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Linking, Alert,
  Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import {
  fetchOffers, fetchMyCoupons, redeemOffer, fetchCoinBalance,
  PartnerOffer, UserCoupon,
} from '@/lib/db/rewards';
import { supabase } from '@/lib/supabase';
import { TYPO } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'offers' | 'my_coupons';

const CATEGORIES = [
  { key: 'all',        label: 'All',       icon: '✨' },
  { key: 'food',       label: 'Food',      icon: '🥩' },
  { key: 'accessories',label: 'Gear',      icon: '🎒' },
  { key: 'grooming',   label: 'Grooming',  icon: '✂️' },
  { key: 'vet',        label: 'Vet',       icon: '🏥' },
  { key: 'toys',       label: 'Toys',      icon: '🎾' },
] as const;

// ─── Coin chip ────────────────────────────────────────────────────────────────

function CoinBadge({ amount, size = 'md', spent }: { amount: number; size?: 'sm' | 'md'; spent?: boolean }) {
  const { colors } = useTheme();
  const fs = size === 'sm' ? 12 : 14;
  return (
    <View style={[cb.wrap, spent && { backgroundColor: colors.border + '60' }]}>
      <Text style={[cb.icon, { fontSize: fs }]}>🪙</Text>
      <Text style={[cb.label, { fontSize: fs, color: spent ? colors.textSecondary : '#C8860A' }]}>
        {amount.toLocaleString()}
      </Text>
    </View>
  );
}
const cb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  icon:  {},
  label: { fontWeight: '700' },
});

// ─── Offer card ───────────────────────────────────────────────────────────────

function OfferCard({
  offer, balance, alreadyRedeemed, onRedeem,
}: {
  offer: PartnerOffer;
  balance: number;
  alreadyRedeemed: boolean;
  onRedeem: (offer: PartnerOffer) => void;
}) {
  const { colors } = useTheme();
  const canAfford = balance >= offer.coins_cost;
  const isSoldOut = offer.total_stock != null && offer.redeemed_count >= offer.total_stock;
  const disabled  = alreadyRedeemed || isSoldOut;

  const discountLabel = offer.discount_pct
    ? `${offer.discount_pct}% OFF`
    : offer.discount_amt
    ? `$${offer.discount_amt} OFF`
    : null;

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: offer.is_featured ? '#7C5CBF33' : colors.border }]}>
      {offer.is_featured && (
        <View style={s.featuredBadge}>
          <Text style={s.featuredText}>⭐ FEATURED</Text>
        </View>
      )}

      <View style={s.cardHeader}>
        <Text style={s.partnerLogo}>{offer.partner_logo ?? '🏪'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.partnerName, { color: colors.textSecondary }]}>{offer.partner_name}</Text>
          <Text style={[s.offerTitle, { color: colors.textPrimary }]} numberOfLines={2}>{offer.title}</Text>
        </View>
        {discountLabel && (
          <View style={s.discountBadge}>
            <Text style={s.discountText}>{discountLabel}</Text>
          </View>
        )}
      </View>

      {!!offer.description && (
        <Text style={[s.desc, { color: colors.textSecondary }]} numberOfLines={2}>{offer.description}</Text>
      )}

      {offer.valid_until && (
        <Text style={[s.expiry, { color: colors.textTertiary }]}>
          Expires {new Date(offer.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      )}

      <View style={s.cardFooter}>
        <CoinBadge amount={offer.coins_cost} />
        {!canAfford && !alreadyRedeemed && !isSoldOut && (
          <Text style={[s.needMore, { color: colors.textSecondary }]}>
            Need {(offer.coins_cost - balance).toLocaleString()} more
          </Text>
        )}
        <TouchableOpacity
          style={[s.redeemBtn, {
            backgroundColor: disabled ? colors.border
              : !canAfford ? colors.border
              : '#7C5CBF',
            opacity: disabled ? 0.6 : 1,
          }]}
          onPress={() => !disabled && canAfford && onRedeem(offer)}
          disabled={disabled || !canAfford}
          activeOpacity={0.75}
        >
          <Text style={[s.redeemText, { color: disabled || !canAfford ? colors.textSecondary : '#fff' }]}>
            {isSoldOut ? 'Sold out' : alreadyRedeemed ? 'Redeemed ✓' : !canAfford ? 'Not enough' : 'Redeem'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── My coupon card ───────────────────────────────────────────────────────────

function MyCouponCard({ coupon, onUse }: { coupon: UserCoupon; onUse: (c: UserCoupon) => void }) {
  const { colors } = useTheme();
  const isExpired = coupon.status === 'expired' || (coupon.expires_at && new Date(coupon.expires_at) < new Date());
  const isUsed    = coupon.status === 'used';
  const dim       = isExpired || isUsed;

  return (
    <View style={[s.myCoupon, { backgroundColor: colors.card, borderColor: colors.border, opacity: dim ? 0.55 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.partnerName, { color: colors.textSecondary }]}>
          {(coupon.offer as any)?.partner_name ?? 'Partner'}
        </Text>
        <Text style={[s.offerTitle, { color: colors.textPrimary, fontSize: TYPO.body }]} numberOfLines={1}>
          {(coupon.offer as any)?.title ?? 'Coupon'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <CoinBadge amount={coupon.coins_spent} size="sm" spent />
          {coupon.expires_at && !isExpired && !isUsed && (
            <Text style={[s.expiry, { color: colors.textTertiary }]}>
              Exp {new Date(coupon.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          )}
          {isExpired && <Text style={[s.expiry, { color: '#E0525A' }]}>Expired</Text>}
          {isUsed    && <Text style={[s.expiry, { color: '#22C55E' }]}>Used ✓</Text>}
        </View>
      </View>

      {coupon.coupon_code ? (
        <TouchableOpacity
          style={[s.codeBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
          onPress={() => !dim && onUse(coupon)}
          disabled={dim}
          activeOpacity={0.7}
        >
          <Text style={[s.codeText, { color: colors.textPrimary }]}>{coupon.coupon_code}</Text>
          <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.redeemBtn, { backgroundColor: dim ? colors.border : '#7C5CBF' }]}
          onPress={() => !dim && onUse(coupon)}
          disabled={dim}
          activeOpacity={0.75}
        >
          <Text style={[s.redeemText, { color: dim ? colors.textSecondary : '#fff' }]}>
            {dim ? (isUsed ? 'Used' : 'Expired') : 'Open link'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RewardsScreen({ onClose }: { onClose?: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user   = useAuthStore(s => s.user);

  const [tab,           setTab]           = useState<Tab>('offers');
  const [category,      setCategory]      = useState<string>('all');
  const [offers,        setOffers]        = useState<PartnerOffer[]>([]);
  const [myCoupons,     setMyCoupons]     = useState<UserCoupon[]>([]);
  const [balance,       setBalance]       = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [redeeming,     setRedeeming]     = useState<string | null>(null);
  const [redeemedIds,   setRedeemedIds]   = useState<Set<string>>(new Set());
  const [showFab,       setShowFab]       = useState(false);

  const coinAnim   = useRef(new Animated.Value(1)).current;
  const scrollRef  = useRef<ScrollView>(null);
  const couponsRef = useRef<ScrollView>(null);

  const load = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    try {
      const [o, c, bal] = await Promise.all([
        fetchOffers(),
        fetchMyCoupons(user.id),
        fetchCoinBalance(user.id),
      ]);
      setOffers(o);
      setMyCoupons(c);
      setBalance(bal);
      setRedeemedIds(new Set(c.map(x => x.offer_id)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const pulseCoin = () => {
    Animated.sequence([
      Animated.timing(coinAnim, { toValue: 1.3, duration: 120, useNativeDriver: true }),
      Animated.spring(coinAnim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 6 }),
    ]).start();
  };

  const handleRedeem = useCallback(async (offer: PartnerOffer) => {
    if (!user?.id) return;
    Alert.alert(
      `Redeem for ${offer.coins_cost.toLocaleString()} coins?`,
      `${offer.title}\n\nThis will deduct ${offer.coins_cost.toLocaleString()} coins from your balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          style: 'default',
          onPress: async () => {
            setRedeeming(offer.id);
            try {
              const result = await redeemOffer(user.id, offer.id);
              if (!result.ok) {
                Alert.alert('Could not redeem', result.error ?? 'Something went wrong.');
                return;
              }
              setBalance(result.coins_left ?? 0);
              setRedeemedIds(prev => new Set([...prev, offer.id]));
              pulseCoin();
              await load(true);

              // Show the coupon immediately
              if (result.coupon_code) {
                Alert.alert(
                  '🎉 Coupon unlocked!',
                  `Your code: ${result.coupon_code}\n\nCopied to clipboard — paste it at ${offer.partner_name}.`,
                  [{ text: 'Done' }],
                );
                await Clipboard.setStringAsync(result.coupon_code);
              } else if (result.affiliate_url) {
                Alert.alert(
                  '🎉 Offer unlocked!',
                  `Your discount link is ready for ${offer.partner_name}.`,
                  [
                    { text: 'Open now', onPress: () => Linking.openURL(result.affiliate_url!) },
                    { text: 'Later', style: 'cancel' },
                  ],
                );
              }
              setTab('my_coupons');

              // Fire send-coupon edge function (push + email delivery)
              // Non-blocking — don't await, failure doesn't affect UX
              if (result.coupon_id) {
                supabase.functions.invoke('send-coupon', {
                  body: { coupon_id: result.coupon_id },
                }).catch(() => {});
              }
            } finally {
              setRedeeming(null);
            }
          },
        },
      ],
    );
  }, [user?.id, load]);

  const handleUseCoupon = useCallback(async (coupon: UserCoupon) => {
    if (coupon.coupon_code) {
      await Clipboard.setStringAsync(coupon.coupon_code);
      Alert.alert('Copied!', `Code ${coupon.coupon_code} copied to clipboard.`);
    } else {
      const offer = coupon.offer as any;
      if (offer?.affiliate_url) Linking.openURL(offer.affiliate_url);
    }
  }, []);

  const filteredOffers = category === 'all'
    ? offers
    : offers.filter(o => o.category === category);

  const scrollToTop = () => {
    (tab === 'offers' ? scrollRef : couponsRef).current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* Header — compact */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Rewards</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>Earn coins · Redeem deals</Text>
        </View>
        <Animated.View style={{ transform: [{ scale: coinAnim }] }}>
          <CoinBadge amount={balance} />
        </Animated.View>
      </View>

      {/* Tab toggle */}
      <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
        {(['offers', 'my_coupons'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && { borderBottomColor: '#7C5CBF', borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabLabel, { color: tab === t ? '#7C5CBF' : colors.textSecondary }]}>
              {t === 'offers' ? '🏷️ Offers' : `🎟️ My Coupons${myCoupons.length > 0 ? ` (${myCoupons.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7C5CBF" style={{ marginTop: 60 }} />
      ) : tab === 'offers' ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#7C5CBF" />}
          onScroll={e => setShowFab(e.nativeEvent.contentOffset.y > 200)}
          scrollEventThrottle={100}
        >
          {/* Category filter chips — fixed height row */}
          <View style={s.catRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} contentContainerStyle={s.catScroll}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[s.catChip, { borderColor: colors.border, backgroundColor: category === c.key ? '#7C5CBF' : colors.card }, category === c.key && { borderColor: '#7C5CBF' }]}
                  onPress={() => setCategory(c.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.catIcon}>{c.icon}</Text>
                  <Text style={[s.catLabel, { color: category === c.key ? '#fff' : colors.textSecondary }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {filteredOffers.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🛒</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No offers in this category</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>More partner deals coming soon!</Text>
            </View>
          ) : filteredOffers.map(offer => (
            <OfferCard
              key={offer.id}
              offer={offer}
              balance={balance}
              alreadyRedeemed={redeemedIds.has(offer.id)}
              onRedeem={redeeming ? () => {} : handleRedeem}
            />
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          ref={couponsRef}
          style={{ flex: 1 }}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#7C5CBF" />}
          onScroll={e => setShowFab(e.nativeEvent.contentOffset.y > 200)}
          scrollEventThrottle={100}
        >
          {myCoupons.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎟️</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No coupons yet</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Earn coins and redeem your first offer!</Text>
              <TouchableOpacity onPress={() => setTab('offers')} style={[s.redeemBtn, { backgroundColor: '#7C5CBF', marginTop: 16 }]}>
                <Text style={[s.redeemText, { color: '#fff' }]}>Browse offers</Text>
              </TouchableOpacity>
            </View>
          ) : myCoupons.map(c => (
            <MyCouponCard key={c.id} coupon={c} onUse={handleUseCoupon} />
          ))}
        </ScrollView>
      )}

      {/* Scroll-to-top FAB */}
      {showFab && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + 16 }]}
          onPress={scrollToTop}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCenter:  { flex: 1, alignItems: 'center' },
  headerTitle:   { fontSize: TYPO.subheading, fontWeight: '800' },
  headerSub:     { fontSize: TYPO.label, marginTop: 1 },
  tabRow:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:        { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:      { fontSize: TYPO.body, fontWeight: '700' },
  catRow:        { height: 54, justifyContent: 'center', marginBottom: 4 },
  catScroll:     { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  catChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, height: 34 },
  catIcon:       { fontSize: TYPO.body },
  catLabel:      { fontSize: TYPO.caption, fontWeight: '600' },
  list:          { padding: 16, gap: 12 },
  fab:           { position: 'absolute', right: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: '#7C5CBF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  featuredBadge: { backgroundColor: '#7C5CBF22', borderRadius: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3 },
  featuredText:  { fontSize: TYPO.label, fontWeight: '800', color: '#7C5CBF', letterSpacing: 0.5 },
  cardHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  partnerLogo:   { fontSize: TYPO.hero },
  partnerName:   { fontSize: TYPO.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  offerTitle:    { fontSize: TYPO.subheading, fontWeight: '700', marginTop: 1, lineHeight: 22 },
  discountBadge: { backgroundColor: '#22C55E', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  discountText:  { color: '#fff', fontSize: TYPO.caption, fontWeight: '800' },
  desc:          { fontSize: TYPO.body, lineHeight: 20 },
  expiry:        { fontSize: TYPO.caption },
  cardFooter:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  needMore:      { flex: 1, fontSize: TYPO.caption },
  redeemBtn:     { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginLeft: 'auto' },
  redeemText:    { fontSize: TYPO.body, fontWeight: '700' },
  myCoupon:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  codeBox:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  codeText:      { fontSize: TYPO.body, fontWeight: '800', letterSpacing: 1 },
  empty:         { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: TYPO.heading, fontWeight: '700', marginBottom: 6 },
  emptyDesc:     { fontSize: TYPO.body, textAlign: 'center' },
});
