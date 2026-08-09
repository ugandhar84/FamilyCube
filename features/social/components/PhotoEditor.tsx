/**
 * PhotoEditor — full-screen photo editing modal.
 * Tools: Stickers · Frames · Caption · Text · Layers
 *
 * Layout: canvas fills available space; tool panels are absolutely-positioned
 * overlays that sit above the toolbar and shift up with KeyboardAvoidingView
 * so they are never hidden by the keyboard.
 *
 * Text layers: tap to select (shows floating edit/delete controls),
 * tap "Edit" to re-open the text panel with existing content pre-filled,
 * drag to reposition. Font family, size, color, bold/italic/outline all
 * editable both before placing and after via the selected-layer controls.
 */

import React, { useRef, useState, useCallback, memo, useEffect } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Dimensions, Platform, PanResponder, KeyboardAvoidingView,
  Pressable, Image as RNImage,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');
const STICKER_SIZE = 96;

// Fixed chrome heights — keep in sync with the StyleSheet below
const TOPBAR_H  = 56;
const TOOLBAR_H = 66;

// ─── CDN helper ───────────────────────────────────────────────────────────────
const om = (hex: string) =>
  `https://cdn.jsdelivr.net/npm/openmoji@15.1.0/color/618x618/${hex}.png`;

// ─── Sticker types ────────────────────────────────────────────────────────────
interface StickerDef { id: string; emoji?: string; uri?: string; }
interface StickerPack { id: string; label: string; icon: string; stickers: StickerDef[]; }

