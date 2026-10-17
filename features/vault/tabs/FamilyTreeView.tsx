/**
 * FamilyTreeView — connector-line family tree diagram, matching the
 * provided mockup 1:1: one card per row (not a side-by-side grid),
 * full-width rounded cards with a top avatar photo, vertical lines
 * connecting single generations ("Parent of Maya" labeled), and a
 * couple's two cards joined by a short horizontal line that drops into
 * a bracket spanning their children below.
 *
 * Previously this was a side-by-side card-grid (grouped by generation,
 * 2-3 cards per row) specifically BECAUSE the earlier connector-line
 * version (TreeConnectors.tsx/GenerationBridge.tsx, both still in this
 * directory but unused until now) needed brittle hand-computed x/y
 * connector math for a multi-column grid. Rebuilt here as a true
 * connector diagram per explicit request with a reference mockup — but
 * single-column (one card per row, full width) instead of the old
 * multi-column grid, so the connector geometry stays simple: every
 * card's horizontal center is the same fixed x (half the content
 * width), so a connector is just a vertical line at that x, or for a
 * couple, two cards side by side joined by one short horizontal line
 * with the vertical drop continuing from its midpoint.
 */
import { memo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MemberTreeCard } from './MemberCard';
import type { FamilyMember } from '@/store/familyStore';

const LINE_LIGHT = '#CBC3B8';
const LINE_DARK  = '#3A362E';

function lineColor(isDark: boolean, colors: any) {
  return isDark ? (colors.border ?? LINE_DARK) : LINE_LIGHT;
}

function GenLabel({ label, colors, isDark }: { label: string; colors: any; isDark: boolean }) {
  return (
    <Text style={{
      fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase',
      color: isDark ? colors.textTertiary : '#8A8172', marginBottom: 10,
    }}>
      {label}
    </Text>
  );
}

/** Single vertical line, with an optional centered label (e.g. "Parent of Maya"). */
function VerticalLink({ label, colors, isDark }: { label?: string; colors: any; isDark: boolean }) {
  const stroke = lineColor(isDark, colors);
  return (
    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ width: 2, height: label ? 20 : 28, backgroundColor: stroke }} />
      {label && (
        <Text style={{ fontSize: 13, color: isDark ? colors.textSecondary : '#5C5648', marginVertical: 4 }}>
          {label}
        </Text>
      )}
      <View style={{ width: 2, height: label ? 20 : 0, backgroundColor: stroke }} />
    </View>
  );
}

/** Under a couple (two cards side by side, centres at 25% and 75%): a drop from each card, a bar joining them, and one
 * line from the bar's midpoint down to the children. */
function CoupleJoint({ colors, isDark, hasChildren }: { colors: any; isDark: boolean; hasChildren: boolean }) {
  const stroke = lineColor(isDark, colors);
  const H = 32, BAR = 14;
  return (
    <View style={{ height: H }}>
      <View style={{ position: 'absolute', left: '25%', marginLeft: -1, top: 0, width: 2, height: BAR + 2, backgroundColor: stroke }} />
      <View style={{ position: 'absolute', left: '75%', marginLeft: -1, top: 0, width: 2, height: BAR + 2, backgroundColor: stroke }} />
      <View style={{ position: 'absolute', left: '25%', right: '25%', top: BAR, height: 2, backgroundColor: stroke }} />
      {hasChildren && <View style={{ position: 'absolute', left: '50%', marginLeft: -1, top: BAR, width: 2, height: H - BAR, backgroundColor: stroke }} />}
    </View>
  );
}

/** One line from each grandparent column (centres at 25% / 75%) down onto the parent it belongs to. */
function GrandparentLinks({ has, colors, isDark }: { has: [boolean, boolean]; colors: any; isDark: boolean }) {
  const stroke = lineColor(isDark, colors);
  return (
    <View style={{ height: 32 }}>
      {has.map((on, i) => on ? (
        <View key={i} style={{ position: 'absolute', left: i === 0 ? '25%' : '75%', marginLeft: -1, top: 0, bottom: 0, width: 2, backgroundColor: stroke }} />
      ) : null)}
    </View>
  );
}

/** Children: with two, a bar and a drop onto each card centre; otherwise one line drops into the row. */
function ChildrenBracket({ count, colors, isDark }: { count: number; colors: any; isDark: boolean }) {
  const stroke = lineColor(isDark, colors);
  if (count !== 2) {
    return <View style={{ alignItems: 'center' }}><View style={{ width: 2, height: 20, backgroundColor: stroke }} /></View>;
  }
  return (
    <View style={{ height: 20 }}>
      <View style={{ position: 'absolute', left: '25%', right: '25%', top: 0, height: 2, backgroundColor: stroke }} />
      {[25, 75].map(pct => <View key={pct} style={{ position: 'absolute', left: `${pct}%`, marginLeft: -1, top: 0, width: 2, height: 20, backgroundColor: stroke }} />)}
    </View>
  );
}

