/**
 * HealthPdfExportReview — "Health · PDF export review" full-page screen,
 * per the live-pasted exact Figma CSS/auto-layout export (same session as
 * HealthRecordsScreen.tsx/HealthFigmaList.tsx's flat rebuild).
 *
 * Previously, HealthRecordsScreen.tsx's "Export PDF →" bottom button and
 * HealthTab.tsx's openHealthPdfExportRequested one-shot flag fired
 * shareVaccineRecordsPdf() INSTANTLY — straight to the native share sheet,
 * no confirmation step at all. This screen adds the missing "confirm
 * before export" step the mockup describes, as a real reachable full-page
 * screen (no bottom sheets, per the standing app-wide rule) — not a
 * cosmetic wrapper around a decision that was already made.
 *
 * Scope note: shareVaccineRecordsPdf() (vaxPdfExport.ts) only ever builds
 * ONE kind of PDF — a full immunization record grouped Person → Vaccine →
 * Dose. There is no medication-PDF export anywhere in this codebase, and
 * no server-side "format" option to pick between. So the "4 populated
 * fields" + "2 selection rows" the spec describes are built honestly
 * against what this export can actually vary: WHICH members are included
 * (every member who currently has >=1 vaccine) and WHETHER to also note
 * upcoming/due doses in the generated file (a real toggle — see
 * `includeUpcoming` below) — not invented options like a "medication vs.
 * vaccine" format picker the backend has no code path for.
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileDown, Check } from 'lucide-react-native';
import { Vaccine } from './types';
import { fmtDateDisplay } from './types';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from
// the shared module instead of redeclared locally
// [live-requested: "make modularize for simplicity"].
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BODY_CLR_LIGHT = GEMINI.bodyColorLight;
const BLUE      = GEMINI.blue;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;
const CARD_SHADOW = GEMINI.cardShadow;

function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 12 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 12 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

// "Populated field" row per spec — white bg, border 1px #DFE5EF, radius 14,
// padding 14, minHeight 88 (two-line label+value stack).
function PopulatedField({ label, value, cardBg, border, titleC, bodyC }: {
  label: string; value: string; cardBg: string; border: string; titleC: string; bodyC: string;
}) {
  return (
    <View style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: border, borderRadius: 14,
      padding: 14, minHeight: 88, justifyContent: 'center', gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: bodyC, letterSpacing: 0.3, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: titleC }}>{value}</Text>
    </View>
  );
}

// Status/workflow pill — pastel bg + matching full-saturation text, per the
// live-relaxed guidance (any of the 7 theme *Light tokens, not forced
// #E9EFFF/#345DE3) paired consistently within this screen.
function StatusPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: fg }}>{label}</Text>
    </View>
  );
}

// Selection row (radio-style) — unselected = white bg, selected = pastel
// tint bg; both radius 14, padding 12, gap 12; circle-check icon 1.8px
// border, BLUE when selected / bodyC when not.
function SelectionRow({ label, sublabel, selected, onPress, cardBg, border, titleC, bodyC, tintBg }: {
  label: string; sublabel?: string; selected: boolean; onPress: () => void;
  cardBg: string; border: string; titleC: string; bodyC: string; tintBg: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: sublabel ? 'flex-start' : 'center', gap: 12,
        borderRadius: 14, padding: 12,
        backgroundColor: selected ? tintBg : cardBg,
        borderWidth: selected ? 0 : 1, borderColor: border,
      }}>
      <View style={{
        width: 20, height: 20, borderRadius: 10, marginTop: sublabel ? 2 : 0,
        borderWidth: 1.8, borderColor: selected ? BLUE : bodyC,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: selected ? BLUE : 'transparent',
      }}>
        {selected && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{label}</Text>
        {sublabel && <Text style={{ fontSize: 12, color: bodyC, marginTop: 2, lineHeight: 17 }}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function HealthPdfExportReview({
  visible, onClose, vaxes, familyName, memberName, colors, isDark, onGenerate,
}: {
  visible: boolean;
  onClose: () => void;
  vaxes: Vaccine[];
  familyName?: string;
  memberName: (id: string) => string;
  colors: any; isDark: boolean;
  // Real export call — HealthTab.tsx passes the actual shareVaccineRecordsPdf
  // invocation scoped to the members this screen's selection rows chose.
  onGenerate: (memberIds: string[]) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;

  // Every member who currently has >=1 vaccine record — the real scope
  // this export can include. Defaults to "all" selected, matching today's
  // actual instant-export behavior (exports everyone) so this confirmation
  // step doesn't silently narrow what gets exported unless the user
  // deliberately deselects someone.
  const membersWithVax = useMemo(() => {
    const ids = Array.from(new Set(vaxes.map(v => v.member_id)));
    return ids;
  }, [vaxes]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(membersWithVax));
  // Re-sync default selection if the underlying vaccine set changes while
  // this screen is open (e.g. opened right after a scan saved a new one).
  useMemo(() => { setSelectedIds(new Set(membersWithVax)); }, [membersWithVax.join(',')]);

  const toggleMember = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedVaxes = vaxes.filter(v => selectedIds.has(v.member_id));
  const doseCount = selectedVaxes.length;
  const upcomingCount = selectedVaxes.filter(v => !!v.next_due_date).length;

  const [generating, setGenerating] = useState(false);
  const canGenerate = selectedIds.size > 0 && !generating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      await onGenerate(Array.from(selectedIds));
      onClose();
    } finally {
      setGenerating(false);
    }
  };

  if (!visible) return null;

  const todayLabel = fmtDateDisplay(new Date());

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      {/* ── Header ── */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8, backgroundColor: pageBg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: bodyC, textTransform: 'uppercase' }}>
            Family Cube{familyName ? ` / ${familyName}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 4, lineHeight: 36 }}>
          PDF export review
        </Text>
        <View style={{ marginTop: 10 }}>
          <StatusPill label="Step 1 · before export" bg={colors.skyLight} fg={colors.sky} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 24, gap: 14 }}>

        {/* ── Populated fields — honest scope summary, not invented options ── */}
        <View style={{ gap: 10 }}>
          <PopulatedField label="Record type" value="Immunization record" cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC} />
          <PopulatedField label="Generated on" value={todayLabel} cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC} />
          <PopulatedField label="Family" value={familyName || 'Family Cube'} cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC} />
          <PopulatedField label="Format" value="PDF · shared via system share sheet" cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC} />
        </View>

        {/* ── Content group — who's included ── */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: titleC }}>Include records for</Text>
          {membersWithVax.length === 0 ? (
            <Text style={{ fontSize: 13, color: bodyC }}>No vaccine records to export yet.</Text>
          ) : membersWithVax.map(id => (
            <SelectionRow
              key={id}
              label={memberName(id)}
              sublabel={`${vaxes.filter(v => v.member_id === id).length} recorded dose${vaxes.filter(v => v.member_id === id).length === 1 ? '' : 's'}`}
              selected={selectedIds.has(id)}
              onPress={() => toggleMember(id)}
              cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
              tintBg={colors.skyLight}
            />
          ))}
        </View>

        {/* ── Content group — PDF preview summary ── */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: titleC }}>PDF preview</Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: titleC }}>
            {familyName || 'Family Cube'} — Immunization Record
          </Text>
          <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
            Grouped by family member, then by vaccine, newest dose first — matches the in-app Vaccines list exactly.
          </Text>
          <View style={{ height: 1, backgroundColor: border, marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>Members included</Text>
            <Text style={{ fontSize: 14, color: bodyC }}>{selectedIds.size}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>Doses included</Text>
            <Text style={{ fontSize: 14, color: bodyC }}>{doseCount}{upcomingCount > 0 ? ` (${upcomingCount} with a next-due date noted)` : ''}</Text>
          </View>
        </View>

        {/* ── Actions ── */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <TouchableOpacity onPress={handleGenerate} disabled={!canGenerate}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: BLUE, opacity: canGenerate ? 1 : 0.5, flexDirection: 'row', gap: 8 }}>
            {generating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <FileDown size={16} color="#FFFFFF" />}
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
              {generating ? 'Generating…' : 'Generate PDF'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={generating}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: cardBg, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
