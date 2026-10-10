/**
 * BringInPrescriptionScreen — "Screen A" for the Scan Prescription / Scan
 * Vaccine flow. Same visual shell as BringInDocumentScreen (PAGE_BG/
 * TITLE_CLR/BODY_CLR/BLUE/LINK_BLUE/BORDER flat tokens, 22px-radius white
 * "content group" cards with soft shadow, per-role teal/lavender privacy
 * card) so the two entry points read as one coherent system.
 *
 * Owns only the source-picker affordances — camera / photo library / PDF.
 * All redaction and AI review logic stays inside ScanReviewSheet (unchanged).
 * This screen calls the same pickImage / pickAndScan handlers that
 * ScanReviewSheet's old inline page-1 did, so no scan logic moves.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Upload, Shield, ChevronDown, Check, Minus, Plus } from 'lucide-react-native';

const PAGE_BG   = '#F5F7FB';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BLUE      = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER    = '#DFE5EF';
const CARD_BG   = '#FFFFFF';

function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 14 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 14 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

export default function BringInPrescriptionScreen({
  colors, isDark,
  scanMode,
  members, activeMemberId,
  familySurname,
  onClose,
  onPickCamera,
  onPickLibrary,
  onPickPdf,
  ownerMemberId, setOwnerMemberId,
  maxPages, setMaxPages,
}: {
  colors: any;
  isDark: boolean;
  scanMode: 'rx' | 'vaccine';
  members: any[];
  activeMemberId: string;
  familySurname?: string;
  onClose: () => void;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  onPickPdf: () => void;
  ownerMemberId: string;
  setOwnerMemberId: (id: string) => void;
  maxPages: number;
  setMaxPages: (n: number) => void;
}) {
  const insets  = useSafeAreaInsets();
  const titleC  = isDark ? colors.textPrimary   : TITLE_CLR;
  const bodyC   = isDark ? colors.textSecondary : BODY_CLR;
  const border  = isDark ? colors.border        : BORDER;
  const cardBg  = isDark ? colors.card          : CARD_BG;
  const pageBg  = isDark ? colors.background    : PAGE_BG;
  const accent  = scanMode === 'vaccine' ? colors.teal : colors.accent;
  const accentL = scanMode === 'vaccine' ? colors.tealLight : colors.pinkLight;

  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const ownerMember = members.find(m => m.id === ownerMemberId) ?? members[0];

  const isRx = scanMode === 'rx';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: bodyC, textTransform: 'uppercase' }}>
            Family Cube{familySurname ? ` / ${familySurname.toUpperCase()}` : ''}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? bodyC : LINK_BLUE }}>
            {ownerMember?.name ?? '—'} · Record owner
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 4, lineHeight: 36 }}>
          {isRx ? 'Scan prescription' : 'Scan vaccine record'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24, gap: 14 }}>

        {/* Type badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: accent + '18', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>
              {isRx ? 'Medication · prescription' : 'Vaccine · immunization record'}
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19 }}>
          Choose a source. For a photo you take or pick from Photos, you'll get a chance to black out private details before it's sent to AI.
        </Text>

        {/* Source picker card */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Choose how to bring it in</Text>

          {/* Page count stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 14, paddingVertical: 10 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Pages to scan</Text>
              <Text style={{ fontSize: 11, color: bodyC, marginTop: 2 }}>Max pages per document (1–10)</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setMaxPages(Math.max(1, maxPages - 1))}
                disabled={maxPages <= 1}
                style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent + '18',
                  alignItems: 'center', justifyContent: 'center', opacity: maxPages <= 1 ? 0.4 : 1 }}>
                <Minus size={15} color={accent} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: titleC, minWidth: 22, textAlign: 'center' }}>{maxPages}</Text>
              <TouchableOpacity onPress={() => setMaxPages(Math.min(10, maxPages + 1))}
                disabled={maxPages >= 10}
                style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent + '18',
                  alignItems: 'center', justifyContent: 'center', opacity: maxPages >= 10 ? 0.4 : 1 }}>
                <Plus size={15} color={accent} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: border }} />

          {/* Camera */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={19} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Take a photo</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>Keep the page clear, flat and in frame.</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onPickCamera}
            style={{ backgroundColor: accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
              {isRx ? 'Scan prescription' : 'Scan vaccine record'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: border, marginVertical: 2 }} />

          {/* Photo library + PDF */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={19} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Choose an existing file</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>Photo or PDF — one document at a time.</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onPickLibrary}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? accent : LINK_BLUE }}>
                {isRx ? 'Upload Rx photo' : 'Upload vax photo'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onPickPdf}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? accent : LINK_BLUE }}>
                {isRx ? 'Upload Rx PDF' : 'Upload vax PDF'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: bodyC, lineHeight: 15 }}>
            A photo goes through a black-out step before AI sees it. A PDF is sent as-is — redact sensitive pages before choosing if needed.
          </Text>
        </View>

        {/* Who is this for? */}
        {members.length > 1 && (
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Who is this for?</Text>
            <TouchableOpacity onPress={() => setShowOwnerPicker(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: isDark ? colors.surface : '#F8FAFC',
                paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{ownerMember?.name ?? 'Select member'}</Text>
              <ChevronDown size={15} color={bodyC} />
            </TouchableOpacity>
            {showOwnerPicker && (
              <View style={{ gap: 6, marginTop: 2 }}>
                {members.map(m => {
                  const sel = m.id === ownerMemberId;
                  const mc  = m.role === 'parent' ? colors.teal : colors.amber;
                  return (
                    <TouchableOpacity key={m.id} onPress={() => { setOwnerMemberId(m.id); setShowOwnerPicker(false); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 9, backgroundColor: sel ? mc + '15' : 'transparent' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: titleC, flex: 1 }}>{m.name}</Text>
                      <Text style={{ fontSize: 11, color: bodyC }}>{m.role}</Text>
                      {sel && <Check size={14} color={mc} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Privacy card */}
        <View style={{ flexDirection: 'row', gap: 12, borderRadius: 18, padding: 14,
          backgroundColor: isDark ? accentL + '22' : accentL, borderWidth: 1, borderColor: accent + '30' }}>
          <Shield size={18} color={accent} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>
              {isRx ? 'Your prescription stays private' : 'Your vaccine record stays private'}
            </Text>
            <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
              {isRx
                ? 'AI reads the document to extract medication details. The original image is never stored by AI — only the structured data you approve is saved to your family vault.'
                : 'AI reads the record to extract vaccine name, date and dose. The original image is never stored by AI — only the structured data you approve is saved.'}
            </Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
