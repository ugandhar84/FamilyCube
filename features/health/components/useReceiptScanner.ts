import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { showAlert } from '@/components/AppAlert';
import { saveExpense, isDuplicateExpense, type ExpenseCategory } from '@/lib/db/expenses';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/compressImage';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import type { ScannedItem } from './expensesUtils';

interface Options {
  selectedPetId: string | null;
  activePetId: string | null | undefined;
  pets: Array<{ id: string; [key: string]: any }>;
  onSaved: () => void;
}

export function useReceiptScanner({ selectedPetId, activePetId, pets, onSaved }: Options) {
  const { tier } = useSubscriptionStore();
  const [scanLoading,  setScanLoading]  = useState(false);
  const [showReview,   setShowReview]   = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [scanMerchant, setScanMerchant] = useState<string | null>(null);
  const [scanDate,     setScanDate]     = useState<string | null>(null);
  const [savingAll,    setSavingAll]    = useState(false);
  const [showPaywall,  setShowPaywall]  = useState(false);

  const scanReceipt = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { showAlert('Permission needed', 'Camera access is required to scan receipts.'); return; }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { showAlert('Permission needed', 'Photo library access is required to scan receipts.'); return; }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ base64: false, quality: 1, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        : await ImagePicker.launchImageLibraryAsync({ base64: false, quality: 1, mediaTypes: ImagePicker.MediaTypeOptions.Images });

      if (result.canceled || !result.assets?.[0]) return;

      const { base64 } = await compressImage(result.assets[0].uri);
      const mimeType = 'image/jpeg';
      setScanLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-receipt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        },
      );

      const data = await res.json();

      if (res.status === 402) { setShowPaywall(true); return; }
      if (!res.ok) throw new Error(data.error ?? 'Receipt scan failed');
      if (!data.items?.length) {
        showAlert('No items found', 'No pet-related expenses were detected in this receipt. Try a clearer photo.');
        return;
      }

      const defaultPetId = selectedPetId ?? activePetId ?? pets[0]?.id ?? '';
      const today = format(new Date(), 'yyyy-MM-dd');

      setScannedItems(data.items.map((it: any, i: number) => ({
        id: `scan-${i}-${Date.now()}`,
        description: it.description,
        amount: String(it.amount),
        category: it.category as ExpenseCategory,
        petId: defaultPetId,
        keep: true,
        confidence: it.confidence ?? 'high',
      })));
      setScanMerchant(data.merchant ?? null);
      setScanDate(data.receipt_date ?? today);
      setShowReview(true);
    } catch (e: any) {
      showAlert('Scan failed', e.message ?? 'Could not scan receipt. Please try again.');
    } finally {
      setScanLoading(false);
    }
  };

  const openScanPicker = () => {
    if (tier !== 'ultimate') { setShowPaywall(true); return; }
    showAlert('Scan Receipt', 'Choose source', [
      { text: 'Camera', onPress: () => scanReceipt('camera') },
      { text: 'Photo Library', onPress: () => scanReceipt('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveAllScanned = async () => {
    const toSave = scannedItems.filter(it => it.keep);
    if (!toSave.length) { setShowReview(false); return; }
    setSavingAll(true);
    try {
      const date = scanDate ?? format(new Date(), 'yyyy-MM-dd');
      const dupChecks = await Promise.all(toSave.map(it => {
        const title = it.description || it.category;
        const amount = parseFloat(it.amount) || 0;
        return isDuplicateExpense(it.petId, title, it.category, amount, date);
      }));
      const newItems = toSave.filter((_, i) => !dupChecks[i]);
      const skipped = toSave.length - newItems.length;
      if (newItems.length > 0) {
        await Promise.all(newItems.map(it =>
          saveExpense(it.petId, {
            title: it.description || it.category,
            category: it.category,
            amount: parseFloat(it.amount) || 0,
            expense_date: date,
            notes: null,
          }),
        ));
      }
      setShowReview(false);
      setScannedItems([]);
      onSaved();
      const saved = newItems.length;
      const msg = skipped > 0
        ? `${saved} expense${saved !== 1 ? 's' : ''} added. ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped.`
        : `${saved} expense${saved !== 1 ? 's' : ''} added from receipt.`;
      showAlert('Saved!', msg);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not save expenses.');
    } finally {
      setSavingAll(false);
    }
  };

  return {
    scanLoading, showReview, setShowReview,
    scannedItems, setScannedItems,
    scanMerchant, scanDate,
    savingAll, showPaywall, setShowPaywall,
    openScanPicker, saveAllScanned,
  };
}
