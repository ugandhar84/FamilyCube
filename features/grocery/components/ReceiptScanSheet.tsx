import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, Pressable, ActivityIndicator, Alert,
  ScrollView, SafeAreaView, Animated, Easing,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const BotIcon = ({ c }: { c: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
    <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    <Circle cx={9} cy={14} r={1.5} fill={c} />
    <Circle cx={15} cy={14} r={1.5} fill={c} />
    <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const ReceiptIcon = ({ c }: { c: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path d="M4,2 L20,2 L20,22 L17,20 L14,22 L11,20 L8,22 L5,20 L4,22 Z" stroke={c} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
    <Line x1={8} y1={8} x2={16} y2={8} stroke={c} strokeWidth={1.5} strokeLinecap="round" />
    <Line x1={8} y1={12} x2={16} y2={12} stroke={c} strokeWidth={1.5} strokeLinecap="round" />
    <Line x1={8} y1={16} x2={13} y2={16} stroke={c} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);
const CameraIcon = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M23,19 C23,20.1 22.1,21 21,21 L3,21 C1.9,21 1,20.1 1,19 L1,8 C1,6.9 1.9,6 3,6 L7,6 L9,3 L15,3 L17,6 L21,6 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={1.8} fill="none" />
    <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={1.8} fill="none" />
  </Svg>
);
const PhotoIcon = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Rect x={3} y={3} width={18} height={18} rx={2} stroke={c} strokeWidth={1.8} fill="none" />
    <Circle cx={8.5} cy={8.5} r={1.5} fill={c} />
    <Path d="M21,15 L16,10 L5,21" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const CheckIcon = ({ c }: { c: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24">
    <Path d="M20,6 L9,17 L4,12" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const SparkIcon = ({ c }: { c: string }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24">
    <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" fill={c} />
  </Svg>
);

// ── Category badge colors ─────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  produce: '#10B981', dairy: '#3B82F6', meat: '#EF4444', seafood: '#0EA5E9',
  bakery: '#F59E0B', frozen: '#6366F1', snacks: '#F97316', beverages: '#06B6D4',
  grains: '#84CC16', cleaning: '#8B5CF6', personal_care: '#EC4899', other: '#9CA3AF',
};

// ── Scanning dot animation ────────────────────────────────────────────────────
function PulseDot() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale,   { toValue: 2.8, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(300),
    ])).start();
  }, []);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', opacity, transform: [{ scale }] }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
    </View>
  );
}

// ── Scan-line animation (while AI is processing) ─────────────────────────────
function ScanningAnimation() {
  const translateY = useRef(new Animated.Value(0)).current;
  const barOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(barOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, { toValue: 120, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0,   duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, []);

  return (
    <View style={{ width: '100%', height: 140, backgroundColor: 'rgba(146,97,199,0.08)', borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(146,97,199,0.25)' }}>
      {/* Receipt lines background */}
      {[0.2, 0.36, 0.52, 0.66, 0.8].map((t, i) => (
        <View key={i} style={{ position: 'absolute', top: `${t * 100}%` as any, left: 24, right: 24, height: 1.5, backgroundColor: 'rgba(146,97,199,0.2)', borderRadius: 1 }} />
      ))}
      {/* Scan line */}
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, opacity: barOpacity, transform: [{ translateY }] }}>
        <View style={{ height: 2, backgroundColor: BRAND.purple, shadowColor: BRAND.purple, shadowRadius: 8, shadowOpacity: 0.8 }} />
        <View style={{ height: 20, backgroundColor: 'rgba(146,97,199,0.12)' }} />
      </Animated.View>
      {/* Center label */}
      <View style={{ alignItems: 'center', gap: 6 }}>
        <ActivityIndicator color={BRAND.purple2} size="small" />
        <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.purple2, letterSpacing: 0.5 }}>SCANNING RECEIPT…</Text>
      </View>
    </View>
  );
}

// ── Dot-bounce loading indicator ─────────────────────────────────────────────
function ThinkingDots() {
  const dots = [0, 1, 2].map(i => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 150),
        Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0,  duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ])).start();
    }, []);
    return anim;
  });
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {dots.map((anim, i) => (
        <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.purple2, transform: [{ translateY: anim }] }} />
      ))}
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

interface Member {
  id: string;
  name: string;
  emoji?: string;
  avatarUrl?: string;
}

