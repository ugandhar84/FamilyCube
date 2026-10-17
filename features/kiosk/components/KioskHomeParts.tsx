/**
 * KioskHomeParts — the phone Hub's building blocks, scaled up for the wall
 * display: section eyebrow (short rule + tiny caps), ring dial, overlapping
 * face pile, Next Up timeline, Tonight meal card, quick-action tile.
 * Shared by KioskHomeParent and KioskHomeKid so both Homes read as one
 * family. Times are always 12h (CLAUDE.md rule 9).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';
import { kioskRoleAccent, type KioskColors } from '../kioskPalette';
import { KioskAvatar } from './KioskAvatar';

/** "17:00" → "5:00 PM"; already-12h strings pass through. */
export function fmt12(t?: string | null): string {
  if (!t) return '';
  if (/am|pm/i.test(t)) return t.replace(/\s*(am|pm)/i, (_, x) => ` ${x.toUpperCase()}`);
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function toMin(t?: string | null): number {
  const m = t ? /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(t) : null;
  if (!m) return 9999;
  let h = Number(m[1]) % 12;
  if (m[3] ? m[3].toLowerCase() === 'pm' : Number(m[1]) >= 12) h += 12;
  return h * 60 + Number(m[2]);
}

export const firstName = (m?: { name?: string } | null) => m?.name?.trim().split(' ')[0] ?? '';

export function greetingFor(d: Date): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** A clock that ticks every 15s — enough for minute-resolution text. */
export function useNow(): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(i); }, []);
  return now;
}

/** Phone-style section label: a short accent rule above tiny tracked caps. */
export function Eyebrow({ label, accent, k, right }: { label: string; accent: string; k: KioskColors; right?: string }) {
  return (
    <View style={s.eyeRow}>
      <View>
        <View style={[s.eyeRule, { backgroundColor: accent }]} />
        <Text style={[s.eyeText, { color: k.textFaint }]}>{label}</Text>
      </View>
      {!!right && <Text style={[s.eyeRight, { color: k.textMuted }]}>{right}</Text>}
    </View>
  );
}

export function Section({ label, accent, k, right, children, flex }: {
  label: string; accent: string; k: KioskColors; right?: string; children: ReactNode; flex?: boolean;
}) {
  return (
    <View style={[s.section, flex && { flex: 1, minHeight: 0 }]}>
      <Eyebrow label={label} accent={accent} k={k} right={right} />
      {children}
    </View>
  );
}

/** Ring dial — progress arc around a value + caption (phone's 70px ring, scaled). */
export function Dial({ pct, value, caption, color, track, inner, k }: {
  pct: number; value: string; caption: string; color: string; track: string; inner: string; k: KioskColors;
}) {
  const size = 68, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill={inner} />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c * p} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[s.dialValue, { color: k.text }]}>{value}</Text>
      <Text style={[s.dialCap, { color: k.textMuted }]}>{caption}</Text>
    </View>
  );
}

export function FacePile({ members, k, edge }: { members: FamilyMember[]; k: KioskColors; edge: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {members.slice(0, 5).map((m, i) => {
        const tint = kioskRoleAccent(k, m.role);
        return (
          <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 14, borderWidth: 3, borderColor: edge }}>
            <KioskAvatar
              name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
              siblings={members.filter(x => x.id !== m.id).map(x => x.name)}
              size={36} borderRadius={11} bgColor={tint + '24'} k={k}
            />
          </View>
        );
      })}
    </View>
  );
}

/** The tinted "Pulse" card shell the phone's Family/My Pulse use. */
export function PulseCard({ k, isDark, children }: { k: KioskColors; isDark: boolean; children: ReactNode }) {
  return (
    <View style={[s.pulse, { backgroundColor: k.sageSoft, borderColor: k.sageEdge }, kioskElevation(k.sage, isDark)]}>
      {children}
    </View>
  );
}

export function RaisedCard({ k, isDark, children, style }: { k: KioskColors; isDark: boolean; children: ReactNode; style?: object }) {
  return (
    <View style={[s.raised, { backgroundColor: k.card, borderColor: k.cardBorder }, kioskElevation(k.sage, isDark), style]}>
      {children}
    </View>
  );
}

