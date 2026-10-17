/**
 * CaptureScreen — Step 1 of the full-page flyer scanner flow ("capture").
 * Up to 3 photos (camera or gallery) OR 1 PDF, plus who it is for; "Analyse with AI" kicks off the parse-flyer call
 * (owned by FlyerScannerModal, passed in as onAnalyse).
 *
 * Same look as the document scan page (BringInDocumentScreen): cream canvas, white shadowed group cards with an icon tile,
 * a title and one clear action per source.
 */
import { View, Text, Pressable, Image, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Images, FileText, X, Sparkles, Users } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import FlyerScreenHeader from './FlyerScreenHeader';
import { CapturedImage } from './types';

export default function CaptureScreen({
  colors, isDark,
  images, removeImage,
  onPickCamera, onPickGallery, onPickPDF,
  onAnalyse, onClose,
  errorMsg,
  kids, allNames, selectedKids, setSelKids,
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
  kids: any[]; allNames: string[];
  selectedKids: string[];
  setSelKids: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const pageBg = isDark ? colors.background : GEMINI.canvas;
  const BLUE = GEMINI.blue;
  const hasPdf = images.some(img => img.mimeType === 'application/pdf');
  const full = images.length >= 3 || hasPdf;
  const ready = images.length > 0;

  const group = isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: RHYTHM.card, gap: 14 as const }
    : { backgroundColor: cardBg, borderRadius: 22, padding: RHYTHM.card, gap: 14 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 3 };

  const source = (Icon: any, title: string, sub: string, label: string, onPress: () => void, tint: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint + '1F', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={19} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>{title}</Text>
        <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>{sub}</Text>
      </View>
      <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
        style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : GEMINI.linkBlue }}>{label}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <FlyerScreenHeader
        colors={colors} isDark={isDark}
        backLabel="‹ Cancel"
        onBack={onClose}
        title="Scan a flyer"
        subtitle="School calendars, activity flyers, permission slips"
      />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, paddingBottom: RHYTHM.section, gap: RHYTHM.item }}>

        {/* Who is it for */}
        {kids.length > 0 && (
          <View style={group}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Users size={16} color={BLUE} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Who is it for?</Text>
              </View>
              {kids.length > 1 && (
                <TouchableOpacity onPress={() => setSelKids(selectedKids.length === kids.length ? [] : kids.map(k => k.id))}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : GEMINI.linkBlue }}>
                    {selectedKids.length === kids.length ? 'Clear' : 'All kids'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {kids.map(k => {
                const sel = selectedKids.includes(k.id);
                return (
                  <Pressable key={k.id} onPress={() => setSelKids(prev => sel ? prev.filter(id => id !== k.id) : [...prev, k.id])}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, borderWidth: 1.5, paddingVertical: 6, paddingLeft: 6, paddingRight: 14,
                      backgroundColor: sel ? BLUE + '18' : 'transparent', borderColor: sel ? BLUE : border }}>
                    <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} siblings={allNames} size={28} ringColor={sel ? BLUE : colors.textTertiary} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? BLUE : titleC }}>{k.name.split(' ')[0]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 12, color: bodyC }}>Everything found on the flyer is added to each of them. You can change this before importing.</Text>
          </View>
        )}

        {/* Pages added so far */}
        {images.length > 0 && (
          <View style={group}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>{hasPdf ? 'Your PDF' : `Your pages · ${images.length} of 3`}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {images.map((img, i) => (
                <View key={i} style={{ position: 'relative' }}>
                  <Image source={{ uri: img.uri }} style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: colors.surface }} />
                  <Pressable onPress={() => removeImage(i)} hitSlop={8}
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={13} color="#FFFFFF" />
                  </Pressable>
                  {img.mimeType === 'application/pdf' && (
                    <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>PDF</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Sources */}
        {!full && (
          <View style={group}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Choose how to bring it in</Text>
            {source(Camera, 'Take a photo', 'Keep the page flat and in frame.', 'Camera', onPickCamera, BLUE)}
            <View style={{ height: 1, backgroundColor: border }} />
            {source(Images, 'Photo library', `Pick up to ${3 - images.length} photo${3 - images.length !== 1 ? 's' : ''}.`, 'Choose', onPickGallery, colors.teal)}
            {images.length === 0 && (
              <>
                <View style={{ height: 1, backgroundColor: border }} />
                {source(FileText, 'A PDF', 'Multi-page flyers and permission slips.', 'Choose', onPickPDF, colors.amber)}
              </>
            )}
          </View>
        )}

        {errorMsg ? (
          <View style={{ backgroundColor: colors.danger + '1F', borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 13, color: colors.danger, fontWeight: '700' }}>{errorMsg}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={onAnalyse} disabled={!ready} accessibilityRole="button"
          style={{ flexDirection: 'row', gap: 8, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center',
            backgroundColor: ready ? BLUE : colors.border }}>
          <Sparkles size={16} color={ready ? '#FFFFFF' : colors.textTertiary} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: ready ? '#FFFFFF' : colors.textTertiary }}>Read it with AI</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
