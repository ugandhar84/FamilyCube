/**
 * KioskMemoryFeed — the kiosk Memories tab's real, interactive album, two
 * cards per row.
 *
 * ── What this replaces, and why it isn't the phone card ─────────────────
 * The tab previously stacked a small read-only preview grid on top of the
 * phone's own MemoriesTab embedded unchanged — a SINGLE-column scrapbook
 * card, tilted, with corner-mount paper tabs, rendered at kiosk width. The
 * owner asked for two per row THROUGHOUT, including the real feed that
 * owns hearting, deleting, posting and the lightbox.
 *
 * The phone card is deliberately not reused for that. Its whole visual
 * argument (a -1.1deg tilt, 32px triangular corner mounts, a 340px-tall
 * carousel, a serif "note" caption with a dashed ledger rule) is calibrated
 * for a full-width card held at arm's length. At half a kiosk pane it reads
 * as cramped and gimmicky rather than tactile — the corner tabs alone would
 * eat a visible fraction of the photo. So the CARD here is kiosk's own
 * Hub-OS language (WidgetCard chrome, KIOSK_TYPO/SPACE/RADIUS/HIT,
 * useKioskColors) while the DATA and every ACTION come from the shared
 * useFamilyMemories hook the phone now uses too — same query, same realtime
 * subscription, same keyset pagination cursor, same heart/delete/post with
 * their notification side effects and RLS-aware error handling. A different
 * face on identical machinery, not a second implementation.
 *
 * ── Media sizing: the hardcoded-phone-width trap, avoided ───────────────
 * The phone card sizes its carousel to `SCREEN_W - 60` and caps it at a
 * fixed MEDIA_HEIGHT of 340px. Both are the exact bug class that breaks in
 * a half-width kiosk card: the width is a window-derived constant that has
 * no idea a nav rail and two levels of padding sit between it and the
 * photo, and the height is absolute rather than proportional, so a card
 * half as wide would still reserve a full-height photo well.
 *
 * Nothing here is derived from the window. The grid measures its own
 * CONTAINER with onLayout (the pattern KioskMemoryGrid established, reused
 * rather than reinvented), divides that by the column count with a
 * floor(), and every media box is sized by ASPECT RATIO off the resulting
 * column width. Rotation, Split View and a resized nav rail all stay
 * correct for free, because no number in this file is a screen constant.
 *
 * ── Layers ──────────────────────────────────────────────────────────────
 * This component IS the grid now. The separate small preview grid
 * (KioskMemoryGrid) is no longer rendered by the tab — two 2-column photo
 * grids stacked on each other, one of them read-only, is the redundancy the
 * owner was trying to remove, not a second layer worth keeping. See
 * KioskMemoriesTab's header for that call in full. KioskMemoryGrid itself
 * is left in place because KioskMemorySlideshow's sibling surfaces and the
 * Overview photo-frame widget still share its useKioskPhotos source.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, Image, Pressable, StyleSheet, Alert,
  useWindowDimensions, type StyleProp, type ViewStyle,
} from 'react-native';
import { Heart, Trash2, Play, Layers, Download } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import CubeSpinner from '@/components/CubeSpinner';
import { MediaViewer } from '@/components/MediaComponents';
import { saveMediaToDevice } from '@/lib/saveMedia';
import { fmtDateShort } from '@/lib/dates';
import { useFamilyStore } from '@/store/familyStore';
import {
  canDeleteMemory, type FamilyMemoriesApi, type Memory,
} from '@/features/vault/tabs/useFamilyMemories';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT, KIOSK_RAIL_WIDTH } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent, type KioskColors } from '../kioskPalette';
import { EmptyNote } from './KioskOS';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';

/** Owner-specified: two per row, in both portrait and landscape. */
const COLUMNS = 2;

/**
 * The photo well's shape. A proportion, never a pixel height — see the
 * header's note on the phone card's fixed 340px well. 4:3 keeps two cards
 * on a row short enough that a second row is visible without scrolling.
 */
