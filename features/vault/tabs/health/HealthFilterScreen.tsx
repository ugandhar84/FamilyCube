/**
 * HealthFilterScreen — full-page replacement for HealthFilterSheet.tsx's
 * bottom sheet, per the standing "no bottom sheets" app-wide rule. Drives
 * the SAME real filter state the new useHealthRecords.ts hook owns
 * (draftMed/draftVax + applyFilters/resetFilters) — this is not a second,
 * parallel filter system.
 *
 * Judgment call (flagged per the task spec): the real medMemberFilter/
 * vaxMemberFilter state is MULTI-select today (an array), so this screen's
 * member rows are checkboxes, not radio buttons — kept multi-select rather
 * than silently narrowing to single-select.
 *
 * Judgment call: a "Date field" + From/To date-range filter is implied by
 * the mockup but does not exist in the real filter state (draftVax only
 * has a single dueSoonDays number, no generic date-range). Not fabricated
 * here — the due-soon-days chips (7/14/30/60/90) are the real, working
 * equivalent for vaccines; medications have no date-range filter at all
 * today. This is a documented gap, not something presented as working.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { MemberAvatar } from '../shared';
import { FREQ_LABELS, getCatColors, Medication, Vaccine } from './types';
import { MedFilters, VaxFilters } from './HealthFilterSheet';
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
        width: 20, height: 20, borderRadius: 6, marginTop: sublabel ? 2 : 0,
        borderWidth: 1.8, borderColor: selected ? BLUE : bodyC,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: selected ? BLUE : 'transparent',
      }}>
        {selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{label}</Text>
        {sublabel && <Text style={{ fontSize: 12, color: bodyC, marginTop: 2, lineHeight: 17 }}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function HealthFilterScreen({
  colors, isDark, members,
  healthTab,
  draftMed, setDraftMed, draftVax, setDraftVax,
  resetFilters, applyFilters,
  meds, vaxes,
  memberName,
  onClose,
  lockedMemberId,
}: {
  colors: any; isDark: boolean; members: any[];
  healthTab: 'meds' | 'vax';
  draftMed: MedFilters; setDraftMed: React.Dispatch<React.SetStateAction<MedFilters>>;
  draftVax: VaxFilters; setDraftVax: React.Dispatch<React.SetStateAction<VaxFilters>>;
  resetFilters: (tab: 'meds' | 'vax') => void;
  applyFilters: () => void;
  meds: Medication[]; vaxes: Vaccine[];
  memberName: (id: string) => string;
  onClose: () => void;
  // When this screen was reached scoped to one person (person-picker
  // landing page → HealthRecordsScreen's initialMemberId), the "Show
  // records for" member section is redundant — we already know who it is
  // [live-requested: "from the records filters we can keep the in line
  // filter options, and remove the persons from that filter as we already
  // know whose member"]. The other filter sections (category/status/
  // options/due-soon) stay inline exactly as before.
  lockedMemberId?: string;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;

  const recordCount = healthTab === 'meds' ? meds.length : vaxes.length;
  const catColors = useMemo(() => getCatColors(colors), [colors]);

  const toggleMedMember = (id: string) => setDraftMed(d => ({
    ...d, members: d.members.includes(id) ? d.members.filter(x => x !== id) : [...d.members, id],
  }));
  const toggleVaxMember = (id: string) => setDraftVax(d => ({
    ...d, members: d.members.includes(id) ? d.members.filter(x => x !== id) : [...d.members, id],
  }));
  const toggleCategory = (cat: string) => setDraftMed(d => ({
    ...d, categories: d.categories.includes(cat) ? d.categories.filter(x => x !== cat) : [...d.categories, cat],
  }));

  const handleApply = () => { applyFilters(); onClose(); };
  const handleReset = () => resetFilters(healthTab);

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
          Filter health records
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 24, gap: 14 }}>

        {/* Context card */}
        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>
            {healthTab === 'meds' ? 'Medications list' : 'Vaccines list'} · {recordCount} records
          </Text>
          <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
            Changes what you see here — not who can access records.
          </Text>
        </View>

        {/* Show records for — real multi-select member filter, hidden
            when the screen was opened already scoped to one person. */}
        {!lockedMemberId && (
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Show records for</Text>
            {members.map(m => {
              const sel = healthTab === 'meds' ? draftMed.members.includes(m.id) : draftVax.members.includes(m.id);
              return (
                <SelectionRow
                  key={m.id}
                  label={m.name}
                  sublabel={m.role}
                  selected={sel}
                  onPress={() => healthTab === 'meds' ? toggleMedMember(m.id) : toggleVaxMember(m.id)}
                  cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                  tintBg={m.role === 'parent' ? colors.tealLight : m.role === 'senior' ? colors.skyLight : colors.amberLight}
                />
              );
            })}
          </View>
        )}

        {healthTab === 'meds' ? (
          <>
            {/* Category — real full category list from getCatColors */}
            <View style={contentGroupStyle(cardBg, isDark, border)}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Category</Text>
              {Object.keys(catColors).map(cat => (
                <SelectionRow
                  key={cat}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                  selected={draftMed.categories.includes(cat)}
                  onPress={() => toggleCategory(cat)}
                  cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                  tintBg={colors.pinkLight}
                />
              ))}
            </View>

            {/* Status */}
            <View style={contentGroupStyle(cardBg, isDark, border)}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Status</Text>
              {([
                { id: 'active', label: 'Active' },
                { id: 'taken', label: 'Taken today' },
                { id: 'pending', label: 'Pending' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'all', label: 'All' },
              ] as const).map(opt => (
                <SelectionRow
                  key={opt.id}
                  label={opt.label}
                  selected={draftMed.status === opt.id}
                  onPress={() => setDraftMed(d => ({ ...d, status: opt.id }))}
                  cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                  tintBg={colors.primaryLight}
                />
              ))}
            </View>

            {/* Options */}
            <View style={contentGroupStyle(cardBg, isDark, border)}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Options</Text>
              <SelectionRow
                label="Active / ongoing only"
                sublabel="Hide discontinued medications"
                selected={draftMed.ongoing}
                onPress={() => setDraftMed(d => ({ ...d, ongoing: !d.ongoing }))}
                cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                tintBg={colors.primaryLight}
              />
              <SelectionRow
                label="Refill due within 7 days"
                selected={draftMed.refillSoon}
                onPress={() => setDraftMed(d => ({ ...d, refillSoon: !d.refillSoon }))}
                cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                tintBg={colors.amberLight}
              />
              <SelectionRow
                label="Escalation alert enabled"
                sublabel="Only meds with missed-dose alerts"
                selected={draftMed.escalationOnly}
                onPress={() => setDraftMed(d => ({ ...d, escalationOnly: !d.escalationOnly }))}
                cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                tintBg={colors.pinkLight}
              />
            </View>
          </>
        ) : (
          <>
            {/* Vaccine status */}
            <View style={contentGroupStyle(cardBg, isDark, border)}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Status</Text>
              {([
                { id: 'pending', label: 'Pending' },
                { id: 'done', label: 'Done' },
                { id: 'due_soon', label: 'Due soon' },
                { id: 'all', label: 'All' },
              ] as const).map(opt => (
                <SelectionRow
                  key={opt.id}
                  label={opt.label}
                  selected={draftVax.status === opt.id}
                  onPress={() => setDraftVax(d => ({ ...d, status: opt.id }))}
                  cardBg={cardBg} border={border} titleC={titleC} bodyC={bodyC}
                  tintBg={colors.tealLight}
                />
              ))}
            </View>

            {draftVax.status === 'due_soon' && (
              <View style={contentGroupStyle(cardBg, isDark, border)}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Due within</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[7, 14, 30, 60, 90].map(d => {
                    const sel = draftVax.dueSoonDays === d;
                    return (
                      <TouchableOpacity key={d} onPress={() => setDraftVax(v => ({ ...v, dueSoonDays: d }))}
                        style={{
                          borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
                          backgroundColor: sel ? colors.teal : cardBg,
                          borderWidth: 1, borderColor: sel ? colors.teal : border,
                        }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#FFFFFF' : bodyC }}>{d} days</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}

        {/* Actions */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <TouchableOpacity onPress={handleApply}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Apply filters</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleReset}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: cardBg, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>Reset filters</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
