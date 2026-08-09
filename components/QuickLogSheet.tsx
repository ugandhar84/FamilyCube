/**
 * QuickLogSheet — bottom sheet for logging meals / treats from TodayScreen.
 * Mirrors the Daily screen's meal modal: sub-type chips, food name, optional photo proof.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '@/lib/ThemeContext';
import { showAlert } from '@/components/AppAlert';
import { uploadDailyPhoto } from '@/lib/supabase';
import { insertFeedingLog } from '@/lib/db/daily';
import { usePetStore } from '@/store/petStore';
import type { Pet } from '@/lib/types';

export type QuickLogKind = 'meal' | 'treat' | 'water';

interface Props {
  visible: boolean;
  kind: QuickLogKind;
  /** Pre-selected pet IDs (from picker) */
  petIds: string[];
  pets: Pet[];
  userId: string;
  today: string;
  /** When set, locks the meal sub-type selector to this value on open */
  initialMealType?: 'meal' | 'breakfast' | 'lunch' | 'dinner';
  onClose: () => void;
  onSaved: () => void;
}

const MEAL_SUBTYPES = [
  { key: 'meal',      label: 'Meal',      emoji: '🍽️' },
  { key: 'breakfast', label: 'Breakfast', emoji: '🍳' },
  { key: 'lunch',     label: 'Lunch',     emoji: '🥗' },
  { key: 'dinner',    label: 'Dinner',    emoji: '🌙' },
] as const;

function detectMealType(): 'meal' | 'breakfast' | 'lunch' | 'dinner' {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17) return 'dinner';
  return 'meal';
}