const MEDIA_ASPECT = 4 / 3;

/** Occasion labels, matching the phone card's own wording exactly. */
const OCCASION_LABEL: Record<string, string> = {
  milestone: '🎂 a milestone', everyday: '☀️ just an everyday moment',
  celebration: '🎉 a celebration', just_because: '🌙 just because',
};

/** MemoriesTab's own typeAtIdx: anything not explicitly 'video' is a photo. */
const typeAt = (mem: Memory, i: number): 'photo' | 'video' =>
  mem.media_types?.[i] === 'video' ? 'video' : 'photo';

/**
 * The URL list for a memory, matching MemoriesTab's own `hasMulti` rule
 * exactly — photo_urls only counts when it holds 2+ entries, otherwise the
 * singular photo_url is the one item. Getting this wrong is what once made
 * single-photo posts render nothing at all on the phone.
 */
function urlsOf(mem: Memory): string[] {
  const hasMulti = !!mem.photo_urls?.length && mem.photo_urls.length > 1;
  if (hasMulti) return mem.photo_urls!;
  return mem.photo_url ? [mem.photo_url] : [];
}

// ─── One card ────────────────────────────────────────────────────────────

function MemoryCard({
  mem, width, myId, members, k, readOnly, highlighted,
  onHeart, onDelete, onOpenViewer,
}: {
  mem: Memory;
  /** The measured column width. Every inner dimension derives from this. */
  width: number;
  myId: string;
  members: ReturnType<typeof useFamilyStore.getState>['members'];
  // No `isDark` here on purpose: every color this card paints comes from a
  // `k` token, and those already resolve per mode. A card that additionally
  // branched on isDark would be a second, divergent source of that answer.
  k: KioskColors;
  readOnly: boolean;
  highlighted: boolean;
  onHeart: () => void;
  onDelete: () => void;
  onOpenViewer: (urls: string[], index: number, types: ('photo' | 'video')[]) => void;
}) {
  const urls = urlsOf(mem);
  if (!urls.length) return null;

  const poster = members.find(m => m.id === mem.created_by);
  const posterName = poster?.name?.split(' ')[0] ?? 'Family';
  const accent = kioskRoleAccent(k, poster?.role);
  const hearted = !!mem.hearted_by?.includes(myId);
  // The same poster-or-parent rule the phone card uses, from the same
  // shared helper — a senior kiosk profile additionally never sees it.
  const canDelete = !readOnly && canDeleteMemory(mem, myId, members);
  const heroType = typeAt(mem, 0);

  // Proportional, not absolute: the well is as tall as this column is wide,
  // divided by the aspect. A narrower column yields a shorter photo.
  const mediaHeight = Math.round(width / MEDIA_ASPECT);

  // Composer defaults "who was there" to just the poster, so a solo post
  // tags its own poster — the header already names them, so showing it
  // again reads as duplication, not information. Same filter as the phone.
  const tagged = (mem.tagged_member_ids ?? [])
    .filter(id => id !== mem.created_by)
    .map(id => members.find(m => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m);

  const occasion = mem.tag ? OCCASION_LABEL[mem.tag] : undefined;
  const heartLabel = mem.hearts === 1 ? '1 love' : `${mem.hearts} loves`;

  return (
    <View
      style={[
        s.card,
        {
          width,
          backgroundColor: k.card,
          borderColor: highlighted ? k.primary : k.cardBorder,
          borderWidth: highlighted ? 2 : 1,
        },
      ]}
    >
      {/* ── Photo well ── */}
      <Pressable
        onPress={() => onOpenViewer(urls, 0, urls.map((_, i) => typeAt(mem, i)))}
        style={({ pressed }) => [
          s.media,
          { height: mediaHeight, backgroundColor: k.well, opacity: pressed ? 0.88 : 1 },
        ]}
        accessibilityRole="imagebutton"
        accessibilityLabel={
          `${heroType === 'video' ? 'Video' : 'Photo'} by ${posterName}` +
          `${mem.description ? `, ${mem.description}` : ''}`
        }
        accessibilityHint="Opens full screen"
      >
        <Image source={{ uri: urls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />

        {/* A video's poster frame is the still the storage URL resolves to;
            the badge is what tells someone it will play, since nothing
            here autoplays. Several muted videos autoplaying across a
            2-column wall display is noise, not life — the lightbox plays. */}
        {heroType === 'video' && (
          <View style={s.badge} pointerEvents="none">
            <Play size={13} color="#F7F2EE" fill="#F7F2EE" />
          </View>
        )}
        {urls.length > 1 && (
          <View style={[s.badge, s.badgeRight]} pointerEvents="none">
            <Layers size={12} color="#F7F2EE" />
            <Text style={s.badgeText}>{urls.length}</Text>
          </View>
        )}

        {/* Caption-on-photo, when the poster chose that in the composer —
            the same caption_overlay flag the phone card honors. The plate
            is a fixed translucent dark in both modes rather than a palette
            token: it sits on an arbitrary photograph, so its contrast has
            to come from the plate. Same rule as the slideshow's caption. */}
        {mem.caption_overlay && !!mem.description && (
          <View style={s.overlay} pointerEvents="none">
            <Text style={s.overlayText} numberOfLines={2}>{mem.description}</Text>
          </View>
        )}
      </Pressable>

      {/* ── Body ── */}
      <View style={s.body}>
        <View style={s.posterRow}>
          <FamilyAvatar
            name={poster?.name ?? 'Family'} emoji={poster?.emoji} avatarUrl={poster?.avatarUrl}
            siblings={members.map(m => m.name)} size={30} ringColor={accent} ringWidth={1.5}
          />
          <View style={s.posterText}>
            <Text style={[s.posterName, { color: k.text }]} numberOfLines={1}>{posterName}</Text>
            <Text style={[s.posterMeta, { color: k.textFaint }]} numberOfLines={1}>
              {fmtDateShort(mem.date)}{occasion ? ` · ${occasion}` : ''}
            </Text>
          </View>
          {canDelete && (
            <Pressable
              onPress={onDelete}
              hitSlop={KIOSK_SPACE.md}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${posterName}'s memory`}
              accessibilityHint="Asks to confirm, then removes this memory for everyone"
            >
              <Trash2 size={17} color={k.textFaint} />
            </Pressable>
          )}
        </View>

        {/* Caption below the photo — suppressed when it is already shown ON
            the photo, the same rule the phone card applies. */}
        {!!mem.description && !mem.caption_overlay && (
          <Text style={[s.caption, { color: k.textMuted }]} numberOfLines={3}>
            {mem.description}
          </Text>
        )}

        {tagged.length > 0 && (
          <Text style={[s.tagged, { color: k.textFaint }]} numberOfLines={1}>
            with {tagged.map(m => m.name.split(' ')[0]).join(', ')}
          </Text>
        )}

        <View style={s.actions}>
          <Pressable
            onPress={onHeart}
            style={({ pressed }) => [
              s.heartBtn,
              {
                backgroundColor: hearted ? k.dangerSoft : 'transparent',
                borderColor: hearted ? k.dangerEdge : k.cardBorder,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: hearted }}
            accessibilityLabel={hearted ? 'Remove your love' : 'Love this memory'}
            accessibilityHint={`Currently ${heartLabel}`}
          >
            <Heart
              size={17}
              color={hearted ? k.danger : k.textMuted}
              fill={hearted ? k.danger : 'transparent'}
            />
            <Text
              style={[s.heartCount, { color: hearted ? k.danger : k.textMuted }]}
              numberOfLines={1}
            >
              {mem.hearts > 0 ? mem.hearts : 'Love'}
            </Text>
          </Pressable>

          {mem.hearts > 0 && (
            <Pressable
              onPress={() => {
                const names = (mem.hearted_by ?? [])
                  .map(id => members.find(m => m.id === id)?.name?.split(' ')[0])
                  .filter(Boolean);
                Alert.alert('Loved by', names.length ? names.join(', ') : heartLabel);
              }}
              hitSlop={KIOSK_SPACE.sm}
              accessibilityRole="button"
              accessibilityLabel={`${heartLabel}. Show who`}
            >
              <Text style={[s.lovedBy, { color: k.textFaint }]} numberOfLines={1}>
                {heartLabel}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── The grid ────────────────────────────────────────────────────────────

export function KioskMemoryFeed({
  api, readOnly = false, focusMemoryId, onFocusMemoryLayout, style,
}: {
  /** The shared hook's real data and actions, owned by the tab. */
  api: FamilyMemoriesApi;
  /** Senior/grandparent gate — hides every mutating affordance. */
  readOnly?: boolean;
  /** A notification deep-link target, ringed and reported for scroll-to. */
  focusMemoryId?: string | null;
  onFocusMemoryLayout?: (y: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { k } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const members = useFamilyStore(s => s.members);
  const { memories, loading, loadingMore, myId, heartMemory, deleteMemory } = api;

  const [gridWidth, setGridWidth] = useState(0);
  const { width: winWidth } = useWindowDimensions();

  const [viewer, setViewer] = useState<{ urls: string[]; types: ('photo' | 'video')[]; index: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // The lightbox is a native Modal — it renders in its own window, so no
  // touch inside it ever reaches KioskScreen's root onTouchStart. Hold the
  // idle lock while it is open, exactly as KioskChatTab does for its own
  // lightboxes, so browsing photos is never mistaken for an idle device.
  useKioskLockSuspended(viewer !== null);

  const GAP = KIOSK_SPACE.md;
  // Window-minus-rail-minus-padding is only ever used for the first frame,
  // before onLayout reports the real container width. Nothing after that
  // frame is derived from the window — see this file's header.
  const containerWidth = gridWidth > 0
    ? gridWidth
    : Math.max(0, winWidth - KIOSK_RAIL_WIDTH - KIOSK_SPACE.lg * 2 - KIOSK_SPACE.md * 2);

  // floor() rather than a percentage: two cards at 50% plus a real gap
  // between them overflows the row by exactly the gap, which on a wrapping
  // row silently drops the second card to its own line — a 1-up layout
  // wearing a 2-up stylesheet.
  const cardWidth = Math.max(0, Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS));

  const openViewer = useCallback((urls: string[], index: number, types: ('photo' | 'video')[]) => {
    registerActivity();
    setViewer({ urls, types, index });
  }, [registerActivity]);

  const handleSave = useCallback(async () => {
    if (!viewer) return;
    setSaving(true);
    try {
      const activeType = viewer.types[viewer.index] ?? 'photo';
      const result = await saveMediaToDevice(viewer.urls[viewer.index], activeType);
      if (result === 'saved') Alert.alert('Saved', `${activeType === 'video' ? 'Video' : 'Photo'} saved to your library.`);
    } catch (e: any) {
      Alert.alert('Couldn\'t save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [viewer]);

  if (loading) {
    return (
      <View style={s.loading}>
        <CubeSpinner size={28} />
      </View>
    );
  }

  if (memories.length === 0) {
    // Wrapped rather than passing `style` straight to EmptyNote — the prop
    // this component takes is a ViewStyle (it lays out a grid), while
    // EmptyNote's is a TextStyle. Casting between them would compile and
    // then silently drop any layout the caller actually passed.
    return (
      <View style={style}>
        <EmptyNote
          text={readOnly
            ? 'No family photos yet.'
            : 'No family photos yet. Add one and it\'ll show up here.'}
          k={k}
        />
      </View>
    );
  }

  return (
    <>
      <View
        style={[s.grid, { gap: GAP }, style]}
        onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
      >
        {memories.map(mem => (
          <View
            key={mem.id}
            onLayout={mem.id === focusMemoryId
              ? e => onFocusMemoryLayout?.(e.nativeEvent.layout.y)
              : undefined}
          >
            <MemoryCard
              mem={mem}
              width={cardWidth || 1}
              myId={myId}
              members={members}
              k={k}
              readOnly={readOnly}
              highlighted={mem.id === focusMemoryId}
              onHeart={() => { registerActivity(); heartMemory(mem); }}
              onDelete={() => { registerActivity(); deleteMemory(mem.id); }}
              onOpenViewer={openViewer}
            />
          </View>
        ))}
        {/* An odd card count leaves a hole in the last row. A flexible
            spacer keeps the final card at its real column width instead of
            letting the row stretch it. */}
        {memories.length % COLUMNS !== 0 && (
          <View style={{ width: cardWidth || undefined }} pointerEvents="none" />
        )}
      </View>

      {loadingMore && (
        <View style={s.loadingMore}>
          <CubeSpinner size={22} />
        </View>
      )}

      {/* The real MediaViewer the phone uses — it is presentation-only and
          sizes itself off the window, which is correct for a FULLSCREEN
          surface (unlike the phone card's inline carousel, which is why
          that one couldn't be reused). Same save-to-device affordance the
          phone offers over it. */}
      {viewer && (
        <>
          <MediaViewer
            visible
            mediaType={viewer.types[viewer.index] ?? 'photo'}
            uri={viewer.urls[viewer.index]}
            urls={viewer.urls.length > 1 ? viewer.urls : undefined}
            startIndex={viewer.index}
            onClose={() => { registerActivity(); setViewer(null); }}
          />
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [s.saveBtn, (pressed || saving) && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Saving to Photos' : 'Save to Photos'}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? <CubeSpinner size={16} /> : <Download size={16} color="#fff" />}
            <Text style={s.saveText} numberOfLines={1}>
              {saving ? 'Saving…' : 'Save to Photos'}
            </Text>
          </Pressable>
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  loading: { alignItems: 'center', paddingVertical: KIOSK_SPACE.xl },
  loadingMore: { alignItems: 'center', paddingVertical: KIOSK_SPACE.lg },

  card: {
    borderRadius: KIOSK_RADIUS.lg,
    overflow: 'hidden',
  },
  media: { width: '100%', justifyContent: 'flex-end' },
  badge: {
    position: 'absolute', top: KIOSK_SPACE.sm, left: KIOSK_SPACE.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: KIOSK_SPACE.xs, paddingVertical: 3,
    borderRadius: KIOSK_RADIUS.full,
    backgroundColor: 'rgba(10,8,7,0.62)',
  },
  badgeRight: { left: undefined, right: KIOSK_SPACE.sm },
  badgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', color: '#F7F2EE' },
  overlay: {
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
    backgroundColor: 'rgba(10,8,7,0.62)',
  },
  overlayText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', color: '#F7F2EE' },

  body: { padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.xs },
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  posterText: { flex: 1, minWidth: 0 },
  posterName: { fontSize: KIOSK_TYPO.body, fontWeight: '800', letterSpacing: -0.2 },
  posterMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 1 },
  iconBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min,
    alignItems: 'center', justifyContent: 'center',
  },
  caption: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: 19 },
  tagged: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },

  actions: {
    flexDirection: 'row', alignItems: 'center',
    gap: KIOSK_SPACE.sm, marginTop: 2,
  },
  heartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
  },
  heartCount: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  lovedBy: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', flexShrink: 1 },

  // Sits over the fullscreen MediaViewer, which is a black surface in both
  // modes — so this plate is fixed, not palette-driven, same as the phone's.
  saveBtn: {
    position: 'absolute', bottom: 50, alignSelf: 'center', zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: KIOSK_RADIUS.full,
    paddingHorizontal: KIOSK_SPACE.lg, minHeight: KIOSK_HIT.control,
  },
  saveText: { fontSize: KIOSK_TYPO.body, fontWeight: '800', color: '#fff' },
});