const STICKER_PACKS: StickerPack[] = [
  {
    id: 'props', label: 'Props', icon: '🎩',
    stickers: [
      { id: 'tophat',    emoji: '🎩' }, { id: 'crown',     emoji: '👑' },
      { id: 'sunglasses',emoji: '🕶️' }, { id: 'disguise',  emoji: '🥸' },
      { id: 'cap',       emoji: '🧢' }, { id: 'sunhat',    emoji: '👒' },
      { id: 'grad',      emoji: '🎓' }, { id: 'wand',      emoji: '🪄' },
      { id: 'clown',     emoji: '🤡' }, { id: 'beard',     emoji: '🧔' },
      { id: 'mask',      emoji: '🎭' }, { id: 'monocle',   emoji: '🧐' },
      { id: 'bow',       emoji: '🎀' }, { id: 'ribbon',    emoji: '🎗️' },
      { id: 'glasses2',  emoji: '👓' }, { id: 'scarf',     emoji: '🧣' },
      { id: 'gloves',    emoji: '🧤' }, { id: 'mittens',   emoji: '🧤' },
      { id: 'tiara',     emoji: '💍' }, { id: 'bowtie',    emoji: '🎀' },
    ],
  },
  {
    id: 'silly', label: 'Silly', icon: '😜',
    stickers: [
      { id: 'crazy',     emoji: '🤪' }, { id: 'cool',      emoji: '😎' },
      { id: 'party',     emoji: '🥳' }, { id: 'nerd',      emoji: '🤓' },
      { id: 'alien',     emoji: '👽' }, { id: 'robot',     emoji: '🤖' },
      { id: 'ghost',     emoji: '👻' }, { id: 'skull',     emoji: '💀' },
      { id: 'ogre',      emoji: '👹' }, { id: 'zombie',    emoji: '🧟' },
      { id: 'wizard',    emoji: '🧙' }, { id: 'superhero', emoji: '🦸' },
      { id: 'ninja',     emoji: '🥷' }, { id: 'pirate',    emoji: '🏴‍☠️' },
      { id: 'vampire',   emoji: '🧛' }, { id: 'mermaid',   emoji: '🧜' },
      { id: 'genie',     emoji: '🧞' }, { id: 'elf',       emoji: '🧝' },
      { id: 'devil',     emoji: '😈' }, { id: 'angel',     emoji: '😇' },
      { id: 'poop',      emoji: '💩' }, { id: 'clapping',  emoji: '👏' },
    ],
  },
  {
    id: 'animals', label: 'Animals', icon: '🐾',
    stickers: [
      { id: 'dog',       uri: om('1F436') }, { id: 'cat',       uri: om('1F431') },
      { id: 'rabbit',    uri: om('1F430') }, { id: 'fox',       uri: om('1F98A') },
      { id: 'bear',      uri: om('1F43B') }, { id: 'panda',     uri: om('1F43C') },
      { id: 'koala',     uri: om('1F428') }, { id: 'hamster',   uri: om('1F439') },
      { id: 'penguin',   uri: om('1F427') }, { id: 'parrot',    uri: om('1F99C') },
      { id: 'butterfly', uri: om('1F98B') }, { id: 'unicorn',   uri: om('1F984') },
      { id: 'frog',      uri: om('1F438') }, { id: 'crab',      uri: om('1F980') },
      { id: 'turtle',    uri: om('1F422') }, { id: 'owl',       uri: om('1F989') },
      { id: 'duck',      uri: om('1F986') }, { id: 'flamingo',  uri: om('1F9A9') },
      { id: 'deer',      uri: om('1F98C') }, { id: 'hedgehog',  uri: om('1F994') },
      { id: 'sloth',     uri: om('1F9A5') }, { id: 'otter',     uri: om('1F9A6') },
      { id: 'skunk',     uri: om('1F9A8') }, { id: 'mammoth',   uri: om('1F9A3') },
      { id: 'bison',     uri: om('1F9AC') }, { id: 'beaver',    uri: om('1F9AB') },
    ],
  },
  {
    id: 'party', label: 'Party', icon: '🎉',
    stickers: [
      { id: 'popper',    uri: om('1F389') }, { id: 'confetti',  uri: om('1F38A') },
      { id: 'balloon',   uri: om('1F388') }, { id: 'cake',      uri: om('1F382') },
      { id: 'trophy',    uri: om('1F3C6') }, { id: 'gift',      uri: om('1F381') },
      { id: 'fireworks', uri: om('1F386') }, { id: 'disco',     uri: om('1F57A') },
      { id: 'pinata',    uri: om('1FA85') }, { id: 'partying',  uri: om('1F973') },
      { id: 'sparkler',  uri: om('1F387') }, { id: 'star2',     uri: om('1F31F') },
      { id: 'medal',     uri: om('1F3C5') }, { id: 'ribbon2',   uri: om('1F397') },
      { id: 'champagne', uri: om('1F37E') }, { id: 'clinking',  uri: om('1F942') },
      { id: 'icecream',  uri: om('1F368') }, { id: 'cotton',    uri: om('1F9F8') },
    ],
  },
  {
    id: 'love', label: 'Love', icon: '💕',
    stickers: [
      { id: 'redheart',  uri: om('2764-FE0F') }, { id: 'twohearts',  uri: om('1F495') },
      { id: 'sparkling', uri: om('1F496')     }, { id: 'rose',       uri: om('1F339') },
      { id: 'kiss',      uri: om('1F48B')     }, { id: 'heartface',  uri: om('1F970') },
      { id: 'hearteyes', uri: om('1F60D')     }, { id: 'cupid',      uri: om('1F498') },
      { id: 'bouquet',   uri: om('1F490')     }, { id: 'heartbox',   uri: om('1F49D') },
      { id: 'orangehrt', uri: om('1F9E1')     }, { id: 'yellowhrt',  uri: om('1F49B') },
      { id: 'greenhrt',  uri: om('1F49A')     }, { id: 'bluehrt',    uri: om('1F499') },
      { id: 'purplehrt', uri: om('1F49C')     }, { id: 'brownhrt',   uri: om('1F90E') },
      { id: 'whitehrt',  uri: om('1F90D')     }, { id: 'pinkhrt',    uri: om('1FA77') },
      { id: 'tulip',     uri: om('1F337')     }, { id: 'hibiscus',   uri: om('1F33A') },
    ],
  },
  {
    id: 'food', label: 'Food', icon: '🍔',
    stickers: [
      { id: 'cupcake',   uri: om('1F9C1') }, { id: 'lollipop',  uri: om('1F36D') },
      { id: 'donut',     uri: om('1F369') }, { id: 'pizza',     uri: om('1F355') },
      { id: 'avocado',   uri: om('1F951') }, { id: 'popcorn',   uri: om('1F37F') },
      { id: 'cookie',    uri: om('1F36A') }, { id: 'taco',      uri: om('1F32E') },
      { id: 'sushi',     uri: om('1F363') }, { id: 'hotdog',    uri: om('1F32D') },
      { id: 'burger',    uri: om('1F354') }, { id: 'fries',     uri: om('1F35F') },
      { id: 'icecream2', uri: om('1F366') }, { id: 'waffle',    uri: om('1F9C7') },
      { id: 'pretzel',   uri: om('1F968') }, { id: 'bagel',     uri: om('1F96F') },
      { id: 'croissant', uri: om('1F950') }, { id: 'pancakes',  uri: om('1F95E') },
      { id: 'sandwich',  uri: om('1F96A') }, { id: 'wrap',      uri: om('1F32F') },
      { id: 'noodles',   uri: om('1F35C') }, { id: 'ramen',     uri: om('1F35C') },
      { id: 'dumpling',  uri: om('1F95F') }, { id: 'fried',     uri: om('1F373') },
      { id: 'steak',     uri: om('1F969') }, { id: 'cheese',    uri: om('1F9C0') },
    ],
  },
  {
    id: 'drinks', label: 'Drinks', icon: '🧃',
    stickers: [
      { id: 'bubbletea', uri: om('1F9CB') }, { id: 'coffee',    uri: om('2615') },
      { id: 'matcha',    uri: om('1F375') }, { id: 'juice',     uri: om('1F9C3') },
      { id: 'milk',      uri: om('1F95B') }, { id: 'smoothie',  uri: om('1F9C9') },
      { id: 'tropical',  uri: om('1F379') }, { id: 'cocktail',  uri: om('1F378') },
      { id: 'beer',      uri: om('1F37A') }, { id: 'wine',      uri: om('1F377') },
      { id: 'champagne', uri: om('1F37E') }, { id: 'clinking',  uri: om('1F942') },
      { id: 'teacup',    uri: om('1F375') }, { id: 'hotbev',    uri: om('2615') },
      { id: 'icedcof',   uri: om('1F9CA') }, { id: 'coconut',   uri: om('1F965') },
      { id: 'lemonade',  uri: om('1F9C2') }, { id: 'cider',     uri: om('1F37B') },
      { id: 'soda',      uri: om('1F9C3') }, { id: 'bottle',    uri: om('1F9F4') },
    ],
  },
  {
    id: 'hats', label: 'Hats', icon: '🎩',
    stickers: [
      { id: 'tophat2',   emoji: '🎩' }, { id: 'crown2',    emoji: '👑' },
      { id: 'cap2',      emoji: '🧢' }, { id: 'sunhat2',   emoji: '👒' },
      { id: 'grad2',     emoji: '🎓' }, { id: 'beret',     emoji: '🪖' },
      { id: 'helmet',    emoji: '⛑️' }, { id: 'cowboy',    emoji: '🤠' },
      { id: 'tophatbig', emoji: '🎩' }, { id: 'wizard2',   emoji: '🧙' },
      { id: 'elf2',      emoji: '🧝' }, { id: 'santa',     emoji: '🎅' },
      { id: 'snowcap',   emoji: '⛄' }, { id: 'jester',    emoji: '🃏' },
      { id: 'turban',    emoji: '👳' }, { id: 'pirate2',   emoji: '☠️' },
      { id: 'detective', emoji: '🕵️' }, { id: 'astronaut', emoji: '👨‍🚀' },
      { id: 'ninja2',    emoji: '🥷' }, { id: 'superhero2',emoji: '🦸' },
    ],
  },
  {
    id: 'glasses', label: 'Glasses', icon: '👓',
    stickers: [
      { id: 'glasses3',  emoji: '👓' }, { id: 'shades',    emoji: '🕶️' },
      { id: 'nerd2',     emoji: '🤓' }, { id: 'disguise2', emoji: '🥸' },
      { id: 'monocle2',  emoji: '🧐' }, { id: 'cool2',     emoji: '😎' },
      { id: 'hearteye2', emoji: '😍' }, { id: 'starstr',   emoji: '🤩' },
      { id: 'wink',      emoji: '😉' }, { id: 'squint',    emoji: '😏' },
      { id: 'peek',      emoji: '👀' }, { id: 'magnify',   emoji: '🔍' },
      { id: 'telescope', emoji: '🔭' }, { id: 'microscope',emoji: '🔬' },
      { id: 'camera2',   emoji: '📷' }, { id: 'film',      emoji: '🎬' },
      { id: 'vr',        emoji: '🥽' }, { id: '3d',        emoji: '🎭' },
      { id: 'safety',    emoji: '🥽' }, { id: 'swim2',     emoji: '🏊' },
    ],
  },
  {
    id: 'nature', label: 'Nature', icon: '🌿',
    stickers: [
      { id: 'sunflower', uri: om('1F33B') }, { id: 'mushroom',  uri: om('1F344') },
      { id: 'cactus',    uri: om('1F335') }, { id: 'palm',      uri: om('1F334') },
      { id: 'cherry',    uri: om('1F338') }, { id: 'maple',     uri: om('1F341') },
      { id: 'seedling',  uri: om('1F331') }, { id: 'herb',      uri: om('1F33F') },
      { id: 'clover',    uri: om('1F340') }, { id: 'bamboo',    uri: om('1F38D') },
      { id: 'shell',     uri: om('1F41A') }, { id: 'snail',     uri: om('1F40C') },
      { id: 'ladybug',   uri: om('1F41E') }, { id: 'bee',       uri: om('1F41D') },
      { id: 'dragonfly', uri: om('1FAB0') }, { id: 'worm',      uri: om('1FAB1') },
      { id: 'feather',   uri: om('1FAB6') }, { id: 'rock',      uri: om('1FAA8') },
      { id: 'wood',      uri: om('1FAB5') }, { id: 'nest',      uri: om('1FAB9') },
    ],
  },
  {
    id: 'sports', label: 'Sports', icon: '⚽',
    stickers: [
      { id: 'soccer',    uri: om('26BD')  }, { id: 'basketball',uri: om('1F3C0') },
      { id: 'football',  uri: om('1F3C8') }, { id: 'baseball',  uri: om('26BE')  },
      { id: 'tennis',    uri: om('1F3BE') }, { id: 'volleyball',uri: om('1F3D0') },
      { id: 'rugby',     uri: om('1F3C9') }, { id: 'frisbee',   uri: om('1F94F') },
      { id: 'snowboard', uri: om('1F3C2') }, { id: 'ski',       uri: om('26F7')  },
      { id: 'swim',      uri: om('1F3CA') }, { id: 'cycle',     uri: om('1F6B4') },
      { id: 'run',       uri: om('1F3C3') }, { id: 'hike',      uri: om('1F9D7') },
      { id: 'yoga',      uri: om('1F9D8') }, { id: 'weights',   uri: om('1F3CB') },
      { id: 'boxing',    uri: om('1F94A') }, { id: 'martial',   uri: om('1F94B') },
      { id: 'archery',   uri: om('1F3F9') }, { id: 'fishing',   uri: om('1F3A3') },
    ],
  },
  {
    id: 'weather', label: 'Weather', icon: '🌈',
    stickers: [
      { id: 'rainbow',   uri: om('1F308') }, { id: 'sun',       uri: om('2600-FE0F') },
      { id: 'cloud',     uri: om('2601-FE0F') }, { id: 'rain',  uri: om('1F327') },
      { id: 'lightning', uri: om('26A1') }, { id: 'snow',      uri: om('2744-FE0F') },
      { id: 'snowman',   uri: om('26C4') }, { id: 'fog',       uri: om('1F32B') },
      { id: 'wind',      uri: om('1F32C') }, { id: 'cyclone',   uri: om('1F300') },
      { id: 'comet',     uri: om('2604-FE0F') }, { id: 'moon',  uri: om('1F315') },
      { id: 'crescent',  uri: om('1F319') }, { id: 'star',     uri: om('2B50') },
      { id: 'shooting',  uri: om('1F320') }, { id: 'galaxy',   uri: om('1F30C') },
      { id: 'sunrise',   uri: om('1F305') }, { id: 'sunset',   uri: om('1F307') },
      { id: 'night',     uri: om('1F303') }, { id: 'aurora',   uri: om('1F304') },
    ],
  },
  {
    id: 'vibes', label: 'Vibes', icon: '✨',
    stickers: [
      { id: 'sparkles',  uri: om('2728')  }, { id: 'fire',      uri: om('1F525') },
      { id: 'hundrd',    uri: om('1F4AF') }, { id: 'checkmark', uri: om('2705')  },
      { id: 'thumbsup',  uri: om('1F44D') }, { id: 'thumbsdn',  uri: om('1F44E') },
      { id: 'muscle',    uri: om('1F4AA') }, { id: 'peace',     uri: om('270C-FE0F') },
      { id: 'ok',        uri: om('1F44C') }, { id: 'wave',      uri: om('1F44B') },
      { id: 'highfive',  uri: om('1F91A') }, { id: 'crossed',   uri: om('1F91E') },
      { id: 'metal',     uri: om('1F918') }, { id: 'call',      uri: om('1F919') },
      { id: 'point',     uri: om('1F447') }, { id: 'pray',      uri: om('1F64F') },
      { id: 'eyes',      uri: om('1F440') }, { id: 'brain',     uri: om('1F9E0') },
      { id: 'crown2',    uri: om('1F451') }, { id: 'gem',       uri: om('1F48E') },
      { id: 'money',     uri: om('1F4B0') }, { id: 'rocket2',   uri: om('1F680') },
      { id: 'rainbow2',  uri: om('1F308') }, { id: 'zap',       uri: om('26A1') },
    ],
  },
];

