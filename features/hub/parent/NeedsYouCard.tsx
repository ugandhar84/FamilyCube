import { View, Text } from 'react-native';
import { ClipboardCheck, ChevronRight, CalendarDays, Gift, Scale, Inbox } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { useTheme } from '@/lib/ThemeContext';
import { fmtHumanDateShort, fmtTime } from '../hubUtils';
import { GEMINI } from '@/constants/geminiRhythm';

// dueDate/dueTime are optional, separate fields — NOT baked into the reason
// string. Was previously the only way a date reached this card at all (e.g.
// "Due 2026-10-12" or "You're assigned at 17:00" interpolated straight into
// reason), which violates the app's non-negotiable 12h/human-date rule
// (CLAUDE.md §9) — a raw ISO date or 24h time rendered verbatim on the Hub's
// own top card. Keeping them structured lets the card format them properly
// (fmtHumanDateShort/fmtTime) instead of trusting whatever string shape the
// caller happened to build.
// extraCount: how many OTHER items are also waiting in this same category
// (e.g. other pending chore approvals) beyond the single one shown here.
// This card is deliberately a single-most-urgent-item slot, not a list —
// but with nothing on the card itself, a parent had no way to tell "this
// is the only thing" from "there are 3 more behind it"
// [live-reported via screenshot: "i've multiple items inside for the
// review but we have seen the only one card here — how do we handle this
// scenario?"]. Optional and omitted for kinds that aren't naturally
// multi-item (conflict).
// urgentCount: of the items counted in extraCount (this one plus the
// others behind it), how many are flagged urgent/emergency or otherwise
// time-critical within their own category — e.g. "2 urgent" out of "5
// pending." Live direction: "mention how many are in urgency catogory" —
// a parent scanning several category cards needs to know which ones have
// something flagged inside them, not just a raw pending count. Omitted
// when a category has no urgency concept of its own (conflict) or when
// none of its pending items are flagged.
// categoryLabel: plain-language name of what kind of thing extraCount is
// counting (e.g. "chore", "reward", "request", "dispute") — singular, the
// card pluralizes it. Was a bare "+N more awaiting review," which told a
// parent there was more, but not what — scanning several category cards
// in the stack, all with an identical "+N more awaiting review" line,
// gave no way to tell them apart at a glance
// [live-reported: "+ N awaiting review what? we could have something
// like categories inside right?"]. Required whenever extraCount is set.
export type NeedsYouItem =
  | { kind: 'conflict'; title: string; reason: string; dueDate?: string; dueTime?: string }
  | { kind: 'approval'; title: string; reason: string; dueDate?: string; dueTime?: string; extraCount?: number; urgentCount?: number; categoryLabel?: string }
  | { kind: 'backlog'; title: string; reason: string; dueDate?: string; dueTime?: string };

