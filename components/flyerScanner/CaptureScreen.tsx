/**
 * CaptureScreen — Step 1 of the full-page flyer scanner flow ("capture").
 * Up to 3 photos (camera or gallery) OR 1 PDF, queued as thumbnails;
 * "Analyse with AI" kicks off the parse-flyer call (owned by the parent
 * FlyerScannerModal, passed in as onAnalyse).
 *
 * Full-page conversion of the former AppBottomSheet step body — behavior
 * unchanged, header/footer now hand-rolled full-page chrome matching
 * BringInDocumentScreen.tsx's pattern instead of AppBottomSheet's shared
 * title/subtitle/footer slots.
 */
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FlyerScreenHeader from './FlyerScreenHeader';
import { CapturedImage } from './types';

export default function CaptureScreen({
  colors, isDark,
  images, removeImage,
  onPickCamera, onPickGallery, onPickPDF,
  onAnalyse, onClose,
  errorMsg,
}: {
  colors: any; isDark: boolean;
  images: CapturedImage[];
  removeImage: (i: number) => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  onPickPDF: () => void;
  onAnalyse: () => void;
  onClose: () => void;
  errorMsg: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      <FlyerScreenHeader
        colors={colors} isDark={isDark}
        backLabel="‹ Cancel"
        onBack={onClose}
        title="Scan Activity Flyer"
        subtitle="Up to 3 photos or 1 PDF → AI extracts the schedule"
      />

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 10 }}>
        {/* Thumbnail strip */}
        {images.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {images.map((img, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image source={{ uri: img.uri }} style={f.thumb} />
                <Pressable onPress={() => removeImage(i)}
                  style={f.thumbClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </Pressable>
                {img.mimeType === 'application/pdf' && (
                  <View style={f.pdfBadge}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>PDF</Text>
                  </View>
                )}
              </View>
            ))}
            {Array.from({ length: 3 - images.length }).map((_, i) => (
              <View key={`empty-${i}`} style={[f.thumb, f.thumbEmpty, { borderColor: colors.border }]}>
                <Ionicons name="add" size={22} color={colors.textTertiary} />
              </View>
            ))}
          </View>
        )}

        {/* Add buttons */}
        <View style={{ gap: 10 }}>
          {images.length < 3 && (
            <>
              <Pressable onPress={onPickCamera}
                style={[f.addBtn, { backgroundColor: BRAND.purple + '18', borderColor: BRAND.purple + '40' }]}>
                <Ionicons name="camera" size={22} color={BRAND.purple} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Take a Photo</Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Point camera at the flyer</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={BRAND.purple} />
              </Pressable>

              <Pressable onPress={onPickGallery}
                style={[f.addBtn, { backgroundColor: BRAND.teal + '15', borderColor: BRAND.teal + '40' }]}>
                <Ionicons name="images" size={22} color={BRAND.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>Browse Gallery</Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    Pick up to {3 - images.length} photo{3 - images.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={BRAND.teal} />
              </Pressable>

              {!images.some(img => img.mimeType === 'application/pdf') && (
                <Pressable onPress={onPickPDF}
                  style={[f.addBtn, { backgroundColor: BRAND.amber + '15', borderColor: BRAND.amber + '40' }]}>
                  <Ionicons name="document-text" size={22} color={BRAND.amber} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }}>Pick a PDF</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Multi-page flyers, permission slips</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={BRAND.amber} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>

      {/* Sticky footer — replaces AppBottomSheet's `footer` slot */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 16 }}>
        {errorMsg ? (
          <View style={{ backgroundColor: '#EF444420', borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: '#EF4444', fontWeight: '700' }}>⚠️ {errorMsg}</Text>
          </View>
        ) : null}
        <Pressable onPress={onAnalyse}
          style={[f.submitBtn, { backgroundColor: images.length ? BRAND.purple : colors.border }]}>
          <Ionicons name="sparkles" size={16} color={images.length ? '#fff' : colors.textTertiary} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: images.length ? '#fff' : colors.textTertiary }}>
            Analyse with AI →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  thumb:      { width: 90, height: 90, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1E293B' },
  thumbEmpty: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  thumbClose: { position: 'absolute', top: -6, right: -6 },
  pdfBadge:   { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  submitBtn:  { flexDirection: 'row', gap: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
