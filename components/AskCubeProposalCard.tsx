/**
 * AskCubeProposalCard — type-specific confirm cards for Ask Cube's inline
 * proposals (event / quest / grocery / meal). Each kind gets its own
 * layout instead of one generic title+date card, since the fields and
 * "what am I confirming" mental model differ a lot per type (a grocery
 * proposal is a list of items, a meal is a recipe-style hero, etc).
 */
import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Calendar, ClipboardList, ShoppingCart, ChefHat, Coins, Clock, User, Camera, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import type { AskCubeProposal } from '@/lib/askCubeService';
import type { FamilyMember } from '@/store/familyStore';

// Shared hero for meal cards/sheets — a real dish photo when the model gave
// one (Wikimedia Commons only, enforced server-side), falling back to the
// large emoji treatment if there's no URL or the image fails to load.
export function MealHero({ imageUrl, emoji, accent, height }: { imageUrl?: string | null; emoji?: string | null; accent: string; height: number }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <Image source={{ uri: imageUrl }} onError={() => setFailed(true)}
        style={{ height, width: '100%', backgroundColor: accent + '18' }} resizeMode="cover" />
    );
  }
  return (
    <View style={{ height, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: height * 0.55 }}>{emoji || '🍽️'}</Text>
    </View>
  );
}

const KIND_META: Record<AskCubeProposal['kind'], { label: string; icon: any; accent: string }> = {
  event:   { label: 'Event draft',   icon: Calendar,      accent: 'primary' },
  quest:   { label: 'Quest draft',   icon: ClipboardList, accent: 'kid' },
  grocery: { label: 'Grocery draft', icon: ShoppingCart,  accent: 'teal' },
  meal:    { label: 'Meal draft',    icon: ChefHat,       accent: 'amber' },
};

function memberName(members: FamilyMember[], id?: string | null) {
  return id ? members.find(m => m.id === id)?.name : undefined;
}

export default function AskCubeProposalCard({
  proposal, members, onDiscard, onCreate, onExpand, compact,
}: {
  proposal: AskCubeProposal;
  members: FamilyMember[];
  onDiscard: () => void;
  onCreate: () => void;
  onExpand?: () => void;
  // Tight grid layout — used when several meal options are shown side by
  // side (2 per row) instead of stacked full-width, so picking between
  // options doesn't mean scrolling through 3 tall cards in a row.
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const meta = KIND_META[proposal.kind];
  const accent = (colors as any)[meta.accent] ?? colors.primary;
  const Icon = meta.icon;
  const d = proposal.data;

  if (compact && proposal.kind === 'meal') {
    return (
      <View style={{ backgroundColor: colors.card, borderRadius: 14,
        borderWidth: 1.5, borderColor: accent + '40', overflow: 'hidden' }}>
        <Pressable onPress={onExpand} disabled={!onExpand}>
          <MealHero imageUrl={d.imageUrl} emoji={d.emoji} accent={accent} height={72} />
          <Pressable onPress={onDiscard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
              backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <X size={12} color="#fff" />
          </Pressable>
        </Pressable>
        <Pressable onPress={onExpand} disabled={!onExpand} style={{ padding: 10, gap: 4 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{d.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!d.prepMinutes && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Clock size={10} color={accent} />
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: accent }}>{d.prepMinutes}m</Text>
              </View>
            )}
            <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }} numberOfLines={1}>
              {d.day}{d.mealType ? ` · ${d.mealType}` : ''}
            </Text>
          </View>
        </Pressable>
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          <Pressable onPress={onCreate}
            style={{ borderRadius: 8, paddingVertical: 7, alignItems: 'center', backgroundColor: accent }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>Pick this</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const Header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon size={14} color={accent} />
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {meta.label}
      </Text>
    </View>
  );

  const Actions = (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
      <Pressable onPress={onDiscard}
        style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Discard</Text>
      </Pressable>
      <Pressable onPress={onCreate}
        style={{ flex: 2, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: accent }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
          {proposal.kind === 'grocery' ? `Add ${d.items?.length ?? ''} item${d.items?.length === 1 ? '' : 's'}` : 'Create'}
        </Text>
      </Pressable>
    </View>
  );

  const cardBase = {
    marginTop: 8, maxWidth: '90%' as const, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1.5, borderColor: accent + '40', padding: 14, gap: 8,
  };

  if (proposal.kind === 'meal') {
    const chef = memberName(members, d.chefId);
    return (
      <View style={{ marginTop: 8, maxWidth: '90%', backgroundColor: colors.card,
        borderRadius: 16, borderWidth: 1.5, borderColor: accent + '40', overflow: 'hidden' }}>
        {/* Real dish photo when the model supplied one, else the emoji hero.
            The whole card (not just the hero band) opens the recipe detail
            sheet — a bigger, more obvious tap target than the image alone. */}
        <Pressable onPress={onExpand} disabled={!onExpand}>
          <MealHero imageUrl={d.imageUrl} emoji={d.emoji} accent={accent} height={110} />
        </Pressable>
        <Pressable onPress={onExpand} disabled={!onExpand} style={{ padding: 14, gap: 8 }}>
          {Header}
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{d.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: -4 }}>
            {d.day}{d.mealType ? ` · ${d.mealType}` : ''} · tap to view recipe
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {!!d.prepMinutes && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: accent + '14',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Clock size={12} color={accent} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent }}>{d.prepMinutes} min</Text>
              </View>
            )}
            {!!chef && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <User size={12} color={colors.textSecondary} />
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chef} cooking</Text>
              </View>
            )}
          </View>
          {!!d.ingredients?.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {d.ingredients.slice(0, 6).map((ing: string, i: number) => (
                <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{ing}</Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {Actions}
        </View>
      </View>
    );
  }

  if (proposal.kind === 'grocery') {
    const items: { name: string; quantity?: string; category?: string }[] = d.items ?? [];
    return (
      <View style={cardBase}>
        {Header}
        <View style={{ gap: 6 }}>
          {items.slice(0, 8).map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                {it.name}
              </Text>
              {!!it.quantity && (
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{it.quantity}</Text>
              )}
            </View>
          ))}
        </View>
        {Actions}
      </View>
    );
  }

  if (proposal.kind === 'quest') {
    const assignee = memberName(members, d.memberId);
    const assignedToAdult = !!d.memberId && members.find(m => m.id === d.memberId)?.role === 'parent';
    return (
      <View style={cardBase}>
        {Header}
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {!assignedToAdult && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Coins size={12} color={accent} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent }}>{d.coins ?? 20} coins</Text>
            </View>
          )}
          {!!assignee && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <User size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{assignee}</Text>
            </View>
          )}
          {!!d.dueDate && (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Due {d.dueDate}</Text>
          )}
          {!!d.photoRequired && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Camera size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Photo required</Text>
            </View>
          )}
        </View>
        {Actions}
      </View>
    );
  }

  // event
  const assignee = memberName(members, d.memberId);
  return (
    <View style={cardBase}>
      {Header}
      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {!!d.startAt && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
            {new Date(d.startAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
        {!!assignee && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <User size={12} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{assignee}</Text>
          </View>
        )}
        {!!d.category && (
          <View style={{ backgroundColor: accent + '16', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: accent }}>{d.category}</Text>
          </View>
        )}
      </View>
      {Actions}
    </View>
  );
}
