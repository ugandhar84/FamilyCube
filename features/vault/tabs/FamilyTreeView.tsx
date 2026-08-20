/**
 * FamilyTreeView — card-grid family visualization, grouped by generation:
 * Grandparents split into Paternal/Maternal columns (via each GP's
 * linked_parent_id — whichever parent they're linked to determines their
 * side; unlinked GPs get their own column so they're never dropped),
 * Parents shown side by side, Kids/Teens in a 3-across grid. Replaces the
 * old connector-line diagram with plain cards — clearer at this scale and
 * far less brittle than hand-computed x/y connector math.
 */
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart } from 'lucide-react-native';
import { MemberCard } from './MemberCard';
import type { FamilyMember } from '@/store/familyStore';

function GenGroup({ label, colors, children }: { label: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// Small vertical gradient bar between generation groups — a lighter echo
// of the mock's connector-line dividers, without resurrecting the old
// hand-computed x/y coordinate math to draw exact node-to-node lines.
// `align` positions it under whichever column actually has content on both
// sides of the seam (e.g. Mary → Priya, both in the right column) instead
// of always sitting dead-center regardless of where the cards really are.
function GenDivider({ from, to, align = 'center' }: { from: string; to: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', paddingHorizontal: '25%' }}>
      <LinearGradient colors={[from, to]} style={{ width: 2, height: 16, borderRadius: 1 }} />
    </View>
  );
}

export function FamilyTreeView({ members, activeMemberId, isParent, colors, isDark, onView, onEdit, onPin }: {
  members: FamilyMember[]; activeMemberId: string | null | undefined; isParent: boolean;
  colors: any; isDark: boolean;
  onView: (m: FamilyMember) => void; onEdit: (m: FamilyMember) => void; onPin: (m: FamilyMember) => void;
}) {
  const grandparents = members.filter(m => m.role === 'senior');
  const parents       = members.filter(m => m.role === 'parent');
  const kids           = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const allNames = members.map(m => m.name);

  // Side = whichever parent this GP is linked to — a GP linked to Priya's
  // id lands under Priya's column specifically, never "between" both
  // parents. "Maternal"/"Paternal" is derived from THAT linked parent's own
  // relationship (Mother → Maternal, Father → Paternal), not from array
  // position, so it stays correct regardless of which parent comes first.
  const sideForGp = (gp: FamilyMember): 'a' | 'b' | 'unlinked' => {
    if (!gp.linkedParentId) return 'unlinked';
    if (gp.linkedParentId === parents[0]?.id) return 'a';
    if (gp.linkedParentId === parents[1]?.id) return 'b';
    return 'unlinked';
  };
  const sideLabel = (p?: FamilyMember): string | undefined =>
    p?.relationship === 'Mother' ? 'Maternal' : p?.relationship === 'Father' ? 'Paternal' : undefined;
  const gpSideA = grandparents.filter(gp => sideForGp(gp) === 'a');
  const gpSideB = grandparents.filter(gp => sideForGp(gp) === 'b');
  const gpUnlinked = grandparents.filter(gp => sideForGp(gp) === 'unlinked');

  const renderCard = (m: FamilyMember, sidePrefix?: string) => (
    <MemberCard key={m.id} m={m} isActive={m.id === activeMemberId} isParentViewer={isParent}
      colors={colors} isDark={isDark} siblings={allNames} sidePrefix={sidePrefix}
      onPress={() => onView(m)}
      onLongPress={() => { if (isParent) onEdit(m); }}
      onPinPress={() => onPin(m)} />
  );

  return (
    <View style={{ gap: 16 }}>
      {grandparents.length > 0 && (
        <GenGroup label={`Grandparents (${grandparents.length})`} colors={colors}>
          {/* Two columns, spatially aligned under the matching parent card
              below — a GP linked to the left parent renders in the left
              column, right parent's GPs render in the right column. The
              alignment itself shows the link, no box/label needed. */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              {gpSideA.map(gp => renderCard(gp, sideLabel(parents[0])))}
            </View>
            <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              {gpSideB.map(gp => renderCard(gp, sideLabel(parents[1])))}
            </View>
          </View>
          {gpUnlinked.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {gpUnlinked.map(gp => renderCard(gp))}
            </View>
          )}
        </GenGroup>
      )}

      {grandparents.length > 0 && parents.length > 0 && (
        <GenDivider from={colors.amber} to={colors.parent}
          align={gpSideA.length > 0 && gpSideB.length === 0 ? 'left' : gpSideB.length > 0 && gpSideA.length === 0 ? 'right' : 'center'} />
      )}

      {parents.length > 0 && (
        <GenGroup label={`Parents (${parents.length})`} colors={colors}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, position: 'relative' }}>
            {/* Same flex:1-column structure as the grandparent row above,
                so each parent lands directly under their own linked GPs. */}
            <View style={{ flex: 1, alignItems: 'center' }}>{parents[0] && renderCard(parents[0])}</View>
            {parents[1] && <View style={{ flex: 1, alignItems: 'center' }}>{renderCard(parents[1])}</View>}
            {/* Heart badge — overlaps Priya's (second parent's) card left
                edge specifically, reading as "attached to Priya" rather
                than a neutral marker floating between both cards. Fixed
                rose/pink-red (no true rose token in this palette —
                everything maps to the lavender/terracotta brand system). */}
            {parents.length === 2 && (
              <View style={{
                position: 'absolute', left: '50%', top: '50%',
                width: 24, height: 24, borderRadius: 12, marginLeft: -10, marginTop: -12,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#F43F5E', borderWidth: 2, borderColor: colors.card,
                zIndex: 1,
              }}>
                <Heart size={12} color="#fff" fill="#fff" />
              </View>
            )}
          </View>
        </GenGroup>
      )}

      {parents.length > 0 && kids.length > 0 && (
        <GenDivider from={colors.pink} to={colors.success} />
      )}

      {kids.length > 0 && (
        <GenGroup label={`Kids (${kids.length})`} colors={colors}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: kids.length > 3 ? 'wrap' : 'nowrap' }}>
            {kids.map(k => (
              <View key={k.id} style={{ width: kids.length > 3 ? '31%' : undefined, flex: kids.length > 3 ? undefined : 1 }}>
                {renderCard(k)}
              </View>
            ))}
          </View>
        </GenGroup>
      )}
    </View>
  );
}