// ─── Frame definitions ─────────────────────────────────────────────────────────
interface FrameDef {
  id: string; label: string; emoji: string;
  borderColor: string; borderWidth: number; cornerEmoji: string;
  topBanner?: string; bottomBanner?: string; bannerBg?: string; bannerText?: string;
}

const FRAMES: FrameDef[] = [
  { id: 'paw',       label: 'Paw Prints', emoji: '🐾', borderColor: '#9B59B6', borderWidth: 7,  cornerEmoji: '🐾' },
  { id: 'summer',    label: 'Summer',     emoji: '☀️', borderColor: '#FF6B9D', borderWidth: 8,  cornerEmoji: '🦀', topBanner: 'SUMMER VIBES ☀️',    bottomBanner: 'summer time 🌊',     bannerBg: '#FF6B9D', bannerText: '#fff' },
  { id: 'birthday',  label: 'Birthday',   emoji: '🎂', borderColor: '#F59E0B', borderWidth: 7,  cornerEmoji: '🎉', topBanner: '🎂 HAPPY BIRTHDAY 🎂',                                     bannerBg: '#FDE68A', bannerText: '#92400E' },
  { id: 'adventure', label: 'Adventure',  emoji: '🌿', borderColor: '#22C55E', borderWidth: 6,  cornerEmoji: '🌿',                                  bottomBanner: '🐾 Adventure Time',  bannerBg: '#166534', bannerText: '#fff' },
  { id: 'royal',     label: 'Royal',      emoji: '👑', borderColor: '#EAB308', borderWidth: 7,  cornerEmoji: '✨', topBanner: '👑 ROYAL PET 👑',                                          bannerBg: '#713F12', bannerText: '#FDE68A' },
  { id: 'love',      label: 'Love',       emoji: '💕', borderColor: '#F43F5E', borderWidth: 6,  cornerEmoji: '💕',                                  bottomBanner: 'loved & cherished 💕', bannerBg: '#F43F5E', bannerText: '#fff' },
  { id: 'space',     label: 'Space Pup',  emoji: '🚀', borderColor: '#3B82F6', borderWidth: 7,  cornerEmoji: '⭐', topBanner: '🚀 SPACE PUP 🚀',                                          bannerBg: '#1E3A5F', bannerText: '#93C5FD' },
  { id: 'halloween', label: 'Halloween',  emoji: '🎃', borderColor: '#F97316', borderWidth: 7,  cornerEmoji: '🦇', topBanner: '🎃 TRICK OR TREAT 🎃',                                     bannerBg: '#431407', bannerText: '#FB923C' },
  { id: 'xmas',      label: 'Christmas',  emoji: '🎄', borderColor: '#16A34A', borderWidth: 7,  cornerEmoji: '⭐', topBanner: '🎄 Merry Christmas',   bottomBanner: '🎁 Happy Holidays!', bannerBg: '#166534', bannerText: '#FDE68A' },
];

// ─── Layer types ───────────────────────────────────────────────────────────────
interface StickerLayer { id: string; uri?: string; emoji?: string; initX: number; initY: number; }

interface TextLayer {
  id: string; text: string; x: number; y: number;
  color: string; fontSize: number; bold: boolean; italic: boolean; outline: boolean;
  fontFamily?: string;
}

interface CaptionLayer {
  text: string; color: string; bg: string; position: 'top' | 'bottom'; fontSize: number;
}

type Tool = 'none' | 'crop' | 'stickers' | 'frames' | 'caption' | 'text' | 'layers';

