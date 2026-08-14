import React, { useState } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, ActivityIndicator, Alert,
  ScrollView, Image, SafeAreaView, Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

interface ReceiptScanSheetProps {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;
  colors: any;
  isDark: boolean;
  onSuccess?: (receipt: any) => void;
}

interface ExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

export function ReceiptScanSheet({
  visible, onClose, familyId, memberId, colors, isDark, onSuccess,
}: ReceiptScanSheetProps) {
  const [step, setStep] = useState<'menu' | 'camera' | 'review'>('menu');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [store, setStore] = useState('');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed', 'Allow camera access in your device settings to take receipt photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setReceiptUri(asset.uri);
      setImageBase64(asset.base64 || '');
      await parseReceipt(asset.base64 || '');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library permission needed', 'Allow photo access in your device settings to browse receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setReceiptUri(asset.uri);
      setImageBase64(asset.base64 || '');
      await parseReceipt(asset.base64 || '');
    }
  };

  const parseReceipt = async (base64: string) => {
    if (!base64) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: {
          familyId,
          scannedById: memberId,
          imageBase64: base64,
          store: store || undefined,
        },
      });

      if (error) throw new Error(error.message);

      setExtractedItems(data.items || []);
      setStore(data.store || store);
      setSelectedIndices(new Set(data.items.map((_: ExtractedItem, i: number) => i)));
      setStep('review');
    } catch (err: any) {
      Alert.alert('Failed to parse receipt', err?.message || 'Could not extract items from receipt.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItems = async () => {
    setLoading(true);
    try {
      const itemsToAdd = extractedItems.filter((_, i) => selectedIndices.has(i));

      // Add each item to the grocery list
      for (const item of itemsToAdd) {
        await supabase
          .from('grocery_items')
          .insert({
            family_id: familyId,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            estimated_price: item.totalPrice,
            store_preference: store,
          });
      }

      Alert.alert('Success', `Added ${itemsToAdd.length} item(s) to your list`);
      onSuccess?.({ store, items: itemsToAdd });
      handleClose();
    } catch (err: any) {
      Alert.alert('Failed to add items', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('menu');
    setReceiptUri(null);
    setImageBase64(null);
    setExtractedItems([]);
    setSelectedIndices(new Set());
    setStore('');
    onClose();
  };

  const sheetBg = isDark ? '#1A1A2E' : '#FFFFFF';
  const border = isDark ? '#2D2D4E' : '#E5E7EB';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: sheetBg }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: border,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
            {step === 'menu' && 'Scan Receipt'}
            {step === 'camera' && 'Take Photo'}
            {step === 'review' && 'Review Items'}
          </Text>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {step === 'menu' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: isDark ? '#2D2D4E' : '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="receipt" size={40} color={colors.accent} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
                Add Items from Receipt
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
                Snap a photo of your receipt and we'll automatically extract the items.
              </Text>

              <Pressable
                onPress={takePhoto}
                style={{
                  width: '100%',
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                  alignItems: 'center',
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>📸 Take Photo</Text>
              </Pressable>

              <Pressable
                onPress={pickImage}
                style={{
                  width: '100%',
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#2D2D4E' : '#F3F4F6',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: isDark ? '#4D4D7E' : '#E5E7EB',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>🖼️ Browse Photos</Text>
              </Pressable>
            </View>
          )}

          {step === 'review' && (
            <ScrollView
              contentContainerStyle={{ padding: 16, gap: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View style={{ justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                  <ActivityIndicator size="large" color={colors.accent} />
                </View>
              ) : (
                <>
                  {receiptUri && (
                    <Image
                      source={{ uri: receiptUri }}
                      style={{
                        width: '100%',
                        height: 200,
                        borderRadius: 12,
                        marginBottom: 16,
                      }}
                      resizeMode="cover"
                    />
                  )}

                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>
                      Store
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
                      {store || 'Unknown Store'}
                    </Text>
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>
                      Items ({selectedIndices.size} of {extractedItems.length})
                    </Text>
                  </View>

                  {extractedItems.map((item, idx) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: isDark ? '#2D2D4E' : '#F9FAFB',
                        borderWidth: 1,
                        borderColor: selectedIndices.has(idx) ? colors.accent : border,
                        gap: 12,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          const newSet = new Set(selectedIndices);
                          if (newSet.has(idx)) {
                            newSet.delete(idx);
                          } else {
                            newSet.add(idx);
                          }
                          setSelectedIndices(newSet);
                        }}
                        hitSlop={8}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            borderWidth: 2,
                            borderColor: selectedIndices.has(idx) ? colors.accent : border,
                            backgroundColor: selectedIndices.has(idx) ? colors.accent : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selectedIndices.has(idx) && <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>}
                        </View>
                      </Pressable>

                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                          {item.name}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                            {item.quantity} {item.unit}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '600' }}>
                            ${item.totalPrice.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>
                        {item.category}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          )}
        </View>

        {/* Footer */}
        {step === 'review' && !loading && (
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: border,
            }}
          >
            <Pressable
              onPress={handleClose}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: isDark ? '#2D2D4E' : '#F3F4F6',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleAddItems}
              disabled={selectedIndices.size === 0}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: selectedIndices.size === 0 ? '#CCCCCC' : colors.accent,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                Add {selectedIndices.size} Item{selectedIndices.size !== 1 ? 's' : ''}
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