export function NextUpTimeline({ events, members, k, isDark, onOpen }: {
  events: FamilyEvent[]; members: FamilyMember[]; k: KioskColors; isDark: boolean; onOpen?: () => void;
}) {
  const accents = [k.purple, k.sage, k.primary, k.gold];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const sorted = [...events].sort((a, b) => toMin(a.time) - toMin(b.time)).slice(0, 4);
  const nextIdx = sorted.findIndex(e => !e.allDay && toMin(e.time) >= nowMin);
  const who = (e: FamilyEvent) =>
    [e.memberId, ...(e.memberIds ?? [])]
      .map(id => firstName(members.find(m => m.id === id)))
      .filter((x, j, a) => x && a.indexOf(x) === j).join(' + ');
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole="button" accessibilityLabel="Open schedule">
      <RaisedCard k={k} isDark={isDark} style={{ gap: 4 }}>
        {sorted.length === 0 && <Text style={[s.empty, { color: k.textMuted }]}>Nothing planned today</Text>}
        {sorted.map((e, i) => {
          const c = accents[i % accents.length];
          const isNext = i === nextIdx;
          return (
            <View key={e.id} style={s.evRow}>
              <Text style={[s.evTime, { color: isNext ? k.text : k.textMuted }]}>{e.allDay ? 'All day' : fmt12(e.time)}</Text>
              <View style={s.evRail}>
                <View style={[s.evDot, { backgroundColor: c }, isNext && { borderWidth: 3, borderColor: c + '40', width: 20, height: 20, borderRadius: 10 }]} />
                {i < sorted.length - 1 && <View style={[s.evLine, { backgroundColor: k.cardBorder }]} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
                <Text style={[s.evTitle, { color: k.text }]} numberOfLines={1}>
                  {e.title}
                  {isNext && <Text style={{ color: k.primary, fontSize: KIOSK_TYPO.label }}>{'  NEXT'}</Text>}
                </Text>
                <Text style={[s.evSub, { color: k.textMuted }]} numberOfLines={1}>
                  {[who(e), e.endTime ? `until ${fmt12(e.endTime)}` : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          );
        })}
      </RaisedCard>
    </Pressable>
  );
}

export function TonightCard({ meal, cook, k, isDark, onOpen }: {
  meal: Meal | null; cook?: string; k: KioskColors; isDark: boolean; onOpen?: () => void;
}) {
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole="button" accessibilityLabel="Open meals">
      <RaisedCard k={k} isDark={isDark} style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md }}>
        <View style={[s.mealEmoji, { backgroundColor: k.sageSoft }]}>
          <Text style={{ fontSize: 28 }}>{meal?.emoji ?? '🍽️'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.mealTitle, { color: k.text }]} numberOfLines={2}>{meal ? meal.title : 'No dinner planned yet'}</Text>
          <Text style={[s.evSub, { color: k.textMuted }]} numberOfLines={1}>
            {meal ? [cook ? `${cook} cooks` : '', meal.start_time ? fmt12(meal.start_time) : ''].filter(Boolean).join(' · ') : 'Plan it in Meals'}
          </Text>
        </View>
      </RaisedCard>
    </Pressable>
  );
}

export function ActionTile({ label, emoji, bg, fg, onPress, row }: {
  label: string; emoji: string; bg: string; fg: string; onPress: () => void; row?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.tile, row && s.tileRow, { backgroundColor: bg, opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={[s.tileText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  eyeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyeRule: { height: 2, borderRadius: 1, marginBottom: 6, opacity: 0.6 },
  eyeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.1 },
  eyeRight: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  section: { gap: KIOSK_SPACE.sm },
  dialValue: { fontSize: 15, fontWeight: '800' },
  dialCap: { fontSize: 9.5, fontWeight: '700' },
  pulse: { borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.md },
  raised: { borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, padding: KIOSK_SPACE.md },
  empty: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', paddingVertical: KIOSK_SPACE.sm },
  evRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  evTime: { width: 70, textAlign: 'right', fontSize: KIOSK_TYPO.label, fontWeight: '800', paddingTop: 1 },
  evRail: { width: 20, alignItems: 'center' },
  evDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  evLine: { width: 2, flex: 1, marginTop: 2 },
  evTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  evSub: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  mealEmoji: { width: 52, height: 52, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  mealTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  tile: {
    flex: 1, minHeight: 60, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 6,
  },
  tileRow: { flexDirection: 'row', gap: 10 },
  tileText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
});