function FamilyTreeViewImpl({ members, activeMemberId, isParent, colors, isDark, onView, onEdit, onPin }: {
  members: FamilyMember[]; activeMemberId: string | null | undefined; isParent: boolean;
  colors: any; isDark: boolean;
  onView: (m: FamilyMember) => void; onEdit: (m: FamilyMember) => void; onPin: (m: FamilyMember) => void;
}) {
  const grandparents = members.filter(m => m.role === 'senior');
  const parents       = members.filter(m => m.role === 'parent');
  const kids           = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const allNames = members.map(m => m.name);
  const activeMember = members.find(m => m.id === activeMemberId);

  const renderCard = (m: FamilyMember, subtitleOverride?: string) => (
    <MemberTreeCard key={m.id} m={m} isActive={m.id === activeMemberId} isParentViewer={isParent}
      colors={colors} isDark={isDark} siblings={allNames} subtitleOverride={subtitleOverride}
      onPress={() => onView(m)}
      onLongPress={() => { if (isParent) onEdit(m); }}
      onPinPress={() => onPin(m)} />
  );

  // "Parent of <active member's first name>" — matches the mockup's
  // "Parent of Maya" connector label. Falls back to no label if there's
  // no active member to anchor the phrase to (kiosk/no-session context).
  const activeFirstName = activeMember?.name.split(' ')[0];

  return (
    <View>
      {grandparents.length > 0 && (() => {
        // Maternal and paternal sides sit next to each other; inside each side the grandparents stack vertically.
        const sideA = grandparents.filter(g => (g as any).linkedParentId && (g as any).linkedParentId === parents[0]?.id);
        const sideB = grandparents.filter(g => (g as any).linkedParentId && (g as any).linkedParentId === parents[1]?.id);
        grandparents.filter(g => !sideA.includes(g) && !sideB.includes(g)).forEach(g => (sideA.length <= sideB.length ? sideA : sideB).push(g));
        const couple = parents.length === 2;
        const cols = couple ? [sideA, sideB] : [grandparents];
        return (
          <View>
            <GenLabel label={`Grandparents (${grandparents.length})`} colors={colors} isDark={isDark} />
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              {cols.map((list, i) => (
                <View key={i} style={{ flex: 1, gap: 10 }}>
                  {couple && list.length > 0 && (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textSecondary : '#5C5648' }}>{parents[i].name.split(' ')[0]}’s side</Text>
                  )}
                  {list.map(gp => renderCard(gp))}
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {grandparents.length > 0 && parents.length > 0 && (() => {
        if (parents.length !== 2) return <VerticalLink label={activeFirstName ? `Parent of ${activeFirstName}` : undefined} colors={colors} isDark={isDark} />;
        const linked = (i: number) => grandparents.filter(g => (g as any).linkedParentId === parents[i].id).length;
        let ca = linked(0), cb = linked(1);
        const loose = grandparents.length - ca - cb;
        for (let i = 0; i < loose; i++) { if (ca <= cb) ca++; else cb++; }
        return <GrandparentLinks has={[ca > 0, cb > 0]} colors={colors} isDark={isDark} />;
      })()}

      {parents.length > 0 && (
        <View>
          <GenLabel label={`Parents · Partners (${parents.length})`} colors={colors} isDark={isDark} />
          {parents.length === 2 ? (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>{renderCard(parents[0])}</View>
                <View style={{ flex: 1 }}>{renderCard(parents[1])}</View>
              </View>
              <CoupleJoint colors={colors} isDark={isDark} hasChildren={kids.length > 0} />
            </>
          ) : (
            <View style={{ gap: 14 }}>
              {parents.map(p => renderCard(p))}
            </View>
          )}
        </View>
      )}

      {parents.length > 0 && kids.length > 0 && (
        <>
          {parents.length !== 2 && <VerticalLink colors={colors} isDark={isDark} />}
          <View>
            <GenLabel label="Their Children" colors={colors} isDark={isDark} />
            {parents.length === 2 && <ChildrenBracket count={kids.length} colors={colors} isDark={isDark} />}
            {kids.length <= 2 ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {kids.map(k => <View key={k.id} style={{ flex: 1 }}>{renderCard(k)}</View>)}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 24 }} style={{ marginHorizontal: -24 }}>
                {kids.map(k => <View key={k.id} style={{ width: 168 }}>{renderCard(k)}</View>)}
              </ScrollView>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// Memoized with the default shallow prop comparator — onView/onEdit/onPin
// are stable setState setters at every real call site (RosterTab.tsx/
// ProfileSettingsScreen.tsx both pass setViewTarget/setEditTarget/
// setPinTarget directly, not a wrapping inline arrow), so shallow equality
// on props is sufficient here (unlike MemberCard/CarouselMemberCard, which
// needed a custom comparator because THEIR callers — this component's own
// renderCard — wrap those same setters in a fresh inline arrow per card).
export const FamilyTreeView = memo(FamilyTreeViewImpl);
