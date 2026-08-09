import React, { useState, useEffect } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { EmojiAvatar } from './EmojiAvatar';

// ── MentionText ────────────────────────────────────────────────────────────────

const MENTION_BLUE = '#5B8DEF';

function MentionTextBase({ text, style }: { text: string; style?: any }) {
  const { colors: mtColors } = useTheme();
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);

  const handleMentionTap = async (slug: string) => {
    // Look up pet by slugified name match
    const { data } = await supabase
      .from('pets')
      .select('id')
      .ilike('name', slug.replace(/_/g, ' '))
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      router.push({ pathname: '/pet/[id]', params: { id: data.id } } as any);
    }
  };

  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.startsWith('@') && p.length > 1) {
          const slug = p.slice(1);
          return (
            <Text key={i} style={{ color: MENTION_BLUE, fontWeight: '600' }}
              onPress={() => handleMentionTap(slug)}>
              {p}
            </Text>
          );
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

export const MentionText = React.memo(MentionTextBase);

// ── MentionDropdown ────────────────────────────────────────────────────────────

type PetResult = {
  id: string;
  name: string;
  emoji: string | null;
  accent_color: string | null;
  avatar_url: string | null;
  owner_handle: string | null;
};

/** Slugify pet name for use in @mention: lowercase, spaces→underscores, strip special chars */
export function petMentionSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function MentionDropdownBase({ query, colors, accent, onSelect }: {
  query: string | null; colors: any; accent: string;
  onSelect: (slug: string, petId: string) => void;
}) {
  const [results, setResults] = useState<PetResult[]>([]);

  useEffect(() => {
    if (query === null) { setResults([]); return; }
    const controller = new AbortController();

    (async () => {
      // Search pets by name AND by owner handle — merge, dedupe by pet id
      const [byName, byHandle] = await Promise.all([
        supabase
          .from('pets')
          .select('id, name, emoji, accent_color, avatar_url, profiles!owner_id(handle)')
          .ilike('name', `${query}%`)
          .eq('is_active', true)
          .limit(5),
        supabase
          .from('profiles')
          .select('id, handle')
          .ilike('handle', `${query}%`)
          .not('handle', 'is', null)
          .limit(3)
          .then(async ({ data: profiles }) => {
            if (!profiles?.length) return { data: [] };
            const ownerIds = profiles.map((p: any) => p.id);
            return supabase
              .from('pets')
              .select('id, name, emoji, accent_color, avatar_url, profiles!owner_id(handle)')
              .in('owner_id', ownerIds)
              .eq('is_active', true)
              .limit(6);
          }),
      ]);

      if (controller.signal.aborted) return;

      const toRow = (r: any): PetResult => ({
        id: r.id, name: r.name, emoji: r.emoji,
        accent_color: r.accent_color, avatar_url: r.avatar_url,
        owner_handle: r.profiles?.handle ?? null,
      });

      const seen = new Set<string>();
      const merged: PetResult[] = [];
      for (const r of [...(byName.data ?? []), ...((byHandle as any).data ?? [])]) {
        if (!seen.has(r.id)) { seen.add(r.id); merged.push(toRow(r)); }
      }
      setResults(merged.slice(0, 7));
    })();

    return () => controller.abort();
  }, [query]);

  if (query === null || !results.length) return null;

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 12, marginHorizontal: 4, marginBottom: 4,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 5,
    }}>
      {results.map((r, i) => (
        <TouchableOpacity key={r.id}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
            paddingVertical: 9, borderBottomWidth: i < results.length - 1 ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: colors.border }}
          onPress={() => onSelect(petMentionSlug(r.name), r.id)}
          activeOpacity={0.7}>
          <EmojiAvatar emoji={r.emoji ?? undefined} name={r.name} size={30}
            color={r.accent_color ?? accent} avatarUrl={r.avatar_url ?? undefined} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: accent }}>
              {r.emoji} {r.name}
            </Text>
            {r.owner_handle && (
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
                @{r.owner_handle}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const MentionDropdown = React.memo(MentionDropdownBase);
