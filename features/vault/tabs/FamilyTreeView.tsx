/**
 * FamilyTreeView — generational tree layout for the roster, modeled on a
 * standard family-tree diagram: each couple joined by a short horizontal
 * line, a vertical drop from their midpoint to a bar spanning their
 * children, then a vertical drop into each child. Three rows: grandparents
 * (grouped/paired under whichever parent they're linked to, via
 * members.linked_parent_id), parents (joined as a couple if there are
 * exactly two), and kids (shared by both parents — never split by lineage).
 *
 * Positions are computed once as plain x-coordinates (not flexbox guesses)
 * so the connector lines in TreeConnectors line up exactly under the nodes
 * they connect, the same way the reference diagram does.
 */
import { View, Text, ScrollView } from 'react-native';
import { TreeNode, NODE_W, NODE_GAP } from './TreeNode';
import { CoupleLine, GenerationLinks, GENERATION_GAP, lineColor } from './TreeConnectors';
import type { FamilyMember } from '@/store/familyStore';

const COUPLE_GAP = 40; // horizontal gap between two people in a couple / between family clusters
// Actual node content (56px avatar + 2 margin + ~14 name line + 2 margin +
// ~12 icon row) runs to about 86px — 88 gives it a couple px of real
// breathing room instead of the near-zero clearance that let the
// GENERATION_GAP connector visually overlap the avatar below/above it.
const NODE_ROW_HEIGHT = 88;

interface Placed { m: FamilyMember; x: number }

// Lays out a list of members left-to-right starting at `startX`, returning
// their center-x positions and the total width consumed.
function layoutRow(members: FamilyMember[], startX: number, gap = NODE_GAP): { placed: Placed[]; width: number } {
  const placed: Placed[] = [];
  let x = startX;
  members.forEach((m, i) => {
    placed.push({ m, x: x + NODE_W / 2 });
    x += NODE_W + gap;
  });
  return { placed, width: members.length > 0 ? x - gap - startX : 0 };
}