export interface ReceiptScanSheetProps {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;
  memberName?: string;
  members?: Member[];
  colors: any;
  isDark: boolean;
  onSuccess?: (receipt: any) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ReceiptScanSheet({
  visible, onClose, familyId, memberId, memberName, members = [], colors, isDark, onSuccess,
}: ReceiptScanSheetProps) {
  const [step, setStep]         = useState<'menu' | 'scanning' | 'review'>('menu');
  const [scanning, setScanning] = useState(false);
  const [items, setItems]       = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [store, setStore]       = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [total, setTotal]       = useState(0);
  const [saving, setSaving]     = useState(false);
  const [fadeIn]                = useState(new Animated.Value(0));

  const fadeInResults = () => {
    fadeIn.setValue(0);
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  };

  const handleClose = () => {
    setStep('menu');
    setScanning(false);
    setItems([]);
    setSelected(new Set());
    setStore('');
    setReceiptDate('');
    setTotal(0);
    onClose();
  };

  const runScan = async (base64: string) => {
    setStep('scanning');
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: { familyId, scannedById: memberId, imageBase64: base64 },
      });
      if (error) throw new Error(error.message);

      if (data?.error === 'not_a_receipt') {
        Alert.alert('Not a Receipt', data.message ?? 'This image doesn\'t look like a receipt.');
        setStep('menu');
        return;
      }
      if (data?.error === 'not_grocery') {
        Alert.alert('Wrong Receipt Type', data.message ?? 'Only grocery and shopping receipts are supported.');
        setStep('menu');
        return;
      }