// ─── Crop presets ─────────────────────────────────────────────────────────────
interface CropPreset { id: string; label: string; icon: string; ratio: number | null; }
const CROP_PRESETS: CropPreset[] = [
  { id: 'original', label: 'Original', icon: '⊡', ratio: null  },
  { id: 'square',   label: '1 : 1',    icon: '□', ratio: 1     },
  { id: 'portrait', label: '4 : 5',    icon: '▯', ratio: 4 / 5 },
  { id: 'land43',   label: '4 : 3',    icon: '▭', ratio: 4 / 3 },
  { id: 'wide',     label: '16 : 9',   icon: '▬', ratio: 16 / 9 },
  { id: 'tall',     label: '9 : 16',   icon: '▮', ratio: 9 / 16 },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const TEXT_COLORS = [
  '#ffffff', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE',
  '#FF2D55', '#FF6B9D', '#F59E0B', '#10B981', '#6366F1',
];
const CAPTION_BGS  = ['#7B2FBE', '#FF6B9D', '#1E3A5F', '#166534', '#713F12', '#000000CC', '#FFFFFFCC', '#F43F5E', '#0EA5E9'];
const CAPTION_COLS = ['#ffffff', '#000000', '#FDE68A', '#93C5FD', '#BBF7D0', '#FECACA', '#FED7AA'];
const TEXT_SIZES   = [16, 22, 28, 36, 44, 56];
const FONT_OPTIONS = [
  { label: 'Default', value: undefined },
  { label: 'Serif',   value: 'Georgia' },
  { label: 'Mono',    value: 'Courier New' },
  { label: 'Round',   value: Platform.OS === 'ios' ? 'Arial Rounded MT Bold' : 'sans-serif-condensed' },
];

// ─── DraggableSticker ─────────────────────────────────────────────────────────
const DraggableSticker = memo(function DraggableSticker({
  sticker, onRemove,
}: { sticker: StickerLayer; onRemove: (id: string) => void; }) {
  const [showRemove, setShowRemove] = useState(false);
  const x          = useSharedValue(sticker.initX);
  const y          = useSharedValue(sticker.initY);
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const startX     = useSharedValue(0);
  const startY     = useSharedValue(0);

  const hideRemove    = useCallback(() => setShowRemove(false), []);
  const toggleRemove  = useCallback(() => setShowRemove(v => !v), []);

  const pan = Gesture.Pan()
    .onStart(() => { startX.value = x.value; startY.value = y.value; })
    .onUpdate(e => { x.value = startX.value + e.translationX; y.value = startY.value + e.translationY; })
    .onEnd(() => { runOnJS(hideRemove)(); });

  const pinch = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate(e => { scale.value = Math.max(0.2, Math.min(6, savedScale.value * e.scale)); });

  const tap = Gesture.Tap().maxDuration(300).onEnd(() => { runOnJS(toggleRemove)(); });

  const composed = Gesture.Simultaneous(
    Gesture.Race(tap),
    Gesture.Simultaneous(pan, pinch),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const doRemove = useCallback(() => { setShowRemove(false); onRemove(sticker.id); }, [sticker.id, onRemove]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[s.stickerContainer, animStyle]}>
        {sticker.emoji
          ? <Text style={{ fontSize: STICKER_SIZE * 0.75, lineHeight: STICKER_SIZE }}>{sticker.emoji}</Text>
          : sticker.uri
            ? <Image source={{ uri: sticker.uri }} style={{ width: STICKER_SIZE, height: STICKER_SIZE }} contentFit="contain" cachePolicy="disk" />
            : null}
        {showRemove && (
          <TouchableOpacity onPress={doRemove} style={[s.removeBtn, { top: -10, right: -10 }]}>
            <Ionicons name="trash" size={11} color="#fff" />
          </TouchableOpacity>
        )}
      </Animated.View>
    </GestureDetector>
  );
});

// ─── DraggableText ────────────────────────────────────────────────────────────
const DraggableText = memo(function DraggableText({
  layer, selected, onTap, onMove, onRemove, onEdit,
}: {
  layer: TextLayer;
  selected: boolean;
  onTap: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const layerRef   = useRef(layer);
  const onMoveRef  = useRef(onMove);
  const onTapRef   = useRef(onTap);
  layerRef.current  = layer;
  onMoveRef.current = onMove;
  onTapRef.current  = onTap;

  const startX  = useRef(0);
  const startY  = useRef(0);
  const movedRef = useRef(false);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (_, g) => {
      movedRef.current = false;
      startX.current = layerRef.current.x;
      startY.current = layerRef.current.y;
    },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5) movedRef.current = true;
      if (movedRef.current) {
        onMoveRef.current(layerRef.current.id, startX.current + g.dx, startY.current + g.dy);
      }
    },
    onPanResponderRelease: () => {
      if (!movedRef.current) onTapRef.current(layerRef.current.id);
    },
  })).current;

  const textStyle: any[] = [
    s.textLayer,
    {
      fontSize:   layer.fontSize,
      color:      layer.color,
      fontWeight: layer.bold   ? '800' : '500',
      fontStyle:  layer.italic ? 'italic' : 'normal',
      fontFamily: layer.fontFamily,
    },
    layer.outline
      ? { textShadowColor: '#000', textShadowOffset: { width: -1.5, height: 1.5 }, textShadowRadius: 0 }
      : { textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 1, height: 1.5 }, textShadowRadius: 4 },
  ];

  return (
    <View {...pan.panHandlers} style={{ position: 'absolute', left: layer.x, top: layer.y }}>
      {selected && <View style={s.textSelected} pointerEvents="none" />}
      <Text style={textStyle}>{layer.text}</Text>
      {selected && (
        <View style={s.textControls}>
          <TouchableOpacity onPress={() => onEdit(layer.id)} style={s.textControlBtn}>
            <Ionicons name="pencil" size={13} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRemove(layer.id)} style={[s.textControlBtn, { backgroundColor: '#C0392B' }]}>
            <Ionicons name="trash" size={13} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

// ─── FrameOverlay ─────────────────────────────────────────────────────────────
function FrameOverlay({ frame, photoH }: { frame: FrameDef; photoH: number }) {
  const bH  = Math.round(photoH * 0.1);
  const cFs = Math.round(SW * 0.065);
  const bFs = Math.round(bH * 0.38);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { borderWidth: frame.borderWidth, borderColor: frame.borderColor }]} />
      {frame.topBanner
        ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: bH, backgroundColor: frame.bannerBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: bFs, fontWeight: '800', color: frame.bannerText ?? '#fff', letterSpacing: 1 }}>{frame.topBanner}</Text>
          </View>
        : null}
      {frame.bottomBanner
        ? <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: bH, backgroundColor: frame.bannerBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: bFs, fontWeight: '700', color: frame.bannerText ?? '#fff' }}>{frame.bottomBanner}</Text>
          </View>
        : null}
      {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => {
        if (!frame.cornerEmoji) return null;
        const top    = corner.startsWith('top')    ? (frame.topBanner    ? bH + 4 : 6) : undefined;
        const bottom = corner.startsWith('bottom') ? (frame.bottomBanner ? bH + 4 : 6) : undefined;
        const left   = corner.endsWith('Left')  ? 6 : undefined;
        const right  = corner.endsWith('Right') ? 6 : undefined;
        return <Text key={corner} style={[{ position: 'absolute', fontSize: cFs }, { top, bottom, left, right }]}>{frame.cornerEmoji}</Text>;
      })}
    </View>
  );
}

