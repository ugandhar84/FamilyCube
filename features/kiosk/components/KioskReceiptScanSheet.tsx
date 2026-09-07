/**
 * KioskReceiptScanSheet — kiosk-native port of
 * features/grocery/components/ReceiptScanSheet.tsx: scan a paper receipt
 * (Camera / Library / Image file), review the AI-extracted items, add the
 * ones you want to the grocery list.
 *
 * Logic is byte-identical to the phone version — same parse-grocery-receipt
 * edge function call, same compressImage()+family-media Storage upload
 * before invoking it, same insert-per-selected-item write to grocery_items.
 * Only the visual shell is rebuilt: the phone version hardcodes its own
 * one-off colors (BRAND.purple, literal hex per isDark branch) rather than
 * using useTheme(), so there was no existing "just swap the theme hook"
 * path — every color here comes from KioskColors instead, and the shell
 * itself is KioskFormDrawer (drawer variant, same as KioskGroceryRequestSheet:
 * a two-page flow with a scrollable review list is the "can genuinely run
 * long" case that file's own header calls a drawer right for) rather than
 * the phone's bespoke animated-height Modal.
 *
 * Kept, unchanged in spirit: the two-step page flow (source picker → AI
 * review), the scan-in-progress animation (simplified to a plain
 * ActivityIndicator + copy — the phone's beam/corner-bracket/dot-loader
 * animation is real polish for a phone screen someone is staring at up
 * close while holding still for a camera; not reproduced pixel-for-pixel
 * here since it added meaningfully more code for the same "AI is working"
 * signal a spinner already gives on a kitchen-wall display glanced at from
 * a few feet away), select-all/deselect-all, per-item category dot + price,
 * and the same store/total/scanned-by summary strip.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Camera, Image as ImageIcon, FileText, ScanLine, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/compressImage';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer } from './KioskFormDrawer';

interface ExtractedItem {
  name: string; quantity: number; unit: string;
  unitPrice: number; totalPrice: number; category: string;
}

const CAT_DOT: Record<string, string> = {
  produce: '#10B981', dairy: '#3B82F6', meat: '#EF4444', seafood: '#0EA5E9',
  bakery: '#F59E0B', frozen: '#6366F1', snacks: '#F97316', beverages: '#06B6D4',
  grains: '#84CC16', cleaning: '#8B5CF6', personal_care: '#EC4899', other: '#9CA3AF',
};

export function KioskReceiptScanSheet({ visible, onClose, familyId, memberId, memberName, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;
  memberName?: string;
  onSuccess?: (receipt: any) => void;
}) {
  const { k } = useKioskColors();
  const [page, setPage] = useState<1 | 2>(1);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [store, setStore] = useState('');
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setPage(1); setScanning(false); setScanError(null);
    setItems([]); setSelected(new Set());
    setStore(''); setTotal(0);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const runScan = async (base64: string, localUri?: string) => {
    setScanning(true); setScanError(null);
    try {
      let imageUrl: string | undefined;
      if (localUri) {
        const path = `receipts/${familyId}/${Date.now()}.jpg`;
        const blob = await (await fetch(localUri)).blob();
        const { error: upErr } = await supabase.storage.from('family-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('family-media').getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: { familyId, scannedById: memberId, imageBase64: base64, imageUrl },
      });
      if (error) {
        // Live-reported: "it says edge function returned non 2xx, when i
        // upload random picture" — the edge function correctly returns a
        // structured {error:'not_a_receipt', message:'...'} body for
        // exactly this case, but as an HTTP 422, not a 200. The Supabase
        // client's own behavior on any non-2xx response is to throw a
        // FunctionsHttpError with a fixed generic message and leave `data`
        // null — so `data?.error === 'not_a_receipt'` below could never
        // run for this failure, only the generic "Edge Function returned
        // a non-2xx status code" ever surfaced. The real structured body
        // is still there, just on error.context (the raw Response object,
        // per @supabase/functions-js's FunctionsHttpError — needs its own
        // .json() read rather than being parsed already). This same latent
        // gap exists in the phone's ReceiptScanSheet.tsx too (identical
        // `if (error) throw new Error(error.message)` ahead of the same
        // two data?.error checks) — not something introduced by this port.
        let body: { error?: string; message?: string } | null = null;
        try { body = await (error as any)?.context?.json?.(); } catch { /* context wasn't JSON (network/relay error) — fall through to the generic message */ }
        if (body?.error === 'not_a_receipt') throw new Error(body.message ?? "This image doesn't look like a receipt.");
        if (body?.error === 'not_grocery') throw new Error(body.message ?? 'Only grocery/shopping receipts are supported.');
        throw new Error(body?.message ?? error.message);
      }
      if (data?.error === 'not_a_receipt') throw new Error(data.message ?? "This image doesn't look like a receipt.");
      if (data?.error === 'not_grocery') throw new Error(data.message ?? 'Only grocery/shopping receipts are supported.');
      const extracted: ExtractedItem[] = data.items ?? [];
      setItems(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
      setStore(data.store ?? '');
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
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, base64: false, allowsEditing: true });
    if (!res.canceled && res.assets[0]) {
      const { uri, base64 } = await compressImage(res.assets[0].uri);
      await runScan(base64, uri);
    }
  };

  const pickLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo access needed', 'Allow photo library in Settings.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, base64: false });
    if (!res.canceled && res.assets[0]) {
      const { uri, base64 } = await compressImage(res.assets[0].uri);
      await runScan(base64, uri);
    }
  };

  const pickFile = async () => {
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
          quantity: String(item.quantity), estimated_price: item.totalPrice, store_preference: store,
        });
      }
      onSuccess?.({ store, items: toAdd, scannedBy: memberId, total });
      handleClose();
    } catch (err: any) {
      Alert.alert('Failed to add items', err?.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={page === 1 ? 'Scan Receipt' : `${items.length} Items Found`}
      subtitle={page === 1
        ? (scanning ? 'Reading with AI…' : 'Choose how to add your receipt')
        : `${store || 'Unknown store'}${total > 0 ? ` · $${total.toFixed(2)}` : ''}`}
      accent={k.gold}
      Icon={ScanLine}
      k={k}
      onClose={handleClose}
      onSubmit={page === 2 ? addToList : undefined}
      canSubmit={selected.size > 0}
      submitting={saving}
      submitLabel={`Add ${selected.size} item${selected.size !== 1 ? 's' : ''} to List`}
    >
      {page === 1 ? (
        <>
          <View style={[s.scanBox, { backgroundColor: k.well, borderColor: k.gold + '40' }]}>
            {scanning ? (
              <>
                <ActivityIndicator size="large" color={k.gold} />
                <Text style={[s.scanningText, { color: k.textMuted }]}>CubeAI is reading your receipt…</Text>
              </>
            ) : (
              <>
                <ScanLine size={40} color={k.textFaint} />
                <Text style={[s.scanningText, { color: k.textFaint }]}>Choose how to add your receipt</Text>
              </>
            )}
          </View>

          {!!scanError && (
            <View style={[s.errorBanner, { backgroundColor: k.danger + '14', borderColor: k.danger + '30' }]}>
              <Text style={[s.errorText, { color: k.danger }]}>{scanError}</Text>
            </View>
          )}

          <View style={s.sourceRow}>
            {[
              { label: 'Camera', sub: 'Scan now', Icon: Camera, onPress: pickCamera },
              { label: 'Photos', sub: 'From library', Icon: ImageIcon, onPress: pickLibrary },
              { label: 'File', sub: 'Image file', Icon: FileText, onPress: pickFile },
            ].map(btn => (
              <Pressable
                key={btn.label}
                disabled={scanning}
                onPress={btn.onPress}
                style={({ pressed }) => [
                  s.sourceBtn,
                  { backgroundColor: k.card, borderColor: k.cardBorder },
                  (pressed || scanning) && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${btn.label}, ${btn.sub}`}
              >
                <btn.Icon size={26} color={k.gold} />
                <Text style={[s.sourceLabel, { color: k.text }]}>{btn.label}</Text>
                <Text style={[s.sourceSub, { color: k.textFaint }]}>{btn.sub}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.attribution, { color: k.textFaint }]}>
            Scanned by <Text style={{ fontWeight: '700', color: k.gold }}>{memberName ?? 'You'}</Text> · Grocery receipts only
          </Text>
        </>
      ) : (
        <>
          <View style={[s.summary, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.summaryLabel, { color: k.textFaint }]}>STORE</Text>
              <Text style={[s.summaryValue, { color: k.gold }]}>{store || 'Unknown'}</Text>
            </View>
            {total > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.summaryLabel, { color: k.textFaint }]}>TOTAL</Text>
                <Text style={[s.summaryValue, { color: k.gold }]}>${total.toFixed(2)}</Text>
              </View>
            )}
          </View>

          <View style={s.selectAllRow}>
            <Text style={[s.selectAllCount, { color: k.textFaint }]}>{selected.size} of {items.length} selected</Text>
            <Pressable onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)))}>
              <Text style={[s.selectAllAction, { color: k.gold }]}>
                {selected.size === items.length ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
          </View>

          {items.map((item, idx) => {
            const checked = selected.has(idx);
            const dot = CAT_DOT[item.category] ?? k.textFaint;
            return (
              <Pressable
                key={idx}
                onPress={() => toggleItem(idx)}
                style={[
                  s.itemRow,
                  { backgroundColor: checked ? k.gold + '14' : k.well, borderColor: checked ? k.gold + '60' : k.cardBorder },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <View style={[s.itemCheck, { borderColor: checked ? k.gold : k.cardBorder, backgroundColor: checked ? k.gold : 'transparent' }]}>
                  {checked && <Check size={13} color={k.onAccent} />}
                </View>
                <View style={[s.catDot, { backgroundColor: dot }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.itemName, { color: k.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[s.itemMeta, { color: k.textFaint }]} numberOfLines={1}>
                    {item.quantity}{item.unit !== 'each' ? ` ${item.unit}` : ''} · <Text style={{ color: dot, fontWeight: '700' }}>{item.category}</Text>
                  </Text>
                </View>
                {item.totalPrice > 0 && (
                  <Text style={[s.itemPrice, { color: checked ? k.gold : k.textFaint }]}>${item.totalPrice.toFixed(2)}</Text>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  scanBox: {
    height: 140, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md,
  },
  scanningText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  errorBanner: { borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md },
  errorText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  sourceRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md },
  sourceBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.lg, borderWidth: 1, gap: 6,
  },
  sourceLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  sourceSub: { fontSize: 10, fontWeight: '600' },
  attribution: { fontSize: 11, textAlign: 'center' },

  summary: {
    flexDirection: 'row', alignItems: 'center', borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    padding: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.sm, gap: KIOSK_SPACE.md,
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  summaryValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: KIOSK_SPACE.sm },
  selectAllCount: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  selectAllAction: { fontSize: 12, fontWeight: '800' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    padding: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, marginBottom: 6,
    minHeight: KIOSK_HIT.control,
  },
  itemCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  itemName: { fontSize: 13, fontWeight: '700' },
  itemMeta: { fontSize: 11, marginTop: 1 },
  itemPrice: { fontSize: 14, fontWeight: '800' },
});