      const extracted: ExtractedItem[] = data.items ?? [];
      setItems(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
      setStore(data.store ?? '');
      setReceiptDate(data.date ?? '');
      setTotal(data.total ?? 0);
      setStep('review');
      fadeInResults();
    } catch (err: any) {
      Alert.alert('Scan failed', err?.message ?? 'Could not read this receipt.');
      setStep('menu');
    } finally {
      setScanning(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera in Settings to take receipt photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, base64: true });
    if (!result.canceled && result.assets[0]?.base64) {
      await runScan(result.assets[0].base64);
    }
  };

  const browsePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo library in Settings to pick receipts.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: true });
    if (!result.canceled && result.assets[0]?.base64) {
      await runScan(result.assets[0].base64);
    }
  };

  const addToList = async () => {
    setSaving(true);
    try {
      const toAdd = items.filter((_, i) => selected.has(i));
      for (const item of toAdd) {
        await supabase.from('grocery_items').insert({
          family_id: familyId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          estimated_price: item.totalPrice,
          store_preference: store,
        });
      }
      onSuccess?.({ store, items: toAdd, scannedBy: memberId });
      handleClose();
    } catch (err: any) {
      Alert.alert('Failed to add items', err?.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (i: number) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  // Auto-launch camera when sheet opens
  useEffect(() => {
    if (visible && step === 'menu') {
      takePhoto();
    }
  }, [visible]);

  const sheetBg = isDark ? '#0D1117' : '#FFFFFF';
  const border  = isDark ? '#1E2A42' : '#E5E7EB';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: sheetBg }}>
        {/* ── CubeAI header banner ── */}
        <View style={{ backgroundColor: '#0D1424', borderBottomWidth: 1, borderBottomColor: '#1E2A42', paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Bot avatar with pulse */}
            <View style={{ width: 36, height: 36 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(146,97,199,0.25)', borderWidth: 1, borderColor: 'rgba(185,142,219,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                <BotIcon c="#C4B5FD" />
              </View>
              <View style={{ position: 'absolute', top: -2, right: -2 }}>
                <PulseDot />
              </View>
            </View>
            {/* Title */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#C4B5FD' }}>CubeAI Receipt Scanner</Text>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(16,185,129,0.2)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#10B981', letterSpacing: 0.5 }}>GEMINI</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: 'rgba(196,181,253,0.65)', marginTop: 1 }}>
                {step === 'menu'     && 'Snap or upload a grocery receipt'}
                {step === 'scanning' && 'Reading your receipt with AI…'}
                {step === 'review'   && `Found ${items.length} items at ${store || 'the store'}`}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>

          {/* Scanned-by attribution */}
          {(step === 'review' || step === 'scanning') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1E2A42' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BRAND.purple + '40', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: BRAND.purple2 }}>{(memberName ?? 'M')[0].toUpperCase()}</Text>
              </View>
              <Text style={{ fontSize: 11, color: 'rgba(196,181,253,0.6)' }}>
                Scanned by <Text style={{ color: '#C4B5FD', fontWeight: '700' }}>{memberName ?? 'You'}</Text>
                {receiptDate ? <Text>  ·  {receiptDate}</Text> : null}
                {total > 0 ? <Text>  ·  <Text style={{ color: BRAND.amber, fontWeight: '700' }}>${total.toFixed(2)}</Text></Text> : null}
              </Text>
            </View>
          )}
        </View>

        {/* ── Content ── */}
        <View style={{ flex: 1 }}>
          {/* MENU — shown only if camera was dismissed */}
          {step === 'menu' && (
            <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(146,97,199,0.15)', borderWidth: 1.5, borderColor: 'rgba(185,142,219,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                <ReceiptIcon c={BRAND.purple2} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#C4B5FD' : BRAND.purple, textAlign: 'center' }}>
                Scan a Receipt
              </Text>
              <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 19 }}>
                Camera was closed. Retry or browse for a saved receipt photo.
              </Text>
              <Pressable onPress={takePhoto} style={{ width: '100%', paddingVertical: 15, borderRadius: 14, backgroundColor: BRAND.purple, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <CameraIcon c="#fff" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Open Camera</Text>
              </Pressable>
              <Pressable onPress={browsePhoto} style={{ width: '100%', paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: isDark ? '#334155' : '#E2E8F0', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: isDark ? '#111827' : '#F9FAFB' }}>
                <PhotoIcon c={colors.textSecondary} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Browse Photos</Text>
              </Pressable>
              <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>
                Grocery & retail receipts only · Google Gemini
              </Text>
            </View>
          )}

          {/* SCANNING */}
          {step === 'scanning' && (
            <View style={{ flex: 1, padding: 20, gap: 20, alignItems: 'center', justifyContent: 'center' }}>
              <ScanningAnimation />
              <View style={{ alignItems: 'center', gap: 10 }}>
                <ThinkingDots />
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#C4B5FD' : BRAND.purple }}>
                  Extracting items…
                </Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>
                  CubeAI is reading prices, quantities, and categories
                </Text>
              </View>
            </View>
          )}

          {/* REVIEW */}
          {step === 'review' && (
            <Animated.ScrollView
              style={{ opacity: fadeIn }}
              contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Store + total summary bar */}
              <View style={{ backgroundColor: isDark ? '#0D1424' : '#F5F3FF', borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#1E2A42' : '#DDD6FE', padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? 'rgba(196,181,253,0.5)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Store</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#C4B5FD' : BRAND.purple }}>{store || 'Unknown'}</Text>
                </View>
                {total > 0 && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? 'rgba(196,181,253,0.5)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: BRAND.amber }}>${total.toFixed(2)}</Text>
                  </View>
                )}
              </View>

              {/* Select-all row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {selected.size} of {items.length} items selected
                </Text>
                <Pressable onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)))}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple2 }}>
                    {selected.size === items.length ? 'Deselect all' : 'Select all'}
                  </Text>
                </Pressable>
              </View>

              {/* Item rows */}
              {items.map((item, idx) => {
                const checked = selected.has(idx);
                const catColor = CAT_COLOR[item.category] ?? '#9CA3AF';
                return (
                  <Pressable key={idx} onPress={() => toggleItem(idx)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, marginBottom: 4,
                    backgroundColor: checked ? (isDark ? 'rgba(146,97,199,0.12)' : '#F5F3FF') : (isDark ? '#111827' : '#F9FAFB'),
                    borderWidth: 1.5, borderColor: checked ? 'rgba(146,97,199,0.4)' : border }}>
                    {/* Checkbox */}
                    <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: checked ? BRAND.purple : (isDark ? '#334155' : '#D1D5DB'), backgroundColor: checked ? BRAND.purple : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {checked && <CheckIcon c="#fff" />}
                    </View>
                    {/* Category dot */}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor }} />
                    {/* Item info */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                        {item.quantity}{item.unit !== 'each' ? ` ${item.unit}` : ''} · <Text style={{ color: catColor, fontWeight: '600' }}>{item.category}</Text>
                      </Text>
                    </View>
                    {/* Price */}
                    {item.totalPrice > 0 && (
                      <Text style={{ fontSize: 14, fontWeight: '800', color: checked ? (isDark ? '#C4B5FD' : BRAND.purple) : colors.textSecondary }}>
                        ${item.totalPrice.toFixed(2)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </Animated.ScrollView>
          )}
        </View>

        {/* ── Footer ── */}
        {step === 'review' && (
          <View style={{ borderTopWidth: 1, borderTopColor: border, backgroundColor: sheetBg, padding: 16, gap: 10 }}>
            {/* Receipt icon */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ReceiptIcon c={colors.textTertiary} />
              <Text style={{ fontSize: 12, color: colors.textTertiary, flex: 1 }}>
                Scanned by <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{memberName ?? 'You'}</Text>{receiptDate ? `  ·  ${receiptDate}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={handleClose} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: isDark ? '#1E293B' : '#F3F4F6', alignItems: 'center', borderWidth: 1, borderColor: border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={addToList}
                disabled={selected.size === 0 || saving}
                style={{ flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: selected.size === 0 ? '#374151' : BRAND.purple, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <SparkIcon c="#fff" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
                        Add {selected.size} item{selected.size !== 1 ? 's' : ''} to List
                      </Text>
                    </>
                }
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