export default function QuickLogSheet({
  visible, kind, petIds, pets, userId, today, initialMealType, onClose, onSaved,
}: Props) {
  const { colors } = useTheme();
  const { fetchFeedingLogs } = usePetStore();

  const [subType, setSubType] = useState<'meal' | 'breakfast' | 'lunch' | 'dinner'>(
    initialMealType ?? detectMealType
  );
  const [foodName, setFoodName] = useState('');
  const [amount,   setAmount]   = useState('');
  const [photo,    setPhoto]    = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Allow photo library access to attach a proof photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true, quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  }, []);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Allow camera access to take a proof photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  }, []);

  const openPhotoMenu = () => {
    showAlert('Add photo proof', 'Choose a source', [
      { text: 'Camera',       onPress: takePhoto },
      { text: 'Library', onPress: pickPhoto },
      photo ? { text: '🗑️ Remove photo', style: 'destructive', onPress: () => setPhoto(null) } : null,
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean) as any[]);
  };

  const reset = () => {
    setSubType(initialMealType ?? detectMealType());
    setFoodName(''); setAmount(''); setPhoto(null); setSaving(false);
    setSubType(detectMealType());
  };

  const handleClose = () => { reset(); onClose(); };

  const save = async () => {
    if (!petIds.length) return;
    const amtNum = amount.trim() ? parseFloat(amount) : null;
    if (amtNum !== null && (isNaN(amtNum) || amtNum <= 0 || amtNum > 10000)) {
      if (isNaN(amtNum)) {
        setAmountError('Please enter a valid number');
      } else if (amtNum <= 0) {
        setAmountError('Amount must be greater than 0');
      } else {
        setAmountError('Amount seems too large');
      }
      return;
    }
    setAmountError(null);
    setSaving(true);
    try {
      const mealType = kind === 'treat' ? 'treat'
        : kind === 'water' ? 'water'
        : subType;

      let photoUrl: string | null = null;
      if (photo && petIds[0]) {
        try { photoUrl = await uploadDailyPhoto(petIds[0], 'meal', photo); } catch {}
      }

      await Promise.all(petIds.map((pid, i) =>
        insertFeedingLog({
          pet_id: pid, fed_by: userId,
          meal_type: mealType,
          food_type: foodName.trim() || null,
          amount_grams: amtNum,
          date: today, fed_at: new Date().toISOString(),
          ...(i === 0 ? { photo_url: photoUrl } : {}),
        } as any).catch(() => {})
      ));

      petIds.forEach(pid => fetchFeedingLogs(pid, today));
      reset();
      onSaved();
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const isTreatOrWater = kind === 'treat' || kind === 'water';
  const accentColor = colors.primary;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={[s.sheet, { backgroundColor: colors.card }]}>
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={s.headerRow}>
            <Text style={[s.title, { color: colors.textPrimary }]}>
              {kind === 'treat' ? '🦴 Log a treat'
                : kind === 'water' ? '💧 Log water'
                : '🍽️ Log a meal'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close-circle" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Pet chips (who is this for) */}
          {pets.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                {petIds.map(pid => {
                  const pet = pets.find(p => p.id === pid);
                  if (!pet) return null;
                  const pc = (pet as any).accent_color ?? accentColor;
                  return (
                    <View key={pid} style={[s.petChip, { backgroundColor: pc + '20', borderColor: pc + '60' }]}>
                      <Text style={{ fontSize: 14 }}>{(pet as any).emoji ?? '🐾'}</Text>
                      <Text style={[s.petChipLabel, { color: pc }]}>{pet.name}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Sub-type chips — only for meals */}
          {!isTreatOrWater && (
            <View style={s.subTypeRow}>
              {MEAL_SUBTYPES.map(t => {
                const sel = subType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setSubType(t.key as any)}
                    activeOpacity={0.75}
                    style={[s.subTypeChip, {
                      backgroundColor: sel ? accentColor + '15' : colors.inputBg,
                      borderColor: sel ? accentColor : colors.border,
                      borderWidth: sel ? 1.5 : StyleSheet.hairlineWidth,
                    }]}>
                    <Text style={{ fontSize: 15 }}>{t.emoji}</Text>
                    <Text style={[s.subTypeLabel, { color: sel ? accentColor : colors.textSecondary, fontWeight: sel ? '700' : '500' }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Food name */}
          {kind !== 'water' && (
            <TextInput
              style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
              placeholder={kind === 'treat' ? 'What treat? (optional)' : 'What did they eat? (optional)'}
              placeholderTextColor={colors.placeholder}
              value={foodName}
              onChangeText={t => setFoodName(t.replace(/[^\p{L}0-9\s\-'.,/&()]/gu, ''))}
              maxLength={80}
              returnKeyType="next"
            />
          )}

          {/* Amount */}
          {kind !== 'water' && (
            <>
              <TextInput
                style={[s.input, { backgroundColor: colors.inputBg, borderColor: amountError ? (colors.danger ?? '#E53935') : colors.inputBorder, color: colors.textPrimary }]}
                placeholder="Amount in grams (optional)"
                placeholderTextColor={colors.placeholder}
                value={amount}
                onChangeText={(val) => { setAmount(val); setAmountError(null); }}
                keyboardType="numeric"
                returnKeyType="done"
              />
              {amountError && <Text style={{ fontSize: 12, color: colors.danger ?? '#E53935', marginTop: -6, marginBottom: 10 }}>{amountError}</Text>}
            </>
          )}

          {/* Photo proof */}
          <TouchableOpacity
            onPress={openPhotoMenu}
            activeOpacity={0.75}
            style={[s.photoRow, { borderColor: photo ? accentColor : colors.border, backgroundColor: colors.inputBg }]}>
            {photo
              ? <Image source={{ uri: photo }} style={s.photoThumb} />
              : <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />}
            <Text style={[s.photoLabel, { color: photo ? accentColor : colors.textSecondary }]}>
              {photo ? 'Photo proof attached · tap to change' : 'Add photo proof (optional)'}
            </Text>
            {photo && (
              <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Save button */}
          <TouchableOpacity
            onPress={save}
            activeOpacity={0.85}
            disabled={saving}
            style={[s.saveBtn, { backgroundColor: accentColor }]}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>
                  {kind === 'treat' ? 'Log treat 🦴'
                    : kind === 'water' ? 'Log water 💧'
                    : 'Log meal 🍽️'}
                </Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:     { flex: 1 },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title:        { fontSize: 17, fontWeight: '800' },

  petChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  petChipLabel: { fontSize: 13, fontWeight: '700' },

  subTypeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  subTypeChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  subTypeLabel: { fontSize: 13 },

  input:        { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15, marginBottom: 10 },

  photoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                  borderWidth: 1.5, borderStyle: 'dashed' as const },
  photoThumb:   { width: 44, height: 44, borderRadius: 8 },
  photoLabel:   { flex: 1, fontSize: 14 },

  saveBtn:      { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:  { fontSize: 16, fontWeight: '800', color: '#fff' },
});
