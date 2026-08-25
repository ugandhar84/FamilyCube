/**
 * ProfileHeroCard — gradient hero card with avatar, user info, and stat tiles.
 *
 * Covers everything from the coloured gradient banner down to the three stat
 * tiles (babies, mood scans, SOS shortcut). Extracting it keeps ProfileScreen
 * focused on orchestration rather than rendering details.
 */

import React, { memo } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from '@/components/LazyImage';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import { hero } from '@/features/profile/styles';

interface Props {
  /** Gradient accent colour derived from the active pet */
  accent: string;
  colors: any;
  /** Resolved avatar URI (CDN URL or local preview) */
  avatarUri: string | null;
  /** Two-letter initials fallback */
  avatarInit: string;
  /** User's chosen emoji — shown instead of initials when no avatar */
  userEmoji?: string;
  /** Whether an avatar upload is in progress */
  avatarUploading: boolean;
  displayName: string;
  email: string | undefined;
  handle: string | undefined;
  phone: string | undefined;
  memberStr: string;
  tier: string;
  petsCount: number;
  moodScanCount: number | null;
  sosEnabled: boolean;
  onEditPress: () => void;
  onAvatarPress: () => void;
}

const ProfileHeroCard = memo(function ProfileHeroCard({
  accent, colors, avatarUri, avatarInit, avatarUploading,
  displayName, email, handle, phone, memberStr, tier,
  petsCount, moodScanCount, sosEnabled, userEmoji,
  onEditPress, onAvatarPress,
}: Props) {
  return (
    <>
      {/* Gradient hero */}
      <LinearGradient colors={[accent, `${accent}CC`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hero.card}>
        <View style={[hero.blob, { width: 160, height: 160, top: -50, right: -40, opacity: 0.12 }]} />
        <View style={[hero.blob, { width: 80, height: 80, bottom: 10, left: -20, opacity: 0.10 }]} />

        {/* Edit button — inset from card corner so the circle isn't clipped */}
        <TouchableOpacity onPress={onEditPress} style={[hero.editBtn, { position: 'absolute', top: 12, right: 12, zIndex: 10 }]}>
          <Ionicons name="pencil-outline" size={16} color="#fff" />
        </TouchableOpacity>

        <View style={hero.topRow}>
          {/* Avatar — tap to change photo */}
          <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.8} disabled={avatarUploading}>
            <View style={hero.avatarRing}>
              {avatarUri
                ? <LazyImage key={avatarUri} uri={avatarUri} style={hero.avatar} />
                : <LinearGradient colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.15)']}
                    style={[hero.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: userEmoji ? 36 : TYPO.hero, fontWeight: '800', color: '#fff' }}>
                      {userEmoji || avatarInit}
                    </Text>
                  </LinearGradient>
              }
              {avatarUploading
                ? <View style={hero.overlay}><ActivityIndicator color="#fff" size="small" /></View>
                : <View style={hero.camBadge}><Ionicons name="camera" size={12} color="#fff" /></View>
              }
              {/* Subscription badge — top-right corner of avatar ring */}
              <View style={{ position: 'absolute', top: -10, right: -10 }}>
                <SubscriptionBadge tier={tier} size="sm" />
              </View>
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[hero.name, { marginBottom: 2 }]} numberOfLines={1}>{displayName}</Text>
            <View style={{ gap: 2 }}>
              {handle ? <Text style={[hero.email, { color: '#fff', fontWeight: '600', opacity: 0.9 }]}>@{handle}</Text> : null}
              <Text style={hero.email}>{email}</Text>
              {phone ? <Text style={hero.email}>📱 {phone}</Text> : null}
              {memberStr ? <Text style={hero.since}>{memberStr}</Text> : null}
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Stat tiles */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>
        {[
          { val: petsCount,             lbl: 'My babies', icon: 'paw-outline'    as const },
          { val: moodScanCount ?? '—',  lbl: 'Mood scans', icon: 'camera-outline' as const },
        ].map(st => (
          <View key={st.lbl} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            paddingVertical: 14, alignItems: 'center', gap: 4 }}>
            <Ionicons name={st.icon} size={18} color={accent} />
            <Text style={{ fontSize: TYPO.title, fontWeight: '700', color: colors.textPrimary }}>{st.val}</Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{st.lbl}</Text>
          </View>
        ))}
      </View>
    </>
  );
});

export default ProfileHeroCard;
