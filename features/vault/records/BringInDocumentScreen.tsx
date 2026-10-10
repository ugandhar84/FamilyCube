/**
 * BringInDocumentScreen — "Screen A" of the new Health Documents scan/
 * upload flow (full Figma treatment, matching HealthFigmaList.tsx/
 * AddMedModal.tsx's flat-token pattern: PAGE_BG/TITLE_CLR/BODY_CLR/BLUE/
 * LINK_BLUE/BORDER, white "Populated field" inputs, 22px-radius
 * content-group cards with soft shadow, teal privacy card).
 *
 * This is the entry point for RecordsTab.tsx's real encrypted/AI-reviewed
 * document flow — camera/library photo picks continue into
 * RedactDocumentScreen (Screen B, which wraps the real PhotoRedactModal
 * drag-to-draw tool); a file-picker PDF/image has no redaction step today
 * (see the honesty note below) and goes straight to AddRecordModal's save
 * path.
 *
 * HONESTY NOTE (verified against the real code before shipping this
 * screen's copy — see recordsCrypto.ts, AddRecordModal.tsx,
 * analyze-medical-record/index.ts):
 * - The ORIGINAL file IS uploaded to Supabase Storage
 *   ('medical-records' bucket) when a record is saved — RecordsTab.tsx's
 *   addRecord() does this unconditionally for whatever `file` ends up set.
 *   For a camera/library photo, `file` is the FLATTENED, already-redacted
 *   image (AddRecordModal's handleRedactConfirm writes the ViewShot
 *   capture, not the original asset) — so for THAT path, the copy that
 *   gets stored/sent really is the redacted one, not the untouched
 *   original. For a file-picker PDF/image, there is no redaction step at
 *   all today — the original is uploaded and analyzed as-is.
 * - The mockup's blanket "No original document is stored or sent to AI in
 *   this flow" is therefore NOT accurate for every path and is not shipped
 *   verbatim. The copy below is scoped to what's actually true per source.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera, Upload, Shield, FileText, ChevronDown, Check,
} from 'lucide-react-native';
import { TAGS, RecordTag, memberColor } from './types';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from
// the shared module instead of redeclared locally
// [live-requested: "make modularize for simplicity"].
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BLUE      = GEMINI.blue;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;

function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 14 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 14 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

export default function BringInDocumentScreen({
  colors, isDark, members, activeMemberId, familySurname, ownerName,
  onClose,
  onPickCamera, onPickLibrary, onPickFiles,
  onManualEntry,
  recordType, setRecordType,
  recordOwnerId, setRecordOwnerId,
}: {
  colors: any; isDark: boolean; members: any[]; activeMemberId: string | null;
  familySurname?: string;
  ownerName: string;
  onClose: () => void;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  onPickFiles: () => void;
  onManualEntry: () => void;
  recordType: RecordTag;
  setRecordType: (t: RecordTag) => void;
  recordOwnerId: string;
  setRecordOwnerId: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;

  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);

  const typeMeta = TAGS.find(t => t.id === recordType) ?? TAGS[0];
  const ownerMember = members.find(m => m.id === recordOwnerId);

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: bodyC, textTransform: 'uppercase' }}>
            Family Cube{familySurname ? ` / ${familySurname.toUpperCase()}` : ''}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? bodyC : LINK_BLUE }}>
            {ownerName} · Record owner
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 4, lineHeight: 36 }}>
          Bring in a document
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24, gap: 14 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: BLUE + '15', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE }}>Visit record · health document</Text>
          </View>
        </View>

        <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19 }}>
          Choose a source. For a photo you take or pick now, you'll get a chance to black out private details
          before it's saved or analyzed.
        </Text>

        {/* Choose how to bring it in */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Choose how to bring it in</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={19} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Take a photo</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>Keep the page clear, flat and in frame.</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onPickCamera}
            style={{ backgroundColor: BLUE, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Open camera</Text>
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: border, marginVertical: 2 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={19} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Choose an existing file</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>Photo or PDF — one document at a time.</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onPickLibrary}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Choose photo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onPickFiles}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Choose PDF</Text>
            </TouchableOpacity>
          </View>
          {/* Honest, path-specific disclosure — a file-picker pick has no
              redaction step today (see module header), so this is surfaced
              right under the affordance that skips it, not buried. */}
          <Text style={{ fontSize: 11, color: bodyC, lineHeight: 15 }}>
            A photo you take or pick from Photos goes through a black-out step first. A PDF or file chosen here is
            saved and analyzed as-is, with no redaction step yet.
          </Text>
        </View>

        {/* Record type */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Record type</Text>
          <TouchableOpacity onPress={() => setShowTypePicker(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: isDark ? colors.surface : '#F8FAFC',
              paddingHorizontal: 14, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <typeMeta.Icon size={15} color={typeMeta.color} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{typeMeta.label}</Text>
            </View>
            <ChevronDown size={15} color={bodyC} />
          </TouchableOpacity>
          {showTypePicker && (
            <View style={{ gap: 6, marginTop: 2 }}>
              {TAGS.filter(t => t.id !== 'visit_recording').map(t => {
                const sel = t.id === recordType;
                return (
                  <TouchableOpacity key={t.id} onPress={() => { setRecordType(t.id); setShowTypePicker(false); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10,
                      paddingHorizontal: 10, paddingVertical: 9,
                      backgroundColor: sel ? t.color + '15' : 'transparent' }}>
                    <t.Icon size={14} color={t.color} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: titleC, flex: 1 }}>{t.label}</Text>
                    {sel && <Check size={14} color={t.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Record owner */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Record owner</Text>
          <TouchableOpacity onPress={() => setShowOwnerPicker(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: isDark ? colors.surface : '#F8FAFC',
              paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{ownerMember?.name ?? 'Select member'}</Text>
            <ChevronDown size={15} color={bodyC} />
          </TouchableOpacity>
          {showOwnerPicker && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
              {members.map((m, i) => {
                const sel = m.id === recordOwnerId;
                const c = memberColor(i);
                return (
                  <TouchableOpacity key={m.id} onPress={() => { setRecordOwnerId(m.id); setShowOwnerPicker(false); }}
                    style={{ borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8,
                      backgroundColor: sel ? c + '20' : 'transparent', borderColor: sel ? c : border }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? c : bodyC }}>{m.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Privacy card — scoped to what's actually true (see module header) */}
        <View style={{ backgroundColor: colors.tealLight, borderRadius: 16, padding: 16, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Shield size={13} color={colors.teal} />
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.teal, textTransform: 'uppercase' }}>
              Privacy comes first
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: isDark ? colors.textPrimary : '#1D3B2E', marginTop: 2, lineHeight: 18 }}>
            For a photo, you black out private details before anything is saved or sent for AI review — the
            flattened, redacted copy is what gets stored and analyzed, not the untouched original. A PDF or file
            chosen directly has no black-out step yet, so review it carefully before continuing.
          </Text>
        </View>

        <TouchableOpacity onPress={onManualEntry}
          style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FileText size={15} color={isDark ? BLUE : LINK_BLUE} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Enter details manually instead</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>Cancel · discard local selection</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
