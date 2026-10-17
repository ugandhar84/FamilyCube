/**
 * ReceiptScanSheet — full-page AI receipt scanner, Figma field-card rhythm.
 * Was a dark Modal-based bottom sheet with hardcoded hex colors and a
 * 2-step wizard inside the sheet [live-requested: "the scan receipt should
 * be individual page overlay like other pages? with figma rhythm" /
 * flatten decision: one scrolling page instead of a stepped wizard].
 * Rendered inside a FullPageOverlay by its caller (GroceryScreen.tsx),
 * same as AddItemSheet/CreateRunSheet — this component itself is just the
 * page body, not its own Modal.
 */
import { ScanLine } from 'lucide-react-native';
import { useOverlayClose } from '@/components/OverlayPage';
import { PageHeading } from '@/components/PageHeading';
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// SDK 54's default expo-file-system export dropped readAsStringAsync as a
// hard runtime error, not just a deprecation warning — /legacy is the
// documented migration path.
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, uploadReceiptScanPhoto } from '@/lib/supabase';
import { compressImage } from '@/lib/compressImage';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';
import AiConsentSheet, { useAiConsent } from '@/components/AiConsentGate';
import { GEMINI } from '@/constants/geminiRhythm';
import { useFamilyStore } from '@/store/familyStore';

// "Gemini rhythm" + content-group card shape, copied from
// BringInPrescriptionScreen.tsx (the Health tab's scan-prescription
// screen) [live-requested: "like we should do like med scan like
// that"] — same `‹ Back` nav line, eyebrow row, big title, type badge,
// one white rounded content-group card with icon rows + solid CTA, and
// a bottom privacy/disclaimer card, instead of this screen's earlier
// animated-scan-box layout.
function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 14 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 14 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

// Category dot colors — a small fixed swatch keyed by AI-returned category
// string, same kind of data-driven color array as a tag/category picker
// (CLAUDE.md rule 1's exception: "color pickers and color-swatch arrays
// where the user is explicitly choosing/seeing a brand category color"),
// not a decorative hardcode.
const CAT_COLOR: Record<string, string> = {
  produce: '#10B981', dairy: '#3B82F6', meat: '#EF4444', seafood: '#0EA5E9',
  bakery: '#F59E0B', frozen: '#6366F1', snacks: '#F97316', beverages: '#06B6D4',
  grains: '#84CC16', cleaning: '#8B5CF6', personal_care: '#EC4899', other: '#9CA3AF',
};

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
  requestAnimatedClose?: () => void;
}