// ─── CaptionOverlay ───────────────────────────────────────────────────────────
function CaptionOverlay({ caption, photoH }: { caption: CaptionLayer; photoH: number }) {
  if (!caption.text.trim()) return null;
  const bH = Math.round(photoH * 0.11);
  return (
    <View
      pointerEvents="none"
      style={[
        s.captionBanner,
        { backgroundColor: caption.bg, height: bH },
        caption.position === 'top' ? { top: 0 } : { bottom: 0 },
      ]}>
      <Text style={{ fontSize: caption.fontSize, fontWeight: '800', color: caption.color, textAlign: 'center', letterSpacing: 1.5 }} numberOfLines={2}>
        {caption.text.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// ─── Fit preset (display-level, no pixel manipulation) ────────────────────────
const FIT_PRESET: CropPreset = { id: 'fit', label: 'Fit', icon: '⬜', ratio: null };

interface PhotoEditorProps {
  visible: boolean;
  photoUri: string;
  onDone: (uri: string, base64: string, fitFrame: boolean) => void;
  onCancel: () => void;
  accent?: string;
}

export function PhotoEditor({ visible, photoUri, onDone, onCancel, accent = '#7B2FBE' }: PhotoEditorProps) {
  const insets       = useSafeAreaInsets();
  const compositeRef = useRef<View>(null);

  // Canvas height: fill all space between top bar and toolbar
  const maxCanvasH = SH - insets.top - insets.bottom - TOPBAR_H - TOOLBAR_H;
  const PHOTO_H    = Math.min(Math.round(SW * 4 / 3), Math.max(maxCanvasH, Math.round(SW * 0.75)));

  const [tool,        setTool]       = useState<Tool>('none');
  const [frame,       setFrame]      = useState<FrameDef | null>(null);
  const [stickers,    setStickers]   = useState<StickerLayer[]>([]);
  const [texts,       setTexts]      = useState<TextLayer[]>([]);
  const [caption,     setCaption]    = useState<CaptionLayer>({ text: '', color: '#fff', bg: '#7B2FBE', position: 'bottom', fontSize: TYPO.title });
  const [stickerPack, setStickerPack] = useState(0);
  const [saving,      setSaving]     = useState(false);

  // Crop state — ratio null = original, croppedUri = preview after crop applied
  const [cropPreset,  setCropPreset]  = useState<CropPreset>(CROP_PRESETS[0]);
  const [croppedUri,  setCroppedUri]  = useState<string | null>(null);
  const [cropApplying, setCropApplying] = useState(false);
  const [fitFrame,    setFitFrame]    = useState(false);
  const activePhotoUri = croppedUri ?? photoUri;

  // Selected text layer (shows floating edit/delete controls on canvas)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  // When editing an existing text layer (null = adding new)
  const [editingTextId, setEditingTextId]   = useState<string | null>(null);

  // Text style state
  const [textInput,   setTextInput]  = useState('');
  const [textColor,   setTextColor]  = useState('#ffffff');
  const [textBold,    setTextBold]   = useState(true);
  const [textItalic,  setTextItalic] = useState(false);
  const [textOutline, setTextOutline] = useState(false);
  const [textSize,    setTextSize]   = useState(28);
  const [textFont,    setTextFont]   = useState<string | undefined>(undefined);

  // Caption state
  const [captionInput, setCaptionInput] = useState('');

  // Deselect text when opening any tool panel
  const openTool = useCallback((t: Tool) => {
    setTool(prev => prev === t ? 'none' : t);
    if (t !== 'none') setSelectedTextId(null);
  }, []);

  const closePanel = useCallback(() => { setTool('none'); setEditingTextId(null); }, []);

  // ── Sticker actions ──
  const addSticker = useCallback((def: StickerDef) => {
    setStickers(prev => [...prev, {
      id:    `${def.id}-${Date.now()}`,
      uri:   def.uri,
      emoji: def.emoji,
      initX: SW * 0.1 + Math.random() * SW * 0.6,
      initY: PHOTO_H * 0.2 + Math.random() * PHOTO_H * 0.45,
    }]);
  }, [PHOTO_H]);

  const removeSticker = useCallback((id: string) => setStickers(prev => prev.filter(s => s.id !== id)), []);

  // ── Text actions ──
  const moveText   = useCallback((id: string, x: number, y: number) => setTexts(prev => prev.map(t => t.id === id ? { ...t, x, y } : t)), []);
  const removeText = useCallback((id: string) => {
    setTexts(prev => prev.filter(t => t.id !== id));
    setSelectedTextId(id => id === id ? null : id);
  }, []);

  const handleTextTap = useCallback((id: string) => {
    setSelectedTextId(prev => prev === id ? null : id);
  }, []);

  const handleTextEdit = useCallback((id: string) => {
    const layer = texts.find(t => t.id === id);
    if (!layer) return;
    setEditingTextId(id);
    setTextInput(layer.text);
    setTextColor(layer.color);
    setTextBold(layer.bold);
    setTextItalic(layer.italic);
    setTextOutline(layer.outline);
    setTextSize(layer.fontSize);
    setTextFont(layer.fontFamily);
    setTool('text');
    setSelectedTextId(null);
  }, [texts]);

  const confirmText = useCallback(() => {
    if (!textInput.trim()) { closePanel(); return; }
    if (editingTextId) {
      // Update existing layer
      setTexts(prev => prev.map(t => t.id === editingTextId
        ? { ...t, text: textInput.trim(), color: textColor, bold: textBold, italic: textItalic, outline: textOutline, fontSize: textSize, fontFamily: textFont }
        : t));
    } else {
      // Add new layer
      setTexts(prev => [...prev, {
        id: Date.now().toString(),
        text: textInput.trim(),
        x: 24, y: PHOTO_H * 0.3,
        color: textColor, fontSize: textSize,
        bold: textBold, italic: textItalic, outline: textOutline,
        fontFamily: textFont,
      }]);
    }
    setTextInput('');
    setEditingTextId(null);
    setTool('none');
  }, [textInput, editingTextId, textColor, textBold, textItalic, textOutline, textSize, textFont, PHOTO_H, closePanel]);

  const applyCaption = useCallback(() => {
    setCaption(prev => ({ ...prev, text: captionInput }));
    closePanel();
  }, [captionInput, closePanel]);

  // ── Crop ──
  const toggleFitFrame = useCallback(() => {
    setFitFrame(prev => {
      if (!prev) {
        // Enabling fit: reset any pixel crop and use original
        setCroppedUri(null);
        setCropPreset(CROP_PRESETS[0]);
      }
      return !prev;
    });
  }, []);

  const applyCrop = useCallback(async (preset: CropPreset) => {
    setCropPreset(preset);
    setFitFrame(false); // any real crop clears fit mode
    if (!preset.ratio) {
      // Reset to original
      setCroppedUri(null);
      closePanel();
      return;
    }
    setCropApplying(true);
    try {
      // Get original image dimensions
      const { width: imgW, height: imgH } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        RNImage.getSize(photoUri, (w, h) => resolve({ width: w, height: h }), reject);
      });
      const targetRatio = preset.ratio;
      let cropW = imgW;
      let cropH = Math.round(imgW / targetRatio);
      if (cropH > imgH) {
        cropH = imgH;
        cropW = Math.round(imgH * targetRatio);
      }
      const originX = Math.round((imgW - cropW) / 2);
      const originY = Math.round((imgH - cropH) / 2);
      const result = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      );
      setCroppedUri(result.uri);
    } catch {
      // Silently keep previous crop
    } finally {
      setCropApplying(false);
      closePanel();
    }
  }, [photoUri, closePanel]);

  // ── Export ──
  const handleDone = async () => {
    if (saving) return;
    setSaving(true);
    setTool('none');
    setSelectedTextId(null);
    try {
      await new Promise(r => setTimeout(r, 120));
      const uri = await captureRef(compositeRef, { format: 'jpg', quality: 0.92 });
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        onDone(uri, b64, fitFrame);
      } catch { onDone(uri, '', fitFrame); }
    } catch {
      try {
        const b64 = await FileSystem.readAsStringAsync(activePhotoUri, { encoding: FileSystem.EncodingType.Base64 });
        onDone(activePhotoUri, b64, fitFrame);
      } catch { if (activePhotoUri) onDone(activePhotoUri, '', fitFrame); }
    } finally { setSaving(false); }
  };

  const layerCount = stickers.length + texts.length + (frame ? 1 : 0) + (caption.text.trim() ? 1 : 0);

  const TOOLS: { id: Tool; icon: string; label: string; badge?: number }[] = [
    { id: 'crop',     icon: 'crop-outline',     label: 'Crop'     },
    { id: 'stickers', icon: 'happy-outline',   label: 'Stickers' },
    { id: 'frames',   icon: 'images-outline',   label: 'Frames'   },
    { id: 'caption',  icon: 'pricetag-outline', label: 'Caption'  },
    { id: 'text',     icon: 'text-outline',     label: 'Text'     },
    { id: 'layers',   icon: 'layers-outline',   label: 'Layers',  badge: layerCount },
  ];

  // Dismiss selected text when tapping the canvas background
  const handleCanvasTap = useCallback(() => {
    if (selectedTextId) setSelectedTextId(null);
    else if (tool !== 'none') setTool('none');
  }, [selectedTextId, tool]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent presentationStyle="fullScreen">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

          {/* ── Top bar ── */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={onCancel} style={s.iconBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={s.topTitle}>Edit Photo</Text>
            <TouchableOpacity onPress={handleDone} disabled={saving}
              style={[s.doneBtn, { backgroundColor: saving ? '#555' : accent }]}>
              <Text style={s.doneBtnText}>{saving ? '…' : 'Upload'}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Canvas ── */}
          <Pressable onPress={handleCanvasTap} style={{ width: SW, height: PHOTO_H }}>
            <View
              ref={compositeRef}
              collapsable={false}
              style={{ width: SW, height: PHOTO_H, overflow: 'hidden', backgroundColor: '#000' }}>
              <Image
                source={{ uri: activePhotoUri }}
                style={{ width: SW, height: PHOTO_H, backgroundColor: fitFrame ? '#000' : undefined }}
                contentFit={fitFrame ? 'contain' : 'cover'}
                cachePolicy="memory-disk"
              />
              {caption.text.trim()
                ? <CaptionOverlay caption={caption} photoH={PHOTO_H} />
                : null}
              {frame
                ? <FrameOverlay frame={frame} photoH={PHOTO_H} />
                : null}
              {stickers.map(stk => (
                <DraggableSticker key={stk.id} sticker={stk} onRemove={removeSticker} />
              ))}
              {texts.map(txt => (
                <DraggableText
                  key={txt.id}
                  layer={txt}
                  selected={selectedTextId === txt.id}
                  onTap={handleTextTap}
                  onMove={moveText}
                  onRemove={removeText}
                  onEdit={handleTextEdit}
                />
              ))}
            </View>
          </Pressable>

          {/* ── Toolbar ── */}
          <View style={s.toolbar}>
            {TOOLS.map(({ id, icon, label, badge }) => {
              const active = tool === id;
              return (
                <TouchableOpacity key={id}
                  style={[s.toolBtn, active && { backgroundColor: `${accent}28`, borderRadius: 12 }]}
                  onPress={() => openTool(id)}>
                  <View>
                    <Ionicons name={icon as any} size={22} color={active ? accent : 'rgba(255,255,255,0.65)'} />
                    {!!badge && (
                      <View style={[s.badge, { backgroundColor: accent }]}>
                        <Text style={s.badgeText}>{badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.toolLabel, active && { color: accent, fontWeight: '800' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ══ Tool panels — absolutely positioned above toolbar, shift up with keyboard ══ */}
          {tool !== 'none' && (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'position' : 'height'}
              keyboardVerticalOffset={0}
              style={[s.panelAnchor, { bottom: TOOLBAR_H + insets.bottom }]}>

              {/* ── Crop ── */}
              {tool === 'crop' && (
                <View style={s.panel}>
                  <PanelHeader title="Crop" onClose={closePanel} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 8 }}>
                    {CROP_PRESETS.map(preset => {
                      const active = cropPreset.id === preset.id && !fitFrame;
                      return (
                        <TouchableOpacity
                          key={preset.id}
                          onPress={() => applyCrop(preset)}
                          disabled={cropApplying}
                          style={[s.cropChip, active && { borderColor: accent, backgroundColor: `${accent}25` }]}>
                          <Text style={{ fontSize: TYPO.title, color: active ? accent : 'rgba(255,255,255,0.7)' }}>{preset.icon}</Text>
                          <Text style={[s.cropLabel, active && { color: accent, fontWeight: '800' }]}>{preset.label}</Text>
                          {active && cropPreset.id !== 'original' && (
                            <View style={[s.cropActiveDot, { backgroundColor: accent }]} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {/* Fit chip — shows full photo with letterbox bars, no pixel crop */}
                    <TouchableOpacity
                      onPress={toggleFitFrame}
                      style={[s.cropChip, fitFrame && { borderColor: '#4FC3F7', backgroundColor: 'rgba(79,195,247,0.15)' }]}>
                      <Text style={{ fontSize: TYPO.title, color: fitFrame ? '#4FC3F7' : 'rgba(255,255,255,0.7)' }}>⬛</Text>
                      <Text style={[s.cropLabel, fitFrame && { color: '#4FC3F7', fontWeight: '800' }]}>Fit</Text>
                      {fitFrame && <View style={[s.cropActiveDot, { backgroundColor: '#4FC3F7' }]} />}
                    </TouchableOpacity>
                  </ScrollView>
                  {cropApplying && (
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: TYPO.caption, textAlign: 'center', marginTop: 4 }}>Applying…</Text>
                  )}
                  {fitFrame && (
                    <Text style={{ color: 'rgba(79,195,247,0.8)', fontSize: TYPO.caption, textAlign: 'center', marginTop: 2, marginBottom: 4 }}>
                      Full photo shown — black bars fill the frame
                    </Text>
                  )}
                </View>
              )}

              {/* ── Stickers ── */}
              {tool === 'stickers' && (
                <View style={s.panel}>
                  <PanelHeader title="Stickers" onClose={closePanel} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
                    {STICKER_PACKS.map((pack, i) => (
                      <TouchableOpacity key={pack.id} onPress={() => setStickerPack(i)}
                        style={[s.packTab, stickerPack === i && { backgroundColor: accent, borderColor: accent }]}>
                        <Text style={s.packTabIcon}>{pack.icon}</Text>
                        <Text style={[s.packTabLabel, stickerPack === i && { color: '#fff' }]}>{pack.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={s.stickerGrid}>
                    {STICKER_PACKS[stickerPack].stickers.map(def => (
                      <TouchableOpacity key={def.id} onPress={() => addSticker(def)} style={s.stickerItem}>
                        {def.emoji
                          ? <Text style={{ fontSize: 38 }}>{def.emoji}</Text>
                          : def.uri
                            ? <Image source={{ uri: def.uri }} style={{ width: 48, height: 48 }} contentFit="contain" cachePolicy="disk" />
                            : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Frames ── */}
              {tool === 'frames' && (
                <View style={s.panel}>
                  <PanelHeader title="Frames" onClose={closePanel} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.frameRow}>
                    <TouchableOpacity onPress={() => setFrame(null)}
                      style={[s.frameChip, !frame && { borderColor: accent, backgroundColor: `${accent}25` }]}>
                      <View style={[s.frameThumb, { borderColor: '#555' }]}>
                        <Ionicons name="close" size={18} color="#888" />
                      </View>
                      <Text style={[s.frameLabel, !frame && { color: accent }]}>None</Text>
                    </TouchableOpacity>
                    {FRAMES.map(f => (
                      <TouchableOpacity key={f.id} onPress={() => setFrame(prev => prev?.id === f.id ? null : f)}
                        style={[s.frameChip, frame?.id === f.id && { borderColor: f.borderColor, backgroundColor: `${f.borderColor}25` }]}>
                        <View style={[s.frameThumb, { borderColor: f.borderColor, borderWidth: 3 }]}>
                          <Text style={{ fontSize: TYPO.heading }}>{f.emoji}</Text>
                        </View>
                        <Text style={[s.frameLabel, frame?.id === f.id && { color: f.borderColor, fontWeight: '800' }]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Caption ── */}
              {tool === 'caption' && (
                <View style={s.panel}>
                  <PanelHeader title="Caption Banner" onClose={closePanel} />
                  <View style={s.inputRow}>
                    <TextInput
                      style={[s.textInput, { borderColor: accent, flex: 1 }]}
                      placeholder="Add a caption banner…"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={captionInput}
                      onChangeText={setCaptionInput}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={applyCaption}
                    />
                    <TouchableOpacity onPress={applyCaption} style={[s.confirmBtn, { backgroundColor: accent }]}>
                      <Ionicons name="checkmark" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <View style={s.optionRow}>
                    {(['top', 'bottom'] as const).map(pos => (
                      <TouchableOpacity key={pos} onPress={() => setCaption(c => ({ ...c, position: pos }))}
                        style={[s.smallBtn, caption.position === pos && { backgroundColor: accent }]}>
                        <Ionicons name={pos === 'top' ? 'chevron-up' : 'chevron-down'} size={13} color="#fff" />
                        <Text style={s.smallBtnLabel}>{pos === 'top' ? 'Top' : 'Bottom'}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{ flex: 1 }} />
                    {([16, 22, 30] as const).map(sz => (
                      <TouchableOpacity key={sz} onPress={() => setCaption(c => ({ ...c, fontSize: sz }))}
                        style={[s.smallBtn, caption.fontSize === sz && { backgroundColor: accent }]}>
                        <Text style={{ fontSize: sz === 16 ? 9 : sz === 22 ? 11 : 13, color: '#fff', fontWeight: '800' }}>
                          {sz === 16 ? 'S' : sz === 22 ? 'M' : 'L'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorRow}>
                    <Text style={s.colorLabel}>Text</Text>
                    {CAPTION_COLS.map(c => (
                      <TouchableOpacity key={`tc-${c}`} onPress={() => setCaption(cap => ({ ...cap, color: c }))}
                        style={[s.colorDot, { backgroundColor: c }, caption.color === c && s.colorDotActive]} />
                    ))}
                    <View style={s.colorSep} />
                    <Text style={s.colorLabel}>BG</Text>
                    {CAPTION_BGS.map(c => (
                      <TouchableOpacity key={`bc-${c}`} onPress={() => setCaption(cap => ({ ...cap, bg: c }))}
                        style={[s.colorDot, { backgroundColor: c }, caption.bg === c && s.colorDotActive]} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Text ── */}
              {tool === 'text' && (
                <View style={s.panel}>
                  <PanelHeader
                    title={editingTextId ? 'Edit Text' : 'Add Text'}
                    onClose={closePanel}
                  />
                  <View style={s.inputRow}>
                    <TextInput
                      style={[
                        s.textInput,
                        { borderColor: accent, flex: 1, color: textColor,
                          fontWeight: textBold ? '800' : '400',
                          fontStyle: textItalic ? 'italic' : 'normal',
                          fontFamily: textFont,
                        },
                      ]}
                      placeholder="Type something…"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={textInput}
                      onChangeText={setTextInput}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={confirmText}
                    />
                    <TouchableOpacity onPress={confirmText} style={[s.confirmBtn, { backgroundColor: accent }]}>
                      <Ionicons name="checkmark" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* Style toggles */}
                  <View style={s.optionRow}>
                    <TouchableOpacity onPress={() => setTextBold(b => !b)}
                      style={[s.styleBtn, textBold && { backgroundColor: accent, borderColor: accent }]}>
                      <Text style={[s.styleBtnLabel, { fontWeight: '900' }]}>B</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTextItalic(v => !v)}
                      style={[s.styleBtn, textItalic && { backgroundColor: accent, borderColor: accent }]}>
                      <Text style={[s.styleBtnLabel, { fontStyle: 'italic' }]}>I</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTextOutline(o => !o)}
                      style={[s.styleBtn, textOutline && { backgroundColor: accent, borderColor: accent }]}>
                      <Text style={[s.styleBtnLabel, { textShadowColor: '#fff', textShadowRadius: 0, textShadowOffset: { width: 1, height: 1 } }]}>O</Text>
                    </TouchableOpacity>
                    <View style={s.colorSep} />
                    {/* Font family */}
                    {FONT_OPTIONS.map(f => (
                      <TouchableOpacity key={f.label} onPress={() => setTextFont(f.value)}
                        style={[s.fontChip, textFont === f.value && { backgroundColor: accent, borderColor: accent }]}>
                        <Text style={[s.fontChipLabel, { fontFamily: f.value }, textFont === f.value && { color: '#fff' }]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Font size */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.colorRow, { paddingBottom: 6 }]}>
                    <Text style={s.colorLabel}>Size</Text>
                    {TEXT_SIZES.map(sz => (
                      <TouchableOpacity key={sz} onPress={() => setTextSize(sz)}
                        style={[s.sizeChip, textSize === sz && { backgroundColor: accent, borderColor: accent }]}>
                        <Text style={[s.sizeChipLabel, textSize === sz && { color: '#fff' }]}>{sz}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Color palette */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorRow}>
                    <Text style={s.colorLabel}>Color</Text>
                    {TEXT_COLORS.map(c => (
                      <TouchableOpacity key={c} onPress={() => setTextColor(c)}
                        style={[
                          s.colorDot, { backgroundColor: c },
                          textColor === c && s.colorDotActive,
                          c === '#000000' && { borderColor: '#444' },
                        ]} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Layers ── */}
              {tool === 'layers' && (
                <View style={s.panel}>
                  <PanelHeader title={`Layers (${layerCount})`} onClose={closePanel} />
                  {layerCount === 0
                    ? <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: TYPO.body }}>Nothing added yet</Text>
                      </View>
                    : (
                      <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ paddingBottom: 8 }}>
                        {frame && (
                          <LayerRow
                            icon={<Text style={{ fontSize: TYPO.title, width: 36 }}>{frame.emoji}</Text>}
                            title="Frame" sub={frame.label}
                            onDelete={() => setFrame(null)}
                          />
                        )}
                        {caption.text.trim() ? (
                          <LayerRow
                            icon={<Ionicons name="pricetag-outline" size={22} color="rgba(255,255,255,0.5)" style={{ width: 36 }} />}
                            title="Caption" sub={caption.text}
                            onDelete={() => { setCaption(c => ({ ...c, text: '' })); setCaptionInput(''); }}
                          />
                        ) : null}
                        {texts.map(t => (
                          <LayerRow
                            key={t.id}
                            icon={
                              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: t.color, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: t.color === '#ffffff' ? '#000' : '#fff' }}>Aa</Text>
                              </View>
                            }
                            title="Text" sub={t.text}
                            onEdit={() => handleTextEdit(t.id)}
                            onDelete={() => removeText(t.id)}
                          />
                        ))}
                        {stickers.map((stk, i) => (
                          <LayerRow
                            key={stk.id}
                            icon={
                              <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                                {stk.emoji
                                  ? <Text style={{ fontSize: TYPO.title }}>{stk.emoji}</Text>
                                  : <Image source={{ uri: stk.uri }} style={{ width: 32, height: 32 }} contentFit="contain" />}
                              </View>
                            }
                            title={`Sticker ${i + 1}`} sub="Drag on canvas to reposition"
                            onDelete={() => removeSticker(stk.id)}
                          />
                        ))}
                      </ScrollView>
                    )}
                </View>
              )}

            </KeyboardAvoidingView>
          )}

        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Small shared panel components ───────────────────────────────────────────
function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={s.panelHeader}>
      <Text style={s.panelTitle}>{title}</Text>
      <TouchableOpacity onPress={onClose} style={s.panelClose}>
        <Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
    </View>
  );
}

function LayerRow({
  icon, title, sub, onEdit, onDelete,
}: { icon: React.ReactNode; title: string; sub: string; onEdit?: () => void; onDelete: () => void }) {
  return (
    <View style={s.layerRow}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={s.layerTitle}>{title}</Text>
        <Text style={s.layerSub} numberOfLines={1}>{sub}</Text>
      </View>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} style={[s.layerActionBtn, { marginRight: 6 }]}>
          <Ionicons name="pencil-outline" size={16} color="#aaa" />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onDelete} style={s.layerDeleteBtn}>
        <Ionicons name="trash-outline" size={16} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center' },

  topBar:     { width: '100%', height: TOPBAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  iconBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topTitle:   { flex: 1, fontSize: TYPO.subheading, fontWeight: '700', color: '#fff', textAlign: 'center' },
  doneBtn:    { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  doneBtnText:{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' },

  toolbar:    { width: '100%', height: TOOLBAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: '#181818', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2E2E2E' },
  toolBtn:    { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 },
  toolLabel:  { fontSize: TYPO.label, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },

  // Panel anchored above toolbar, uses KAV to float above keyboard
  panelAnchor: { position: 'absolute', left: 0, right: 0, zIndex: 10 },
  panel:       { backgroundColor: '#1A1A1A', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2E2E2E', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 4, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 16 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  panelTitle:  { flex: 1, fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  panelClose:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  tabRow:      { gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  packTab:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#333', backgroundColor: '#252525' },
  packTabIcon: { fontSize: TYPO.body },
  packTabLabel:{ fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 4, paddingBottom: 8 },
  stickerItem: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: '#252525', borderRadius: 12, margin: 2 },

  cropChip:      { alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#333', minWidth: 72 },
  cropLabel:     { fontSize: TYPO.label, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  cropActiveDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  frameRow:    { gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  frameChip:   { alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#333', minWidth: 72 },
  frameThumb:  { width: 46, height: 46, borderRadius: 8, borderWidth: 2, borderColor: '#555', alignItems: 'center', justifyContent: 'center', backgroundColor: '#252525', overflow: 'hidden' },
  frameLabel:  { fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  inputRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10, alignItems: 'center' },
  textInput:   { backgroundColor: '#252525', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: TYPO.subheading, color: '#fff', borderWidth: 1.5 },
  confirmBtn:  { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },

  optionRow:   { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 8, alignItems: 'center', flexWrap: 'wrap' },
  smallBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: '#333' },
  smallBtnLabel: { fontSize: TYPO.caption, fontWeight: '700', color: '#fff' },
  styleBtn:    { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: '#333', backgroundColor: '#252525', alignItems: 'center', justifyContent: 'center' },
  styleBtnLabel: { fontSize: TYPO.body, color: '#fff', fontWeight: '600' },
  fontChip:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#333', backgroundColor: '#252525' },
  fontChipLabel: { fontSize: TYPO.caption, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  sizeChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#333', backgroundColor: '#252525' },
  sizeChipLabel: { fontSize: TYPO.caption, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  colorRow:    { gap: 8, paddingHorizontal: 14, paddingBottom: 12, alignItems: 'center' },
  colorLabel:  { fontSize: TYPO.label, color: 'rgba(255,255,255,0.4)', fontWeight: '700', marginRight: 2 },
  colorSep:    { width: 1, height: 28, backgroundColor: '#333', marginHorizontal: 4 },
  colorDot:    { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  colorDotActive: { borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.18 }] },

  badge:       { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText:   { fontSize: TYPO.micro, fontWeight: '800', color: '#fff' },

  layerRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#252525' },
  layerTitle:  { fontSize: TYPO.caption, fontWeight: '700', color: '#fff' },
  layerSub:    { fontSize: TYPO.label, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  layerActionBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#252525', borderRadius: 10 },
  layerDeleteBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1515', borderRadius: 10 },

  stickerContainer: { position: 'absolute', top: 0, left: 0, width: STICKER_SIZE, height: STICKER_SIZE, alignItems: 'center', justifyContent: 'center' },
  removeBtn:   { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },

  textLayer:   { letterSpacing: 0.5 },
  textSelected:{ ...StyleSheet.absoluteFillObject, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 4, borderStyle: 'dashed' },
  textControls:{ position: 'absolute', top: -36, left: 0, flexDirection: 'row', gap: 4 },
  textControlBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#333', flexDirection: 'row', alignItems: 'center', gap: 4 },

  captionBanner: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
