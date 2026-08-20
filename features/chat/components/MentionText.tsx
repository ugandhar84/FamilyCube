import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { COLLAPSE_LINES } from './constants';

// ─── Mention text renderer ────────────────────────────────────────────────────

export function highlightSearch(raw: string, query: string, baseStyle: any): React.ReactNode {
  if (!query.trim()) return <Text style={baseStyle}>{raw}</Text>;
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx: number;
  const lo = raw.toLowerCase();
  while ((idx = lo.indexOf(q, cursor)) !== -1) {
    if (idx > cursor) parts.push(<Text key={cursor}>{raw.slice(cursor, idx)}</Text>);
    // colors isn't threaded into this pure-text utility — use the brand
    // amber/navy hex directly rather than plumbing a theme param through
    // every call site for a two-color search highlight.
    parts.push(<Text key={idx} style={{ backgroundColor: '#F5A623', color: '#1E2D6B', fontWeight: '700' }}>{raw.slice(idx, idx + q.length)}</Text>);
    cursor = idx + q.length;
  }
  if (cursor < raw.length) parts.push(<Text key={cursor}>{raw.slice(cursor)}</Text>);
  return <Text style={baseStyle}>{parts}</Text>;
}

/** Strip markdown bold/italic asterisks and render @mentions inline. */
export function MentionText({ text, memberMap, myId, searchQuery, textStyle, numberOfLines, onTextLayout }: {
  text: string; memberMap: Record<string, any>; myId: string; searchQuery?: string; textStyle: any;
  numberOfLines?: number; onTextLayout?: (e: any) => void;
}) {
  // Split on mention tokens first, then strip * from plain segments
  const parts = text.split(/(@\[[^\]]+\|[^\]]+\])/g);
  return (
    <Text style={textStyle} numberOfLines={numberOfLines} onTextLayout={onTextLayout}>
      {parts.map((part, i) => {
        const m = part.match(/^@\[([^\]]+)\|([^\]]+)\]$/);
        if (m) {
          const [, , id] = m;
          const member = memberMap[id];
          const isMe   = id === myId;
          return (
            <Text key={i} style={{ fontWeight: '800', color: isMe ? '#fbbf24' : '#a78bfa' }}>
              @{member?.name?.split(' ')[0] ?? 'unknown'}
            </Text>
          );
        }
        // Render *bold* and _italic_ inline spans
        const segments: React.ReactNode[] = [];
        let remaining = part;
        let si = 0;
        const boldRe = /\*+([^*\n]+)\*+/g;
        let bm: RegExpExecArray | null;
        let lastIndex = 0;
        boldRe.lastIndex = 0;
        while ((bm = boldRe.exec(remaining)) !== null) {
          if (bm.index > lastIndex) segments.push(<Text key={`${i}-${si++}`}>{remaining.slice(lastIndex, bm.index)}</Text>);
          segments.push(<Text key={`${i}-${si++}`} style={{ fontWeight: '800' }}>{bm[1]}</Text>);
          lastIndex = bm.index + bm[0].length;
        }
        if (lastIndex < remaining.length) segments.push(<Text key={`${i}-${si++}`}>{remaining.slice(lastIndex)}</Text>);
        return <Text key={i}>{segments}</Text>;
      })}
    </Text>
  );
}

// ─── Collapsible text (10-line cap with Show more / Show less) ───────────────

export function CollapsibleText({ text, memberMap, myId, searchQuery, isMe, bubbleMeTxt, bubbleOtherTxt }: {
  text: string; memberMap: Record<string, any>; myId: string; searchQuery?: string;
  isMe: boolean; bubbleMeTxt: string; bubbleOtherTxt: string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const txtColor = isMe ? bubbleMeTxt : bubbleOtherTxt;
  const txtStyle = { fontSize: 15, lineHeight: 22, letterSpacing: 0.1, fontWeight: '400' as const, color: txtColor };

  return (
    <View>
      <MentionText
        text={text}
        memberMap={memberMap}
        myId={myId}
        searchQuery={searchQuery}
        textStyle={txtStyle}
        numberOfLines={needsCollapse && collapsed ? COLLAPSE_LINES : undefined}
        onTextLayout={(e: any) => {
          if (!needsCollapse && e.nativeEvent.lines.length > COLLAPSE_LINES) setNeedsCollapse(true);
        }}
      />
      {needsCollapse && (
        <Pressable onPress={() => setCollapsed(v => !v)} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 4,
            color: isMe ? 'rgba(255,255,255,0.75)' : '#9261C7' }}>
            {collapsed ? 'Show more ▾' : 'Show less ▴'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
