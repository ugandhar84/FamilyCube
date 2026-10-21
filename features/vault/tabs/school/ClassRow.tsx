import { View, Text, TouchableOpacity } from 'react-native';
import { prettySubject } from './schoolUtils';
import type { ClassPeriod } from '@/store/schoolStore';
import { GEMINI } from '@/constants/geminiRhythm';

const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR = GEMINI.bodyColor;
const BODY_CLR_LIGHT = GEMINI.bodyColorLight;

export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function fmtTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** A steady colour per subject, so the same class always looks the same. */
export function subjectTone(subject: string, colors: any): { fg: string; bg: string } {
  const tones = [
    { fg: colors.primary, bg: colors.primaryLight },
    { fg: colors.teal, bg: colors.tealLight },
    { fg: colors.amber, bg: colors.amberLight },
    { fg: colors.pink, bg: colors.pinkLight },
  ];
  const key = subject.toUpperCase().replace(/\b(A|B)$/, '').replace(/\s+\d*[AB]?$/, '').trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

/** One class as a card: time on the left, coloured subject block on the right. */
export function ClassRow({ p, colors, isDark, now, onPress }: { p: ClassPeriod; colors: any; isDark: boolean; now?: boolean; onPress?: () => void }) {
  const tone = subjectTone(p.subject, colors);
  const mins = timeToMins(p.endTime) - timeToMins(p.startTime);
  const sub = [p.room, p.teacher].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 12 }}>
      <View style={{ width: 62, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: isDark ? colors.textPrimary : TITLE_CLR, fontVariant: ['tabular-nums'] }}>{fmtTime12(p.startTime)}</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? colors.textSecondary : BODY_CLR, fontVariant: ['tabular-nums'] }}>{fmtTime12(p.endTime)}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', borderRadius: 14, overflow: 'hidden', backgroundColor: tone.fg + (isDark ? '33' : '40'),
        borderWidth: now ? 2 : 0, borderColor: tone.fg }}>
        <View style={{ width: 7, backgroundColor: tone.fg }} />
        <View style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 12, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: isDark ? colors.textPrimary : TITLE_CLR }} numberOfLines={2}>{prettySubject(p.subject)}</Text>
            {now ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.fg }}>
                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: '#fff' }}>NOW</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {p.room ? (
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: isDark ? tone.fg + '55' : '#FFFFFF' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: tone.fg }}>Room {String(p.room).replace(/^room\s*/i, '')}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textSecondary : TITLE_CLR, opacity: 0.8 }} numberOfLines={1}>
              {[p.teacher ? prettySubject(p.teacher) : '', mins > 0 ? `${mins} min` : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        {onPress ? <Text style={{ alignSelf: 'center', paddingRight: 12, fontSize: 12, fontWeight: '800', color: tone.fg }}>Edit</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

