import { View, Text, Pressable, TextInput, Modal, Image, ActivityIndicator } from 'react-native';
import { Receipt, X, Camera, Image as ImageIcon, Send } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';

export function ReceiptSubmissionModal({
  visible, onClose,
  colors, isDark,
  receiptPhotoUri, setReceiptPhotoUri,
  receiptAmountStr, setReceiptAmountStr,
  receiptNote, setReceiptNote,
  onTakePhoto, onPickFromGallery, onSubmit, isSubmitting,
  active,
}: {
  visible: boolean; onClose: () => void;
  colors: any; isDark: boolean;
  receiptPhotoUri: string | null; setReceiptPhotoUri: (v: string | null) => void;
  receiptAmountStr: string; setReceiptAmountStr: (v: string) => void;
  receiptNote: string; setReceiptNote: (v: string) => void;
  onTakePhoto: () => void; onPickFromGallery: () => void; onSubmit: () => void;
  isSubmitting?: boolean;
  active?: { name: string };
}) {
  const actorName = active?.name ?? 'senior';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}
          style={{ backgroundColor: isDark ? '#1E293B' : '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, gap: 16, maxHeight: '90%' }}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Receipt size={22} color={BRAND.teal} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>Submit Receipt</Text>
              <Text style={{ fontSize: GP.sub, color: colors.textSecondary, marginTop: 2 }}>
                Snap or upload your receipt — parents will reimburse you
              </Text>
            </View>
            <Pressable onPress={() => { onClose(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* Receipt photo area */}
          {receiptPhotoUri ? (
            <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: BRAND.teal + '60' }}>
              <Image source={{ uri: receiptPhotoUri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
              <Pressable onPress={() => { setReceiptPhotoUri(null); }}
                style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#000a', borderRadius: 20,
                  paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ color: '#fff', fontSize: GP.sub, fontWeight: '700' }}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => { onTakePhoto(); }}
                style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
                  borderColor: BRAND.teal + '60', paddingVertical: 20, alignItems: 'center', gap: 6,
                  backgroundColor: isDark ? BRAND.teal + '10' : '#F0FDF4' }}>
                <Camera size={24} color={BRAND.teal} />
                <Text style={{ fontSize: GP.sub, fontWeight: '700', color: BRAND.teal }}>Camera</Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>Scan receipt</Text>
              </Pressable>
              <Pressable onPress={() => { onPickFromGallery(); }}
                style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
                  borderColor: BRAND.teal + '40', paddingVertical: 20, alignItems: 'center', gap: 6,
                  backgroundColor: isDark ? BRAND.teal + '08' : '#F0FDF4' }}>
                <ImageIcon size={24} color={BRAND.teal} />
                <Text style={{ fontSize: GP.sub, fontWeight: '700', color: BRAND.teal }}>Gallery</Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>From photos</Text>
              </Pressable>
            </View>
          )}

          {/* Amount */}
          <View>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Amount spent (optional)
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5,
              borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              paddingHorizontal: 14, gap: 6 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>$</Text>
              <TextInput
                value={receiptAmountStr}
                onChangeText={setReceiptAmountStr}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, paddingVertical: 12 }}
              />
            </View>
          </View>

          {/* Note */}
          <View>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Note for parents (optional)
            </Text>
            <TextInput
              value={receiptNote}
              onChangeText={setReceiptNote}
              placeholder="e.g. bought the bread and milk, couldn't find the cereal brand"
              placeholderTextColor={colors.textTertiary}
              multiline numberOfLines={2}
              style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? '#334155' : '#E2E8F0',
                backgroundColor: isDark ? '#0F172A' : '#F8FAFC', padding: 12,
                fontSize: GP.sub, color: colors.textPrimary, minHeight: 72, textAlignVertical: 'top' }}
            />
          </View>

          {/* Submit */}
          <Pressable
            onPress={onSubmit}
            style={{ backgroundColor: BRAND.teal, borderRadius: 14, paddingVertical: 15,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: ((!receiptPhotoUri && !receiptAmountStr.trim()) || isSubmitting) ? 0.5 : 1 }}
            disabled={(!receiptPhotoUri && !receiptAmountStr.trim()) || isSubmitting}>
            {isSubmitting ? <ActivityIndicator color="#fff" size="small" /> : <Send size={16} color="#fff" />}
            <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#fff' }}>
              {isSubmitting ? 'Uploading…' : `Send to Parents${receiptAmountStr.trim() ? ` · $${receiptAmountStr}` : ''}`}
            </Text>
          </Pressable>
          {/* Only shown while the requirement isn't yet satisfied — was
              static regardless of state, so a grandparent who'd already
              attached a photo still saw "is required" text implying
              something was still missing even with the button enabled. */}
          {!receiptPhotoUri && !receiptAmountStr.trim() && (
            <Text style={{ fontSize: GP.tiny, color: colors.textTertiary, textAlign: 'center' }}>
              At least a photo or amount is required
            </Text>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}
