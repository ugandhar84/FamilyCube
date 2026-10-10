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
import { View, Text } from 'react-native';
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

/** Horizontal line joining a couple's two cards, with the vertical drop
 * to their children continuing from the joint's midpoint. */
function CoupleJoint({ colors, isDark, hasChildren }: { colors: any; isDark: boolean; hasChildren: boolean }) {
  const stroke = lineColor(isDark, colors);
  return (
    <View style={{ height: 24, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }} />
      <View style={{ width: 24, alignItems: 'center' }}>
        <View style={{ position: 'absolute', left: -24, right: -24, top: 11, height: 2, backgroundColor: stroke }} />
        {hasChildren && <View style={{ width: 2, height: 24, backgroundColor: stroke, position: 'absolute', top: 11 }} />}
      </View>
      <View style={{ flex: 1 }} />
    </View>
  );
}

/** Bracket spanning N children — a vertical drop from the parent joint,
 * a horizontal bar spanning the full row of children, then a vertical
 * drop into each child's card. Children render in a row below this. */
function ChildrenBracket({ count, colors, isDark }: { count: number; colors: any; isDark: boolean }) {
  const stroke = lineColor(isDark, colors);
  if (count <= 1) {
    return <View style={{ alignItems: 'center' }}><View style={{ width: 2, height: 20, backgroundColor: stroke }} /></View>;
  }
  return (
    <View style={{ height: 20 }}>
      <View style={{ position: 'absolute', left: `${50 / count}%`, right: `${50 / count}%`, top: 0, height: 2, backgroundColor: stroke }} />
      {Array.from({ length: count }).map((_, i) => {
        const centerPct = (100 / count) * (i + 0.5);
        return <View key={i} style={{ position: 'absolute', left: `${centerPct}%`, marginLeft: -1, top: 0, width: 2, height: 20, backgroundColor: stroke }} />;
      })}
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
    <View style={{ gap: 4 }}>
      {grandparents.length > 0 && (
        <View>
          <GenLabel label={`Grandparents (${grandparents.length})`} colors={colors} isDark={isDark} />
          <View style={{ gap: 14 }}>
            {grandparents.map(gp => renderCard(gp))}
          </View>
        </View>
      )}

      {grandparents.length > 0 && parents.length > 0 && (
        <VerticalLink label={activeFirstName ? `Parent of ${activeFirstName}` : undefined} colors={colors} isDark={isDark} />
      )}

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
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: kids.length > 2 ? 'wrap' : 'nowrap' }}>
              {kids.map(k => (
                <View key={k.id} style={{ width: kids.length > 2 ? '47%' : undefined, flex: kids.length > 2 ? undefined : 1 }}>
                  {renderCard(k)}
                </View>
              ))}
            </View>
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
