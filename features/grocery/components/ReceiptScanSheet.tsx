/**
 * ReceiptScanSheet — bottom-sheet AI receipt scanner matching the Health tab's Rx scan pattern.
 * Dark handle → CubeAI header → animated scan box → Camera / Library / PDF source picker → review items.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity, ActivityIndicator, Alert,
  ScrollView, KeyboardAvoidingView, Platform, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path, Rect, Circle, Polyline } from 'react-native-svg';
import { BRAND } from '@/components/FamilyCubeLogo';
import { supabase } from '@/lib/supabase';

// ── SVG icons ─────────────────────────────────────────────────────────────────
const ScanLineIcon = ({ c, size = 24 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={2} width={14} height={18} rx={2} stroke={c} strokeWidth={1.5} fill="none" />
    <Path d="M7 7h6M7 10h6M7 13h4" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    <Path d="M19 9l2 2-2 2" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    <Path d="M1 12h20" stroke={c} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="3 2" fill="none" />
  </Svg>
);
const CameraIcon = ({ c }: { c: string }) => (
  <Svg width={32} height={32} viewBox="0 0 24 24">
    <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={1.5} fill="none" />
  </Svg>
);
const GalleryIcon = ({ c }: { c: string }) => (
  <Svg width={32} height={32} viewBox="0 0 24 24">
    <Rect x={3} y={3} width={18} height={18} rx={2} stroke={c} strokeWidth={1.5} fill="none" />
    <Circle cx={8.5} cy={8.5} r={1.5} fill={c} />
    <Path d="M21 15l-5-5L5 21" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const FileIcon = ({ c }: { c: string }) => (
  <Svg width={32} height={32} viewBox="0 0 24 24">
    <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    <Polyline points="14 2 14 8 20 8" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
  </Svg>
);
const CheckIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Path d="M20,6 L9,17 L4,12" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const BotIcon = ({ c }: { c: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
    <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    <Circle cx={9} cy={14} r={1.5} fill={c} />
    <Circle cx={15} cy={14} r={1.5} fill={c} />
    <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const BackIcon = ({ c }: { c: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path d="M19 12H5M12 19l-7-7 7-7" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const XIcon = ({ c }: { c: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path d="M18 6L6 18M6 6l12 12" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
  </Svg>
);

// ── Category colors ───────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  produce: '#10B981', dairy: '#3B82F6', meat: '#EF4444', seafood: '#0EA5E9',
  bakery: '#F59E0B', frozen: '#6366F1', snacks: '#F97316', beverages: '#06B6D4',
  grains: '#84CC16', cleaning: '#8B5CF6', personal_care: '#EC4899', other: '#9CA3AF',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExtractedItem {
  name: string; quantity: number; unit: string;
  unitPrice: number; totalPrice: number; category: string;
}

export interface ReceiptScanSheetProps {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;
  memberName?: string;
  colors: any;
  isDark: boolean;
  onSuccess?: (receipt: any) => void;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function ReceiptScanSheet({
  visible, onClose, familyId, memberId, memberName, colors, isDark, onSuccess,
}: ReceiptScanSheetProps) {
  const insets = useSafeAreaInsets();
  const [page, setPage]         = useState<1 | 2>(1);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [items, setItems]       = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [store, setStore]       = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [total, setTotal]       = useState(0);
  const [saving, setSaving]     = useState(false);

  // ── Scan beam animation ───────────────────────────────────────────────────
  const beamY     = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const dotOpacity = useRef([0,1,2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (!scanning) { beamY.setValue(0); pulseScale.setValue(1); return; }
    const beam = Animated.loop(
      Animated.sequence([
        Animated.timing(beamY, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(beamY, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1.00, duration: 600, useNativeDriver: true }),
      ])
    );
    const dots = Animated.loop(
      Animated.stagger(180, dotOpacity.map(op =>
        Animated.sequence([
          Animated.timing(op, { toValue: 1,   duration: 300, useNativeDriver: true }),
          Animated.timing(op, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      ))
    );
    beam.start(); pulse.start(); dots.start();
    return () => { beam.stop(); pulse.stop(); dots.stop(); };
  }, [scanning]);

  const reset = useCallback(() => {
    setPage(1); setScanning(false); setScanError(null);
    setItems([]); setSelected(new Set());
    setStore(''); setReceiptDate(''); setTotal(0);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // ── Core scan logic ───────────────────────────────────────────────────────
  const runScan = async (base64: string) => {
    setScanning(true); setScanError(null);
    try {
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: { familyId, scannedById: memberId, imageBase64: base64 },
      });
      if (error) throw new Error(error.message);
      if (data?.error === 'not_a_receipt') throw new Error(data.message ?? 'This image doesn\'t look like a receipt.');
      if (data?.error === 'not_grocery')   throw new Error(data.message ?? 'Only grocery/shopping receipts are supported.');
      const extracted: ExtractedItem[] = data.items ?? [];
      setItems(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
      setStore(data.store ?? '');
      setReceiptDate(data.date ?? '');
      setTotal(data.total ?? 0);
      setPage(2);
    } catch (err: any) {
      setScanError(err?.message ?? 'Could not read this receipt. Try again.');
    } finally {
      setScanning(false);
    }
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera access needed', 'Allow camera in Settings.'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, base64: true, allowsEditing: true });
    if (!res.canceled && res.assets[0]?.base64) await runScan(res.assets[0].base64);
  };

  const pickLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo access needed', 'Allow photo library in Settings.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: true });
    if (!res.canceled && res.assets[0]?.base64) await runScan(res.assets[0].base64);
  };

  const pickPDF = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: 'base64' });
    await runScan(b64);
  };

  const addToList = async () => {
    setSaving(true);
    try {
      const toAdd = items.filter((_, i) => selected.has(i));
      for (const item of toAdd) {
        await supabase.from('grocery_items').insert({
          family_id: familyId, name: item.name, category: item.category,
          quantity: item.quantity, estimated_price: item.totalPrice, store_preference: store,
        });
      }
      onSuccess?.({ store, items: toAdd, scannedBy: memberId, total });
      handleClose();
    } catch (err: any) {
      Alert.alert('Failed to add items', err?.message);
    } finally { setSaving(false); }
  };

  const toggleItem = (i: number) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const bg   = isDark ? '#13131F' : '#F8F8FC';
  const bdr  = isDark ? '#1E2A42' : '#E5E7EB';
  const txtP = isDark ? '#fff' : '#111';
  const txtS = isDark ? '#aaa' : '#666';
  const P    = BRAND.purple;

  // Animated sheet height: page1 = compact 54%, page2 = 62–78% based on item count
  const sheetHeight = useRef(new Animated.Value(0.54)).current;
  useEffect(() => {
    const targetRatio = page === 2
      ? Math.min(0.78, 0.42 + items.length * 0.032)
      : 0.54;
    Animated.spring(sheetHeight, { toValue: targetRatio, useNativeDriver: false, tension: 60, friction: 12 }).start();
  }, [page, items.length]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />

          <Animated.View style={{ backgroundColor: bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            height: sheetHeight.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            paddingBottom: insets.bottom || 16 }}>

            {/* ── Step progress ── */}
            <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
              {[1, 2].map(s => (
                <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: page >= s ? P : (isDark ? '#333' : '#E5E7EB') }} />
              ))}
            </View>

            {/* ── Handle ── */}
            <View style={{ alignItems: 'center', paddingTop: 6 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#444' : '#DDD' }} />
            </View>

            {/* ── Header ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {page === 2 && !scanning && !saving && (
                  <TouchableOpacity onPress={() => { setPage(1); setScanError(null); }} style={{ marginRight: 4, padding: 4 }}>
                    <BackIcon c={txtS} />
                  </TouchableOpacity>
                )}
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: P + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <BotIcon c={BRAND.purple2} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: txtP }}>
                    {page === 1 ? 'Scan Receipt' : `${items.length} Items Found`}
                  </Text>
                  <Text style={{ fontSize: 11, color: txtS, marginTop: 1 }}>
                    Step {page} of 2 · {page === 1 ? (scanning ? 'Reading with AI…' : 'Choose source') : `${store || 'Unknown store'}${total > 0 ? ` · $${total.toFixed(2)}` : ''}`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                <XIcon c={txtS} />
              </TouchableOpacity>
            </View>

            {/* ══ PAGE 1 — Source picker ══ */}
            {page === 1 && (
              <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>

                {/* Animated scan preview box */}
                <View style={{ height: 160, borderRadius: 20, overflow: 'hidden', backgroundColor: isDark ? '#0D1424' : '#F0F4FF', borderWidth: 1.5, borderColor: P + '40', alignItems: 'center', justifyContent: 'center' }}>
                  {scanning ? (
                    <>
                      {/* Corner brackets */}
                      {[
                        { top: 10, left: 10, rotate: '0deg' },
                        { top: 10, right: 10, rotate: '90deg' },
                        { bottom: 10, right: 10, rotate: '180deg' },
                        { bottom: 10, left: 10, rotate: '270deg' },
                      ].map((pos, i) => (
                        <View key={i} style={{ position: 'absolute', ...(pos as any), width: 24, height: 24 }}>
                          <Svg width={24} height={24} viewBox="0 0 24 24" style={{ transform: [{ rotate: pos.rotate }] }}>
                            <Path d="M2 8V2h6" stroke={P} strokeWidth={2.5} strokeLinecap="round" fill="none" />
                          </Svg>
                        </View>
                      ))}
                      {/* Scan beam */}
                      <Animated.View style={{ position: 'absolute', left: 12, right: 12, height: 2, borderRadius: 1, backgroundColor: P, opacity: 0.85,
                        transform: [{ translateY: beamY.interpolate({ inputRange: [0, 1], outputRange: [-65, 65] }) }] }} />
                      {/* Icon */}
                      <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: P + '25', alignItems: 'center', justifyContent: 'center' }}>
                          <ScanLineIcon c={P} size={26} />
                        </View>
                      </Animated.View>
                      {/* Dot loader */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                        {dotOpacity.map((op, i) => (
                          <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.purple2, opacity: op }} />
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: txtS, marginTop: 10 }}>CubeAI is reading your receipt…</Text>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <ScanLineIcon c={isDark ? '#444' : '#CCC'} size={44} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#555' : '#BBB' }}>Choose how to add your receipt</Text>
                    </View>
                  )}
                </View>

                {/* Error banner */}
                {scanError && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#EF444420', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#EF444440' }}>
                    <Text style={{ fontSize: 12, color: '#EF4444', flex: 1, fontWeight: '600', lineHeight: 18 }}>{scanError}</Text>
                  </View>
                )}

                {/* Source buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {[
                    { label: 'Camera', sub: 'Scan now', icon: <CameraIcon c={P} />, onPress: pickCamera },
                    { label: 'Photos', sub: 'From library', icon: <GalleryIcon c={P} />, onPress: pickLibrary },
                    { label: 'File', sub: 'Image file', icon: <FileIcon c={P} />, onPress: pickPDF },
                  ].map(btn => (
                    <TouchableOpacity key={btn.label} disabled={scanning} onPress={btn.onPress}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                        backgroundColor: isDark ? '#1E1E2E' : '#fff', borderWidth: 1.5, borderColor: bdr, gap: 8, opacity: scanning ? 0.45 : 1,
                        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                      {btn.icon}
                      <Text style={{ fontSize: 12, fontWeight: '800', color: txtP }}>{btn.label}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: txtS, marginTop: -4 }}>{btn.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Attribution hint */}
                <Text style={{ fontSize: 11, color: txtS, textAlign: 'center' }}>
                  Scanned by <Text style={{ fontWeight: '700', color: BRAND.purple2 }}>{memberName ?? 'You'}</Text> · Grocery receipts only · Google Gemini
                </Text>
              </View>
            )}

            {/* ══ PAGE 2 — Review items ══ */}
            {page === 2 && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>

                  {/* Store + total summary */}
                  <View style={{ backgroundColor: isDark ? '#0D1424' : '#F5F3FF', borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#1E2A42' : '#DDD6FE', padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? 'rgba(196,181,253,0.5)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Store</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#C4B5FD' : P }}>{store || 'Unknown'}</Text>
                    </View>
                    {total > 0 && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? 'rgba(196,181,253,0.5)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: BRAND.amber }}>${total.toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? 'rgba(196,181,253,0.5)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Scanned by</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#C4B5FD' : P }}>{memberName ?? 'You'}</Text>
                    </View>
                  </View>

                  {/* Select-all row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: txtS, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {selected.size} of {items.length} selected
                    </Text>
                    <TouchableOpacity onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)))}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple2 }}>
                        {selected.size === items.length ? 'Deselect all' : 'Select all'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Items */}
                  {items.map((item, idx) => {
                    const checked = selected.has(idx);
                    const catColor = CAT_COLOR[item.category] ?? '#9CA3AF';
                    return (
                      <TouchableOpacity key={idx} onPress={() => toggleItem(idx)} activeOpacity={0.75}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, marginBottom: 4,
                          backgroundColor: checked ? (isDark ? 'rgba(146,97,199,0.12)' : '#F5F3FF') : (isDark ? '#1E1E2E' : '#F9FAFB'),
                          borderWidth: 1.5, borderColor: checked ? P + '60' : bdr }}>
                        <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: checked ? P : (isDark ? '#334155' : '#D1D5DB'), backgroundColor: checked ? P : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {checked && <CheckIcon c="#fff" />}
                        </View>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: catColor }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: txtP }} numberOfLines={1}>{item.name}</Text>
                          <Text style={{ fontSize: 11, color: txtS, marginTop: 1 }}>
                            {item.quantity}{item.unit !== 'each' ? ` ${item.unit}` : ''} · <Text style={{ color: catColor, fontWeight: '600' }}>{item.category}</Text>
                          </Text>
                        </View>
                        {item.totalPrice > 0 && (
                          <Text style={{ fontSize: 14, fontWeight: '800', color: checked ? (isDark ? '#C4B5FD' : P) : txtS }}>
                            ${item.totalPrice.toFixed(2)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Footer */}
                <View style={{ borderTopWidth: 1, borderTopColor: bdr, padding: 16, gap: 10, backgroundColor: bg }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={handleClose}
                      style={{ flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: isDark ? '#1E293B' : '#F3F4F6', alignItems: 'center', borderWidth: 1, borderColor: bdr }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: txtS }}>Discard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={addToList} disabled={selected.size === 0 || saving}
                      style={{ flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: selected.size === 0 ? '#374151' : P, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      {saving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>
                            Add {selected.size} item{selected.size !== 1 ? 's' : ''} to List →
                          </Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