export function FamilyTreeView({ members, activeMemberId, isParent, colors, isDark, onEdit, onPin }: {
  members: FamilyMember[]; activeMemberId: string | null | undefined; isParent: boolean;
  colors: any; isDark: boolean;
  onEdit: (m: FamilyMember) => void; onPin: (m: FamilyMember) => void;
}) {
  const grandparents = members.filter(m => m.role === 'senior');
  const parents       = members.filter(m => m.role === 'parent');
  const kids           = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const line = lineColor(isDark, colors);

  // Grandparents grouped under their linked parent — unlinked GPs form
  // their own cluster at the far left so they never silently disappear.
  const gpByParent = new Map<string, FamilyMember[]>();
  const unlinkedGps: FamilyMember[] = [];
  for (const gp of grandparents) {
    if (gp.linkedParentId && parents.some(p => p.id === gp.linkedParentId)) {
      const list = gpByParent.get(gp.linkedParentId) ?? [];
      list.push(gp);
      gpByParent.set(gp.linkedParentId, list);
    } else {
      unlinkedGps.push(gp);
    }
  }

  // ── Compute parent row positions first (everything else anchors to it) ──
  const parentsLayout = layoutRow(parents, 0, COUPLE_GAP);
  const parentPositions = new Map(parentsLayout.placed.map(p => [p.m.id, p.x]));

  // ── Grandparent clusters, one per parent, centered above that parent ──
  const gpClusters: { parentId: string; placed: Placed[]; clusterCenterX: number }[] = [];
  for (const p of parents) {
    const gps = gpByParent.get(p.id) ?? [];
    if (gps.length === 0) continue;
    const { placed, width } = layoutRow(gps, 0);
    const parentX = parentPositions.get(p.id) ?? 0;
    const clusterCenterX = width / 2;
    // Shift this cluster so it's centered exactly above its parent's x.
    const shift = parentX - clusterCenterX;
    const shiftedPlaced = placed.map(pl => ({ ...pl, x: pl.x + shift }));
    gpClusters.push({ parentId: p.id, placed: shiftedPlaced, clusterCenterX: parentX });
  }
  // Unlinked GPs get their own cluster to the left of everything, so they
  // never overlap a linked cluster.
  let unlinkedPlaced: Placed[] = [];
  if (unlinkedGps.length > 0) {
    const minParentX = parentsLayout.placed[0]?.x ?? 0;
    const leftEdge = Math.min(0, minParentX) - (unlinkedGps.length * (NODE_W + NODE_GAP)) - COUPLE_GAP;
    const { placed } = layoutRow(unlinkedGps, leftEdge);
    unlinkedPlaced = placed;
  }

  // ── Kid row, centered under the parents as a whole ──
  const kidsLayoutRaw = layoutRow(kids, 0);
  const parentsSpanCenter = parents.length > 0
    ? ((parentsLayout.placed[0]?.x ?? 0) + (parentsLayout.placed[parentsLayout.placed.length - 1]?.x ?? 0)) / 2
    : 0;
  const kidsCenter = kidsLayoutRaw.width / 2;
  const kidsShift = parentsSpanCenter - kidsCenter;
  const kidsPlaced = kidsLayoutRaw.placed.map(pl => ({ ...pl, x: pl.x + kidsShift }));

  // ── Overall bounds, so we can offset everything into positive space ──
  const allX = [
    ...parentsLayout.placed.map(p => p.x),
    ...gpClusters.flatMap(c => c.placed.map(p => p.x)),
    ...unlinkedPlaced.map(p => p.x),
    ...kidsPlaced.map(p => p.x),
  ];
  const minX = allX.length ? Math.min(...allX) - NODE_W / 2 - 10 : 0;
  const maxX = allX.length ? Math.max(...allX) + NODE_W / 2 + 10 : 300;
  const totalWidth = maxX - minX;
  const offset = (x: number) => x - minX;

  const renderNode = (m: FamilyMember) => (
    <TreeNode key={m.id} m={m} isActive={m.id === activeMemberId} isParentViewer={isParent}
      colors={colors} isDark={isDark}
      onLongPress={() => { if (isParent) onEdit(m); }}
      onPinPress={() => onPin(m)} />
  );

  const hasGrandparentRow = grandparents.length > 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 4 }}>
      <View style={{ width: totalWidth }}>

        {hasGrandparentRow && (
          <>
            {/* Grandparent row */}
            <View style={{ height: NODE_ROW_HEIGHT }}>
              {gpClusters.flatMap(c => c.placed).concat(unlinkedPlaced).map(({ m, x }) => (
                <View key={m.id} style={{ position: 'absolute', left: offset(x) - NODE_W / 2, top: 0, width: NODE_W }}>
                  {renderNode(m)}
                </View>
              ))}
              {unlinkedGps.length > 0 && unlinkedPlaced.length > 0 && (
                <Text style={{
                  position: 'absolute', top: 78,
                  left: offset((unlinkedPlaced[0].x + unlinkedPlaced[unlinkedPlaced.length - 1].x) / 2) - 40, width: 80,
                  fontSize: 8, color: colors.textTertiary, textAlign: 'center', fontStyle: 'italic',
                }}>unlinked</Text>
              )}
              {/* Couple line for GP pairs within each cluster (2 GPs -> 1 parent) */}
              {gpClusters.filter(c => c.placed.length === 2).map(c => (
                <CoupleLine key={c.parentId} x1={offset(c.placed[0].x)} x2={offset(c.placed[1].x)} y={28} color={line} />
              ))}
            </View>
            {/* Bridge: each GP cluster's center down to its parent */}
            <View style={{ height: GENERATION_GAP }}>
              {gpClusters.map(c => {
                const clusterX = c.placed.length === 2
                  ? (c.placed[0].x + c.placed[1].x) / 2
                  : c.placed[0]?.x ?? c.clusterCenterX;
                const parentX = parentPositions.get(c.parentId) ?? clusterX;
                const segMinX = Math.min(offset(clusterX), offset(parentX));
                return (
                  <View key={c.parentId} style={{ position: 'absolute', left: segMinX, top: 0 }}>
                    <GenerationLinks fromX={offset(clusterX) - segMinX} toXs={[offset(parentX) - segMinX]} color={line} />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Parent row */}
        <View style={{ height: NODE_ROW_HEIGHT }}>
          {parentsLayout.placed.map(({ m, x }) => (
            <View key={m.id} style={{ position: 'absolute', left: offset(x) - NODE_W / 2, top: 0, width: NODE_W }}>
              {renderNode(m)}
            </View>
          ))}
          {parents.length === 2 && (
            <CoupleLine x1={offset(parentsLayout.placed[0].x)} x2={offset(parentsLayout.placed[1].x)} y={28} color={line} />
          )}
        </View>

        {/* Bridge: parents (as a couple midpoint) down to the kid row */}
        {kids.length > 0 && parents.length > 0 && (() => {
          const fromX = offset(parentsSpanCenter);
          const toXs = kidsPlaced.map(p => offset(p.x));
          const segMinX = Math.min(fromX, ...toXs);
          return (
            <View style={{ height: GENERATION_GAP }}>
              <View style={{ position: 'absolute', left: segMinX, top: 0 }}>
                <GenerationLinks fromX={fromX - segMinX} toXs={toXs.map(x => x - segMinX)} color={line} />
              </View>
            </View>
          );
        })()}

        {/* Kid/teen row */}
        {kids.length > 0 && (
          <View style={{ height: NODE_ROW_HEIGHT }}>
            {kidsPlaced.map(({ m, x }) => (
              <View key={m.id} style={{ position: 'absolute', left: offset(x) - NODE_W / 2, top: 0, width: NODE_W }}>
                {renderNode(m)}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
