/**
 * UnoCardViews — the visual vocabulary of the Uno table: a single card
 * face, a card back, and the small "seat" pod that renders an opponent as
 * an overlapping fan of backs.
 *
 * Split out of UnoGame.tsx so the table screen itself stays about state
 * and animation rather than about card geometry. Everything here is
 * PRESENTATIONAL ONLY — no store access, no RPCs — which is what makes it
 * safe to drive purely from optimistic/animated props without any risk of
 * desyncing from the server-authoritative game state that UnoGame.tsx
 * owns.
 *
 * Card geometry note: CARD_W/CARD_H are the *base* size at scale 1 and
 * every consumer scales from them, so the hand, the table-centre pile and
 * an opponent's mini-fan all stay in exact proportion. The oval + rotated
 * label is the classic Uno face; the label is rendered at a size derived
 * from the card width so it can never overflow its oval at small scales.
 */
import { View, Text } from 'react-native';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD } from '../theme/gameTheme';
import { UnoCard, UNO_COLOR_HEX, valueLabel } from './unoLogic';

// Base card geometry. Bumped up substantially from the old 52x74 — the
// player's own hand was previously drawn at 52pt wide with a -18pt
// overlap, leaving only 34pt of each card visible, which is what made
// values illegible in the reported screenshot.
export const CARD_W = 66;
export const CARD_H = 96;

// A darker shade of each Uno colour, used for the card's inner "ink"
// border so a face reads as a printed card rather than a flat colour
// swatch. Kept as a lookup rather than computed so the values stay
// hand-tuned per hue.
const UNO_COLOR_DEEP: Record<UnoCard['color'], string> = {
  red: '#B32A24',
  yellow: '#C08E00',
  green: '#1E8443',
  blue: '#1B57A8',
  wild: '#0E0918',
};

export function UnoCardFace({
  card, size = 1, dimmed = false, highlighted = false,
}: {
  card: UnoCard; size?: number; dimmed?: boolean; highlighted?: boolean;
}) {
  const w = CARD_W * size;
  const h = CARD_H * size;
  const bg = UNO_COLOR_HEX[card.color];
  const deep = UNO_COLOR_DEEP[card.color];
  const label = valueLabel(card.value);
  // Long labels ("+2"/"+4") get a smaller face size so they never spill
  // out of the oval at any scale.
  const labelSize = (label.length > 1 ? w * 0.34 : w * 0.44);

  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: 10 * size,
        backgroundColor: '#FFFFFF',
        padding: 3 * size,
        opacity: dimmed ? 0.42 : 1,
        borderWidth: highlighted ? 2 : 0,
        borderColor: highlighted ? ARCADE.primary : 'transparent',
        shadowColor: highlighted ? ARCADE.primary : '#000',
        shadowOpacity: highlighted ? 0.75 : 0.4,
        shadowRadius: highlighted ? 8 : 4,
        shadowOffset: { width: 0, height: highlighted ? 4 : 2 },
        elevation: highlighted ? 8 : 3,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 8 * size,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Wilds get a four-colour quadrant wash instead of a flat body,
            which is what makes a wild instantly identifiable in a fan. */}
        {card.color === 'wild' && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap' }}>
            {(['red', 'yellow', 'blue', 'green'] as const).map(c => (
              <View key={c} style={{ width: '50%', height: '50%', backgroundColor: UNO_COLOR_HEX[c] }} />
            ))}
          </View>
        )}
        {/* The signature white oval, tilted. */}
        <View
          style={{
            width: w * 0.78,
            height: h * 0.52,
            borderRadius: (w * 0.78) / 2,
            backgroundColor: 'rgba(255,255,255,0.95)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-22deg' }],
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD,
              fontSize: labelSize,
              lineHeight: labelSize * 1.25,
              color: card.color === 'wild' ? UNO_COLOR_DEEP.blue : deep,
              transform: [{ rotate: '22deg' }],
            }}
          >
            {label}
          </Text>
        </View>
        {/* Corner pips, top-left and bottom-right, like a real card. */}
        <Text
          style={{
            position: 'absolute', top: 2 * size, left: 4 * size,
            fontFamily: ARCADE_FONT_DISPLAY_BOLD,
            fontSize: w * 0.2, color: '#FFFFFF',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            position: 'absolute', bottom: 2 * size, right: 4 * size,
            fontFamily: ARCADE_FONT_DISPLAY_BOLD,
            fontSize: w * 0.2, color: '#FFFFFF',
            transform: [{ rotate: '180deg' }],
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * A card back. NOTE: this is a plain, non-rotated view — it is never
 * placed behind a rotateY(180deg) transform, so it needs no scaleX(-1)
 * mirror-correction. (CardFlip.tsx applies that correction itself for the
 * one place a back genuinely does get rotated.)
 */
export function UnoCardBack({ size = 1, faded = false }: { size?: number; faded?: boolean }) {
  const w = CARD_W * size;
  const h = CARD_H * size;
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: 10 * size,
        backgroundColor: '#FFFFFF',
        padding: 3 * size,
        opacity: faded ? 0.5 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 8 * size,
          backgroundColor: '#17111F',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Tilted brand oval — same silhouette as a face's oval, so backs
            and faces read as the same deck. */}
        <View
          style={{
            width: w * 0.86,
            height: h * 0.44,
            borderRadius: (w * 0.86) / 2,
            backgroundColor: ARCADE.uno,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-22deg' }],
          }}
        >
          {/* Only draw the wordmark when the card is large enough for it
              to actually be legible — at opponent-fan scale it became the
              "tiny illegible text" the redesign is fixing, so below that
              threshold the oval alone carries the identity. */}
          {w >= 40 && (
            <Text
              style={{
                fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD,
                fontSize: w * 0.26,
                lineHeight: w * 0.34,
                color: '#FFFFFF',
                letterSpacing: 0.5,
              }}
            >
              UNO
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
