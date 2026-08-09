import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '@/lib/ThemeContext';

interface Props {
  petName: string;
  memorialAt: string | null;
}

export default function MemorialBanner({ petName, memorialAt }: Props) {
  const { isDark } = useTheme();
  const dateStr = memorialAt
    ? format(parseISO(memorialAt), 'MMMM d, yyyy')
    : null;

  const bg      = isDark ? '#1E1030' : '#F5F0FF';
  const border  = isDark ? '#4C1D95' : '#C4B5FD';
  const title   = isDark ? '#C4B5FD' : '#5B21B6';
  const sub     = isDark ? '#A78BFA' : '#7C3AED';
  const note    = isDark ? '#8B5CF6' : '#8B5CF6';

  return (
    <View style={[s.banner, { backgroundColor: bg, borderColor: border }]}>
      <Text style={s.rainbow}>🌈</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: title }]}>In loving memory of {petName}</Text>
        {dateStr && (
          <Text style={[s.sub, { color: sub }]}>Forever in our hearts · {dateStr}</Text>
        )}
        <Text style={[s.note, { color: note }]}>This profile is preserved as a read-only memorial.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: 16, borderWidth: 1.5,
    padding: 14, marginHorizontal: 16, marginTop: 12,
  },
  rainbow: { fontSize: 28, marginTop: 2 },
  title:   { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  sub:     { fontSize: 14, marginBottom: 4 },
  note:    { fontSize: 14, fontStyle: 'italic' },
});