// Was a full-width "Review options" / "Review & approve" / "See task" CTA
// button — redundant with the card itself already being the thing to tap.
// Replaced with an inline status label (what this item actually IS right
// now) plus a trailing chevron, same affordance as every other tappable
// row/card in the app (NextUpTimeline's rows, EventDetailScreen's linked-leg
// card) instead of a one-off full-button pattern unique to this card.
function statusFor(kind: NeedsYouItem['kind']): { label: string; color: (colors: any) => string } {
  if (kind === 'conflict')  return { label: 'Scheduling conflict', color: (c) => c.danger };
  if (kind === 'approval')  return { label: 'Waiting on you',     color: (c) => c.amber };
  return { label: 'In backlog', color: (c) => c.textTertiary };
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

// Per-category icon — was every card using the same ClipboardCheck
// regardless of category, so a chore, a reward redemption, and a dispute
// all looked identical in the stack at a glance
// [live-requested: "show the icon respective category card"]. Keyed off
// categoryLabel (already set per-category in ParentView.tsx alongside
// extraCount); conflict/backlog kinds and uncategorized approvals (the
// single-item conflict/helper-event/ride cards, which aren't one of the
// four review-inbox categories) keep the original ClipboardCheck.
function iconFor(item: NeedsYouItem): typeof ClipboardCheck {
  if (item.kind === 'conflict') return CalendarDays;
  if (item.kind === 'approval' && item.categoryLabel === 'reward') return Gift;
  if (item.kind === 'approval' && item.categoryLabel === 'dispute') return Scale;
  if (item.kind === 'approval' && item.categoryLabel === 'request') return Inbox;
  return ClipboardCheck;
}

export function NeedsYouCard({
  item, onReview, showLabel = true, variant = 'card',
}: {
  item: NeedsYouItem;
  onReview: () => void;
  // false when a shared "NEEDS YOU" section header already sits above a
  // stack of these cards (ParentView.tsx's Hub) — each card repeating its
  // own eyebrow label there was redundant noise above every single card
  // in the stack, not just the first.
  showLabel?: boolean;
  // 'row': flush — no own border/background/shadow/outer margin — meant
  // to sit as one line inside a single shared container (ParentView.tsx
  // wraps several in one bordered card with divider lines between them,
  // so a stack of these doesn't read as several separate boxy cards)
  // [live-reported via screenshot: still looked like separate bulky
  // cards even with the shared header — "make this needs to combine with
  // separated line instead individual cards"]. 'card' (default) keeps
  // the original self-contained bordered/shadowed look for any other
  // caller.
  variant?: 'card' | 'row';
}) {
  const { colors, isDark } = useTheme();
  const status = statusFor(item.kind);
  const statusColor = status.color(colors);
  const dueLabel = item.dueDate
    ? `${fmtHumanDateShort(item.dueDate)}${item.dueTime ? ` · ${fmtTime(item.dueTime)}` : ''}`
    : undefined;
  const isRow = variant === 'row';
  const Icon = iconFor(item);

  return (
    <AnimatedPressable
      onPress={onReview}
      style={isRow ? {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14, paddingHorizontal: 16,
      } : {
        marginHorizontal: 20, marginTop: 14,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16,
        borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
        borderRadius: 22,
        backgroundColor: colors.amberLight,
        ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
      }}
    >
      <View style={{
        width: isRow ? 36 : 42, height: isRow ? 36 : 42, borderRadius: isRow ? 12 : 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isRow ? colors.amberLight : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)'),
      }}>
        <Icon size={isRow ? 18 : 21} color={colors.amber} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        {showLabel && (
          <View style={{ alignSelf: 'flex-start' }}>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.amber, marginBottom: 6, opacity: 0.6 }} />
            <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>NEEDS YOU</Text>
          </View>
        )}
        <Text style={{ color: (isDark ? colors.textPrimary : GEMINI.titleColor), fontSize: 17, fontWeight: '700', marginTop: showLabel ? 5 : 0, marginBottom: 4 }} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: dueLabel ? 4 : 0 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: statusColor + '20' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{status.label}</Text>
          </View>
          <Text style={{ color: (isDark ? colors.textSecondary : GEMINI.bodyColor), fontSize: 12, flex: 1 }} numberOfLines={1}>
            {item.reason}
          </Text>
        </View>
        {dueLabel && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <CalendarDays size={12} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600' }}>{dueLabel}</Text>
          </View>
        )}
        {item.kind === 'approval' && !!item.extraCount && (
          <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '700', marginTop: dueLabel ? 4 : 2 }}>
            +{item.extraCount} more {item.categoryLabel ? pluralize(item.categoryLabel, item.extraCount) : 'awaiting review'}
            {!!item.urgentCount && (
              <Text style={{ color: colors.danger }}> · {item.urgentCount} urgent</Text>
            )}
          </Text>
        )}
      </View>
      <ChevronRight size={20} color={colors.textTertiary} />
    </AnimatedPressable>
  );
}
