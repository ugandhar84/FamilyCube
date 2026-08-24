import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { fmtDate } from '@/features/playdates/components/playdateDetailTypes';
import type { PlaydateRequest, Pet } from '@/features/playdates/components/playdateDetailTypes';
import { TYPO } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

// Was a hardcoded hex-per-status table bypassing useTheme() entirely (no
// dark-mode adaptation at all) even though the app's own success/danger/
// textTertiary/warning/accent tokens already cover every one of these
// meanings. Built as a function of colors so it re-derives per theme.
function statusCfg(colors: any) {
  return {
    pending:    { label: 'Waiting for reply',      color: colors.warning, icon: 'time-outline' },
    scheduling: { label: 'Finding the right time',  color: colors.accent,  icon: 'chatbubble-outline' },
    accepted:   { label: 'Confirmed ✅',            color: colors.success, icon: 'checkmark-circle-outline' },
    declined:   { label: 'Declined',                color: colors.danger,  icon: 'close-circle-outline' },
    withdrawn:  { label: 'Withdrawn',               color: colors.textTertiary, icon: 'arrow-undo-outline' },
    expired:    { label: 'Expired',                 color: colors.textTertiary, icon: 'hourglass-outline' },
    cancelled:  { label: 'Cancelled',                color: colors.textTertiary, icon: 'ban-outline' },
    completed:  { label: 'Playdate completed 🎉',   color: colors.success, icon: 'checkmark-done-outline' },
  } as const;
}

interface Props {
  request: PlaydateRequest;
  primaryColor: string;
  iAmFrom: boolean;
  otherPet: Pet | null;
  myPet: Pet | null;
}

function PetFace({ pet, size = 44 }: { pet: Pet | null; size?: number }) {
  const ac = pet?.accent_color ?? '#7C5CBF';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2, borderColor: ac + '60' }}>
      {pet?.avatar_url
        ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={{ width: size, height: size }} contentFit="cover" />
        : <LinearGradient colors={[ac + '40', ac + '18']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.44 }}>{pet?.emoji ?? '🐾'}</Text>
          </LinearGradient>
      }
    </View>
  );
}

function PlaydateStatusBanner({ request, primaryColor, iAmFrom, otherPet, myPet }: Props) {
  const { colors } = useTheme();
  const STATUS_CFG = statusCfg(colors);
  const cfg = STATUS_CFG[request.status as keyof typeof STATUS_CFG]
    ?? { ...STATUS_CFG.pending, color: primaryColor };

  const otherAc = otherPet?.accent_color ?? primaryColor;

  // ── Incoming pending: "wants to play" hero moment ─────────────────────────
  if (request.status === 'pending' && !iAmFrom) {
    return (
      <View style={[s.heroBanner, { backgroundColor: otherAc + '12', borderColor: otherAc + '35' }]}>
        <View style={s.heroFaces}>
          <PetFace pet={otherPet} size={48} />
          <Text style={{ fontSize: TYPO.heading }}>🐾</Text>
          <PetFace pet={myPet} size={48} />
        </View>
        <Text style={[s.heroTitle, { color: otherAc }]}>
          {otherPet?.name ?? 'A new friend'} wants to play!
        </Text>
        <Text style={[s.heroSub, { color: otherAc + 'AA' }]}>
          Accept, suggest a time, or decline below
        </Text>
      </View>
    );
  }

  // ── Outgoing pending: sent + waiting ──────────────────────────────────────
  if (request.status === 'pending' && iAmFrom) {
    return (
      <View style={[s.banner, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
        <Ionicons name="paper-plane-outline" size={16} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: colors.warning }]}>Request sent to {otherPet?.name}</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.warning + '88', marginTop: 1 }}>
            Waiting for their parent to respond
            {request.expires_at ? ` · Expires ${fmtDate(request.expires_at.split('T')[0])}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  // ── Scheduling: back-and-forth ─────────────────────────────────────────────
  if (request.status === 'scheduling') {
    return (
      <View style={[s.banner, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '30' }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: colors.accent }]}>Finding the right time</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.accent + '88', marginTop: 1 }}>
            You and {otherPet?.name}'s parent are negotiating — check the proposal below
          </Text>
        </View>
      </View>
    );
  }

  // ── Default banner ────────────────────────────────────────────────────────
  return (
    <View style={[s.banner, { backgroundColor: `${cfg.color}14`, borderColor: `${cfg.color}30` }]}>
      <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      <Text style={[s.label, { color: cfg.color, flex: 1 }]}>{cfg.label}</Text>
    </View>
  );
}

export default React.memo(PlaydateStatusBanner);

const s = StyleSheet.create({
  banner:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  label:      { fontSize: TYPO.body, fontWeight: '700' },
  heroBanner: { alignItems: 'center', borderRadius: 18, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 16, gap: 10 },
  heroFaces:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTitle:  { fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center' },
  heroSub:    { fontSize: TYPO.caption, fontWeight: '500', textAlign: 'center' },
});
