/**
 * AskCubeMessageText — lightweight markdown-ish renderer for Ask Cube's
 * assistant replies. The model reliably emits **bold** spans and "- " bullet
 * lines (told to write plain conversational text, but still leans on these
 * for structure), so this renders line-by-line: bullet lines become a real
 * row with a dot marker instead of a literal dash, blank lines become
 * paragraph gaps, and within every line, urgency words are colored at the
 * WORD level only — never bleeding color across an entire bold span or
 * sentence just because one word inside it matched.
 */
import { View, Text } from 'react-native';
import { TYPO } from '@/constants/theme';

const URGENT_WORDS = /\b(?:overdue|today|due now|asap)\b/i;
const SOON_WORDS = /\b(?:tomorrow|due soon|this weekend|tonight)\b/i;

export interface AskCubeChoreRefLike { id: string; title: string }

type Token = { text: string; bold: boolean; choreId?: string };

function tokenizeBold(text: string): Token[] {
  const parts: Token[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

// Splits each bold/plain token further wherever a known chore title occurs
// verbatim, tagging that piece with the chore's id so renderLine can make it
// tappable. Longest title first, so one chore's title being a substring of
// another's ("Clean Bathroom" vs "Clean Bathroom Upstairs") never steals a
// shorter match out from under the longer, more specific one.
function splitOnChoreTitles(tokens: Token[], chores: AskCubeChoreRefLike[]): Token[] {
  if (!chores.length) return tokens;
  const sorted = [...chores].sort((a, b) => b.title.length - a.title.length);
  let result = tokens;
  for (const chore of sorted) {
    if (!chore.title.trim()) continue;
    const next: Token[] = [];
    for (const tok of result) {
      if (tok.choreId || !tok.text.includes(chore.title)) { next.push(tok); continue; }
      const segments = tok.text.split(chore.title);
      segments.forEach((seg, i) => {
        if (seg) next.push({ text: seg, bold: tok.bold });
        if (i < segments.length - 1) next.push({ text: chore.title, bold: tok.bold, choreId: chore.id });
      });
    }
    result = next;
  }
  return result;
}

// Splits a token's text into word-ish chunks (keeping whitespace attached)
// so urgency coloring applies only to the matching word, never the whole
// surrounding sentence or bold span.
function renderWithUrgency(text: string, bold: boolean, keyPrefix: string, color: string, urgentColor: string, soonColor: string) {
  const combined = new RegExp(`(${URGENT_WORDS.source}|${SOON_WORDS.source})`, 'gi');
  // Exactly one capturing group here (the outer parens above) — URGENT_WORDS
  // and SOON_WORDS themselves must stay non-capturing (?:...) or split()
  // would also emit each inner group as its own array element, duplicating
  // the matched word in the output (the "todaytoday" bug).
  const pieces = text.split(combined).filter(p => p !== undefined && p !== '');
  return pieces.map((piece, i) => {
    const isUrgent = URGENT_WORDS.test(piece) && piece.length < 15;
    const isSoon = !isUrgent && SOON_WORDS.test(piece) && piece.length < 15;
    const c = isUrgent ? urgentColor : isSoon ? soonColor : color;
    return (
      <Text key={`${keyPrefix}-${i}`} style={{ fontWeight: bold ? '800' : '400', color: c }}>
        {piece}
      </Text>
    );
  });
}

function renderLine(
  line: string, lineKey: string, color: string, urgentColor: string, soonColor: string,
  chores: AskCubeChoreRefLike[], linkColor: string, onChorePress?: (choreId: string) => void,
) {
  const bulletMatch = /^\s*[-•]\s+(.*)$/.exec(line);
  const body = bulletMatch ? bulletMatch[1] : line;
  const tokens = splitOnChoreTitles(tokenizeBold(body), chores);
  const inline = tokens.map((t, i) => t.choreId
    ? (
      <Text
        key={`${lineKey}-${i}`}
        onPress={onChorePress ? () => onChorePress(t.choreId!) : undefined}
        style={{ fontWeight: t.bold ? '800' : '700', color: linkColor, textDecorationLine: 'underline' }}>
        {t.text}
      </Text>
    )
    : renderWithUrgency(t.text, t.bold, `${lineKey}-${i}`, color, urgentColor, soonColor));

  // A line that's entirely one bold "**Label:**" token reads as a section
  // header, not running text — give it a touch more top space and slightly
  // larger type so "Schedule:"/"Chores:" visually separate their sections.
  const isHeaderLine = !bulletMatch && tokens.length === 1 && tokens[0].bold;

  if (bulletMatch) {
    return (
      <View key={lineKey} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Text style={{ fontSize: TYPO.body, color, lineHeight: 22 }}>•</Text>
        <Text style={{ flex: 1, fontSize: TYPO.body, lineHeight: 22 }}>{inline}</Text>
      </View>
    );
  }
  if (isHeaderLine) {
    return (
      <Text key={lineKey} style={{ fontSize: TYPO.body, lineHeight: 22, marginTop: 6, letterSpacing: 0.2 }}>{inline}</Text>
    );
  }
  return (
    <Text key={lineKey} style={{ fontSize: TYPO.body, lineHeight: 22 }}>{inline}</Text>
  );
}

export default function AskCubeMessageText({ content, color, urgentColor, soonColor, chores, linkColor, onChorePress }: {
  content: string; color: string; urgentColor: string; soonColor: string;
  // Chores this reply mentions by title — each occurrence in the text
  // becomes a tap-through link to that chore. Omit (or pass none) to render
  // exactly as before, e.g. HealthAiAssistant's use of this same component.
  chores?: AskCubeChoreRefLike[];
  linkColor?: string;
  onChorePress?: (choreId: string) => void;
}) {
  const lines = content.split('\n');
  const choreList = chores ?? [];
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, i) => {
        if (line.trim() === '') return <View key={`gap-${i}`} style={{ height: 6 }} />;
        // Strip a leading "**Label:**" heading line into its own bold row
        // with a touch more spacing, since the model uses these as section
        // headers ("**Schedule:**", "**Chores:**").
        return renderLine(line, `line-${i}`, color, urgentColor, soonColor, choreList, linkColor ?? color, onChorePress);
      })}
    </View>
  );
}