export function ReceiptScanSheet({
  visible, onClose, familyId, memberId, memberName, colors, isDark, onSuccess, requestAnimatedClose,
}: ReceiptScanSheetProps) {
  const insets = useSafeAreaInsets();
  const familySurname = useFamilyStore(s => s.familyName);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [items, setItems]       = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [store, setStore]       = useState('');
  const [total, setTotal]       = useState(0);
  // Which of the two scan flows this is — sent explicitly to the edge
  // function instead of making the AI re-guess every call [live-requested:
  // "we should not treat this as receipt right if it's groceries .. just
  // to clarify" / "we send that receipt / list tag in the request as
  // these are 2 separate call pages"].
  const [scanSource, setScanSource] = useState<'receipt' | 'photo'>('receipt');
  const { submitting: saving, guard } = useSubmitGuard();
  const { checked: consentChecked, consented, showSheet: showConsent, setShowSheet: setShowConsent, markConsented } = useAiConsent(memberId);
  const pendingScanAction = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    setScanning(false); setScanError(null);
    setItems([]); setSelected(new Set());
    setStore(''); setTotal(0); setScanSource('receipt');
  }, []);

  const overlayClose = useOverlayClose();
  const handleClose = () => { reset(); (requestAnimatedClose ?? overlayClose ?? onClose)(); };

  const runScan = async (base64: string, localUri?: string) => {
    setScanning(true); setScanError(null);
    try {
      let imageUrl: string | undefined;
      if (localUri) {
        try {
          imageUrl = await uploadReceiptScanPhoto(familyId, base64);
        } catch (e) {
          console.warn('[ReceiptScanSheet] receipt photo upload failed', e);
        }
      }
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: { familyId, scannedById: memberId, imageBase64: base64, imageUrl, source: scanSource },
      });
      if (error) {
        // supabase-js's FunctionsHttpError only carries a generic "non-2xx
        // status code" message — the edge function's own readable JSON body
        // ({error, message}) lands on error.context (a Response), which was
        // never read here, so every failure (bad image, missing API key,
        // Gemini outage, etc.) surfaced the same useless string to the user
        // [live-reported: "this edge is giving non 2xx, handle all error
        // scenarios and retrun user readable errors"].
        let readableMessage = error.message;
        try {
          const body = await error.context?.json?.();
          if (body?.message || body?.error) readableMessage = body.message ?? body.error;
        } catch { /* context wasn't JSON / already consumed — fall back */ }
        throw new Error(readableMessage || 'Could not read this receipt. Try again.');
      }
      if (data?.error === 'not_a_receipt') throw new Error(data.message ?? 'This doesn\'t look like a receipt or a photo of groceries.');
      if (data?.error === 'not_grocery')   throw new Error(data.message ?? 'Only grocery/shopping receipts are supported.');
      if (data?.error) throw new Error(data.message ?? data.error);
      const extracted: ExtractedItem[] = data.items ?? [];
      setItems(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
      setStore(data.store ?? '');
      setTotal(data.total ?? 0);
    } catch (err: any) {
      setScanError(err?.message ?? 'Could not read this receipt. Try again.');
    } finally {
      setScanning(false);
    }
  };

  const withAiConsent = (action: () => void) => {
    if (!consentChecked || consented) { action(); return; }
    pendingScanAction.current = action;
    setShowConsent(true);
  };

  const pickCamera = () => withAiConsent(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera access needed', 'Allow camera in Settings.'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, base64: false, allowsEditing: true });
    if (!res.canceled && res.assets[0]) {
      const { uri, base64 } = await compressImage(res.assets[0].uri);
      await runScan(base64, uri);
    }
  });

  const pickLibrary = () => withAiConsent(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo access needed', 'Allow photo library in Settings.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, base64: false });
    if (!res.canceled && res.assets[0]) {
      const { uri, base64 } = await compressImage(res.assets[0].uri);
      await runScan(base64, uri);
    }
  });

  const pickPDF = () => withAiConsent(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: 'base64' });
    await runScan(b64);
  });

  const addToList = guard(async () => {
    try {
      const toAdd = items.filter((_, i) => selected.has(i));
      for (const item of toAdd) {
        await supabase.from('grocery_items').insert({
          family_id: familyId, name: item.name, category: item.category,
          quantity: item.quantity, unit: item.unit, estimated_price: item.totalPrice, store_preference: store,
        });
      }
      onSuccess?.({ store, items: toAdd, scannedBy: memberId, total });
      handleClose();
    } catch (err: any) {
      Alert.alert('Failed to add items', err?.message);
    }
  });

  const toggleItem = (i: number) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const P = colors.primary;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const pageBg = isDark ? colors.background : GEMINI.canvas;
  const accent = colors.amber;
  const accentL = colors.amberLight;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <AiConsentSheet
        visible={showConsent}
        memberId={memberId}
        familyId={familyId}
        colors={colors}
        isDark={isDark}
        onAgree={() => {
          setShowConsent(false);
          markConsented();
          pendingScanAction.current?.();
          pendingScanAction.current = null;
        }}
        onDecline={() => { setShowConsent(false); pendingScanAction.current = null; }}
      />
      {/* Header — matches the other Grocery sub-pages' rhythm (Shopping
          Trips / Purchase History in GroceryScreen.tsx): eyebrow row
          (family name + member name), then a big tappable title that IS
          the close action, no separate back-link line
          [live-requested: "make this scan page header rythm to match
          other sub pages" — was previously borrowed from
          BringInPrescriptionScreen.tsx's med-scan layout instead]. */}
      <PageHeading eyebrow="FAMILY CUBE · GROCERIES" title="Scan Groceries" subtitle="Scan a receipt or a flyer to fill your list." accent="teal" Icon={ScanLine} onTitlePress={handleClose} topInset={insets.top} />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24, gap: 14 }}>

        {/* Type badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: accent + '18', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>Grocery · receipt or photo</Text>
          </View>
        </View>

        <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19 }}>
          Choose a source. CubeAI reads a receipt or a photo of your groceries and lists out each item so you can add them straight to your Shopping List.
        </Text>

        {/* Receipt vs plain-photo toggle — sent to the AI explicitly so it
            isn't re-guessing which kind of image this is every call
            [live-requested: "we should not treat this as receipt right if
            it's groceries .. just to clarify" / "we send that receipt /
            list tag in the request as these are 2 separate call pages"]. */}
        <View style={{ flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          {(['receipt', 'photo'] as const).map(s => (
            <TouchableOpacity key={s} onPress={() => setScanSource(s)} disabled={scanning}
              style={{ flex: 1, paddingVertical: 10, alignItems: 'center',
                backgroundColor: scanSource === s ? accent : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: scanSource === s ? '#FFFFFF' : bodyC }}>
                {s === 'receipt' ? 'Printed receipt' : 'Photo of groceries'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {scanning && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: accentL, borderRadius: 14, padding: 12 }}>
            <ActivityIndicator size="small" color={accent} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: titleC, flex: 1 }}>CubeAI is reading your photo…</Text>
          </View>
        )}

        {scanError && (
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.danger + '15', borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger, flex: 1, lineHeight: 18 }}>{scanError}</Text>
          </View>
        )}

        {/* Source picker card */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Choose how to bring it in</Text>

          {/* Camera */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera-outline" size={19} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Take a photo</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>
                {scanSource === 'receipt' ? 'Keep the receipt flat and in frame.' : 'Lay your groceries out in frame.'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={pickCamera} disabled={scanning}
            style={{ backgroundColor: GEMINI.blue, borderRadius: 14, paddingVertical: 13, alignItems: 'center', opacity: scanning ? 0.6 : 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Scan</Text>
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: border, marginVertical: 2 }} />

          {/* Photo library + file */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cloud-upload-outline" size={19} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Choose an existing file</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>Photo or image file — one receipt or grocery photo at a time.</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={pickLibrary} disabled={scanning}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                borderWidth: 1, borderColor: border, backgroundColor: cardBg, opacity: scanning ? 0.6 : 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? accent : GEMINI.linkBlue }}>Upload photo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickPDF} disabled={scanning}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                borderWidth: 1, borderColor: border, backgroundColor: cardBg, opacity: scanning ? 0.6 : 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? accent : GEMINI.linkBlue }}>Upload file</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Review items — only once a scan has produced results */}
        {items.length > 0 && (
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Review items</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: accentL, borderRadius: 14, padding: 14, gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: bodyC, textTransform: 'uppercase', letterSpacing: 0.5 }}>Store (applied to the whole list)</Text>
                {/* Confirm/correct the store once for the whole scanned batch
                    instead of it only ever being whatever AI/OCR guessed
                    [live-requested: "ask the whole list once done with the
                    inline store prefernce"] — every item below shares this
                    one value as its store_preference on add. */}
                <TextInput
                  value={store} onChangeText={setStore}
                  placeholder="e.g. Walmart" placeholderTextColor={bodyC}
                  style={{ fontSize: 15, fontWeight: '800', color: accent, padding: 0 }}
                />
              </View>
              {total > 0 && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: bodyC, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: accent }}>${total.toFixed(2)}</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: bodyC, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {selected.size} of {items.length} selected
              </Text>
              <TouchableOpacity onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)))}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: GEMINI.linkBlue }}>
                  {selected.size === items.length ? 'Deselect all' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>

            {items.map((item, idx) => {
              const checked = selected.has(idx);
              const catColor = CAT_COLOR[item.category] ?? bodyC;
              return (
                <TouchableOpacity key={idx} onPress={() => toggleItem(idx)} activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
                    backgroundColor: checked ? accentL : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1.5, borderColor: checked ? accent : border }}>
                  <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2,
                    borderColor: checked ? accent : border, backgroundColor: checked ? accent : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: catColor }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }} numberOfLines={1}>{item.name}</Text>
                    <Text style={{ fontSize: 11, color: bodyC, marginTop: 1 }}>
                      {item.quantity}{item.unit !== 'each' ? ` ${item.unit}` : ''} · <Text style={{ color: catColor, fontWeight: '600' }}>{item.category}</Text>
                    </Text>
                  </View>
                  {item.totalPrice > 0 && (
                    <Text style={{ fontSize: 14, fontWeight: '800', color: checked ? accent : bodyC }}>
                      ${item.totalPrice.toFixed(2)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={handleClose}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: isDark ? colors.surface : '#F8FAFC',
                  alignItems: 'center', borderWidth: 1, borderColor: border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: bodyC }}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addToList} disabled={selected.size === 0 || saving}
                style={{ flex: 2, paddingVertical: 13, borderRadius: 14,
                  backgroundColor: selected.size === 0 ? border : GEMINI.blue,
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>
                      Add {selected.size} item{selected.size !== 1 ? 's' : ''} to List →
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Privacy card — same Shield-card pattern as BringInPrescriptionScreen.tsx */}
        <View style={{ flexDirection: 'row', gap: 12, borderRadius: 18, padding: 14,
          backgroundColor: isDark ? accentL + '22' : accentL, borderWidth: 1, borderColor: accent + '30' }}>
          <Ionicons name="shield-checkmark-outline" size={18} color={accent} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>Your photo stays private</Text>
            <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
              AI reads the receipt or photo to extract items, quantities and prices (when visible). The original image is never stored by AI — only the items you approve are added to your Shopping List.
            </Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
