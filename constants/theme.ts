import { Dimensions, Platform } from 'react-native';
import { lightColors } from './colors';

const { width, height } = Dimensions.get('window');

export const SCREEN = { width, height };

// Scale helpers for cross-device responsiveness
export const scale = (size: number) => (width / 390) * size;
export const vs = (size: number) => (height / 844) * size;

// Legacy COLORS — aliases the light theme so existing screens still compile.
// All NEW screens should use useTheme().colors from lib/ThemeContext instead.
export const COLORS = {
  ...lightColors,
  // Legacy aliases kept for existing screens
  white: '#FFFFFF' as const,
};

export const FONTS = {
  regular: Platform.select({ ios: 'System', android: 'Roboto' }),
  medium: Platform.select({ ios: 'System', android: 'Roboto' }),
  bold: Platform.select({ ios: 'System', android: 'Roboto' }),
};

// Sizes below are deliberately larger than the Kinfolk mock's raw pixel
// values. The mock is a desktop web preview; those same px sizes read as
// too small to comfortably read on an actual phone screen (confirmed on
// device — 9-11px text was reported illegible). Every size here is the
// mock's intent (hierarchy, uppercase tracking, etc.) at a legible floor.
export const TYPO = {
  hero:       32,   // big hero numbers, pet names on detail
  title:      24,   // screen titles
  heading:    20,   // section headings, card titles
  subheading: 17,   // sub-section headers, large body
  body:       15,   // primary body text, buttons, inputs
  caption:    13,   // secondary info, timestamps, descriptions
  label:      12,   // chips, badges, small labels — floor raised from 11
  micro:      11,   // fine print — floor raised from 9, still smallest on screen
  // Kinfolk mock's uppercase section-header label (e.g. "TODAY'S TIMELINE
  // AXIS") — floor raised from the mock's 10-11px; paired with
  // LETTER_SPACING.sectionLabel and textTransform: 'uppercase'.
  sectionLabel: 12,
} as const;

export type TypoKey = keyof typeof TYPO;

// Letter-spacing pairings lifted from the mock (Tailwind's tracking-wider
// on uppercase labels, tracking-tight on display headings). Kept as a
// lookup so callers don't reinvent slightly-different values per screen.
export const LETTER_SPACING = {
  sectionLabel: 0.6,  // uppercase section headers ("ACTION NEEDED")
  display:     -0.3,  // greeting / large display headings
  badge:        0.4,  // small uppercase pills (role tags, status badges)
} as const;

// Tabular/mono-style numerals for times, ETAs, currency — the mock's
// `font-mono` class on timestamps and stat values. Apply alongside a
// monospace-leaning system font so digits align in a column.
export const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace' });

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const SHADOW = {
  sm: Platform.select({
    ios: { shadowColor: '#3D2068', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#3D2068', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
    android: { elevation: 5 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#3D2068', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
    android: { elevation: 10 },
  }),
};

// Pet species → default emoji
export const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶',
  cat: '🐱',
  rabbit: '🐰',
  horse: '🐴',
  bird: '🦜',
  fish: '🐠',
  hamster: '🐹',
  turtle: '🐢',
  other: '🐾',
};

// Per-species emoji picker options — wide set so users can express personality
export const SPECIES_EMOJIS: Record<string, string[]> = {
  dog: [
    // Literal
    '🐶', '🐕', '🦮', '🐕‍🦺', '🐩',
    // Core dog things
    '🐾', '🦴', '🎾', '🏡', '🚗',
    // Expressions / moods
    '😍', '🥰', '😎', '🤩', '🐶',
    // Activities
    '🏃', '🏊', '🌿', '🏕️', '⛰️',
    // Style / accessories
    '👑', '🎀', '🧣', '🕶️', '🎭',
    // Vibes / hearts
    '✨', '🌟', '💫', '❤️', '💛',
  ],
  cat: [
    // Literal
    '🐱', '🐈', '🐈‍⬛', '😺', '😸', '😻',
    // More faces
    '😼', '🙀', '😽', '😿', '😾',
    // Cosmic / mysterious
    '🌙', '⭐', '✨', '🌟', '💫', '🔮',
    // Style
    '👑', '🎀', '🌸', '🌺', '🌹', '💐',
    // Vibes
    '🪄', '🎭', '🖤', '💜', '💙', '🤍',
  ],
  rabbit: [
    // Literal
    '🐰', '🐇',
    // Food & nature
    '🥕', '🍀', '🌿', '🌼', '🌻', '🌷', '🌸',
    // Speed / energy
    '💨', '⚡', '🏃', '🤸',
    // Sweet / soft
    '🎀', '🩷', '💗', '💕', '🌈',
    // Night / magic
    '🌙', '⭐', '✨', '💫', '🌟',
  ],
  horse: [
    // Literal
    '🐴', '🐎', '🏇',
    // Riding & sports
    '🛡️', '🏆', '⚡', '🎯',
    // Pasture & nature
    '🌿', '🌾', '🏞️', '🏔️', '🌄',
    // Majestic & noble
    '👑', '⭐', '✨', '🌟', '💫',
    // Vibes
    '❤️', '🧡', '💛', '💚', '💙',
  ],
  bird: [
    // Literal species
    '🦜', '🐦', '🐤', '🐧', '🦅', '🦉',
    '🦚', '🦢', '🦩', '🕊️', '🦆', '🦋',
    // Nature
    '🌈', '🌿', '🌺', '🌸', '🌴',
    // Music (birds sing!)
    '🎵', '🎶', '🎤', '🎼',
    // Vibes
    '✨', '💫', '⭐', '❤️', '💛', '💙', '💚',
  ],
  fish: [
    // Literal
    '🐠', '🐟', '🐡', '🦈', '🐬', '🐳', '🐋', '🦭',
    '🐙', '🦑', '🦐', '🦞', '🦀', '🪸',
    // Water vibes
    '🌊', '💧', '🫧', '🌀', '🏊',
    // Colors / vibes
    '✨', '💫', '🌟', '❤️', '💙', '💚', '🩵',
  ],
  hamster: [
    // Literal
    '🐹', '🐭', '🐀',
    // Food
    '🌰', '🧀', '🌾', '🌿', '🌱',
    // Speed / spinning wheel vibes
    '⚡', '💨', '🏃', '🤸', '🎠',
    // Cute / sweet
    '🎀', '🌸', '💗', '🩷', '🥰',
    // Night / cozy
    '🌙', '⭐', '✨', '💫', '🌟',
  ],
  turtle: [
    // Literal
    '🐢', '🦎', '🐊', '🦕',
    // Nature / slow life
    '🌿', '🍃', '🌱', '🌾', '🪴',
    // Ocean / beach
    '🌊', '🏝️', '🌴', '☀️', '🌅',
    // Wise / zen
    '⏳', '🧘', '🌙', '⭐', '🌟',
    // Hearts
    '❤️', '💚', '🩵',
  ],
  other: [
    // Wild cards
    '🦊', '🦝', '🦔', '🐿️', '🦙', '🐺', '🦁', '🐯',
    '🦥', '🦦', '🦫', '🐉', '🦋', '🦎',
    // Universal
    '🐾', '✨', '💫', '🌟', '⭐',
    // Colors / hearts
    '❤️', '💜', '💙', '💚', '🧡', '💛',
  ],
};

// Breed keyword → suggested emojis — shown as a "Suggested for [breed]" row in the emoji picker
export const BREED_EMOJI_MAP: Record<string, string[]> = {
  // Dogs — popular breeds
  'golden retriever':    ['🌟', '🎾', '🏊', '💛', '🤗', '☀️'],
  'labrador':            ['🎾', '🏊', '💙', '🌊', '⚡', '🤗'],
  'labrador retriever':  ['🎾', '🏊', '💙', '🌊', '⚡', '🤗'],
  'husky':               ['❄️', '🐺', '🌨️', '🏔️', '💙', '🌙'],
  'siberian husky':      ['❄️', '🐺', '🌨️', '🏔️', '💙', '🌙'],
  'german shepherd':     ['🛡️', '⚡', '🐺', '💪', '🌟', '🔍'],
  'poodle':              ['✨', '👑', '🎀', '💅', '🌹', '🩷'],
  'standard poodle':     ['✨', '👑', '🎀', '💅', '🌹', '🩷'],
  'bulldog':             ['💪', '😤', '🥊', '👊', '🏆', '😎'],
  'english bulldog':     ['💪', '😤', '🥊', '🏰', '🎩', '🇬🇧'],
  'french bulldog':      ['💅', '🌆', '✨', '👑', '🌸', '🎀'],
  'chihuahua':           ['⚡', '🌶️', '🔥', '💥', '😤', '👸'],
  'dachshund':           ['🌭', '🕵️', '🔍', '🐛', '🎯', '⬛'],
  'beagle':              ['🔍', '🌿', '🐿️', '👃', '🌲', '🍂'],
  'boxer':               ['🥊', '💪', '⚡', '🔥', '🏆', '😤'],
  'rottweiler':          ['💪', '🛡️', '🌑', '⚡', '🔥', '🦁'],
  'shih tzu':            ['👑', '🌸', '💜', '✨', '🎀', '💝'],
  'yorkshire terrier':   ['👑', '✨', '🎀', '💫', '🌸', '💛'],
  'yorkshire':           ['👑', '✨', '🎀', '💫', '🌸', '💛'],
  'maltese':             ['🤍', '☁️', '🌸', '✨', '👑', '💐'],
  'pomeranian':          ['🔥', '⚡', '🌟', '✨', '🦊', '🍊'],
  'corgi':               ['🏰', '👑', '🌟', '❤️', '🎀', '🍑'],
  'pembroke welsh corgi':['🏰', '👑', '🌟', '❤️', '🎀', '🍑'],
  'border collie':       ['🎯', '⚡', '🌿', '🏃', '💡', '🌈'],
  'australian shepherd': ['🌿', '⚡', '🎯', '🏔️', '💙', '🌈'],
  'doberman':            ['⚡', '🛡️', '💪', '🔥', '🌑', '🐾'],
  'dobermann':           ['⚡', '🛡️', '💪', '🔥', '🌑', '🐾'],
  'great dane':          ['🦁', '👑', '🌟', '💪', '🏰', '🐘'],
  'dalmatian':           ['⚪', '⚫', '🎯', '🚒', '⚡', '🎱'],
  'bernese mountain dog':['🏔️', '❄️', '🌿', '💛', '🤗', '🧸'],
  'samoyed':             ['❄️', '☁️', '🤍', '⭐', '🌟', '😊'],
  'chow chow':           ['🦁', '🧸', '💜', '👑', '☁️', '🌟'],
  'akita':               ['🏔️', '⛩️', '🌸', '🎌', '🦁', '🌟'],
  'shiba inu':           ['🦊', '🔥', '⚡', '🌸', '😎', '🎌'],
  'pitbull':             ['💪', '❤️', '🏆', '🔥', '🌟', '🐾'],
  'american staffordshire':['💪', '❤️', '🏆', '🌟', '🔥', '🐾'],
  'jack russell':        ['⚡', '🎯', '🏃', '🔥', '💥', '🐾'],
  'miniature schnauzer': ['🧓', '🎩', '✂️', '🌟', '💼', '⭐'],
  'schnauzer':           ['🧓', '🎩', '✂️', '🌟', '💼', '⭐'],
  'cavalier':            ['❤️', '👑', '🌸', '💕', '🏰', '🎀'],
  'cavalier king charles':['❤️', '👑', '🌸', '💕', '🏰', '🎀'],
  'weimaraner':          ['🩶', '🌿', '🏃', '⚡', '🔍', '🌙'],
  'irish setter':        ['🔥', '🌿', '❤️', '💛', '🏃', '🍂'],
  'cocker spaniel':      ['🌸', '🎀', '💕', '👂', '✨', '🌟'],
  'bichon frise':        ['☁️', '🤍', '✨', '🌸', '🎀', '💐'],
  'lhasa apso':          ['👑', '🏔️', '✨', '🌸', '🧘', '⭐'],
  // Horses — popular breeds
  'thoroughbred':        ['⚡', '🏆', '🎯', '❤️', '🌟', '💨'],
  'arabian':             ['👑', '✨', '🌟', '💫', '🏜️', '🌙'],
  'mustang':             ['🌿', '⚡', '💨', '🏔️', '🦁', '🌲'],
  'quarter horse':       ['💪', '🤠', '🏆', '⚡', '🔥', '🌾'],
  'morgan':              ['👑', '💪', '✨', '🌟', '❤️', '🎖️'],
  'appaloosa':           ['🎨', '⚫', '⚪', '🌟', '✨', '🏜️'],
  'palomino':            ['✨', '💛', '☀️', '👑', '🌟', '💫'],
  'paint':               ['🎨', '⚪', '🟤', '🌟', '✨', '🎪'],
  'shetland pony':       ['🥰', '👑', '💚', '🌿', '✨', '🎀'],
  'welsh cob':           ['💪', '👑', '🏆', '✨', '💫', '❤️'],
  'friesian':            ['🖤', '⚡', '👑', '✨', '💫', '🌙'],
  'shire':               ['💪', '👑', '🏰', '❤️', '🌾', '🎖️'],
  'warmblood':           ['🎯', '✨', '⚡', '👑', '🏆', '💫'],
  // Cats — popular breeds
  'persian':             ['👑', '💅', '🌹', '✨', '🎀', '💜'],
  'siamese':             ['👁️', '🔮', '💜', '🌙', '✨', '🗣️'],
  'maine coon':          ['🦁', '👑', '🌟', '❄️', '🏔️', '🐾'],
  'ragdoll':             ['🤍', '☁️', '💜', '✨', '🌸', '🥰'],
  'bengal':              ['🐯', '⚡', '🌿', '🌙', '✨', '🔥'],
  'british shorthair':   ['🤴', '🏰', '👑', '💙', '☁️', '🇬🇧'],
  'scottish fold':       ['🥰', '🌙', '💜', '✨', '🌸', '🎀'],
  'sphynx':              ['👁️', '🔮', '🌑', '✨', '🪄', '👽'],
  'tabby':               ['🌿', '🐯', '✨', '🌙', '❤️', '🌟'],
  'orange tabby':        ['🌟', '🔥', '🧡', '☀️', '✨', '🐯'],
  'abyssinian':          ['⚡', '🌿', '🏃', '🌙', '✨', '🦁'],
  'burmese':             ['💜', '✨', '🌟', '🏆', '🤗', '🐾'],
  'russian blue':        ['💙', '🌙', '✨', '🩶', '🔮', '⭐'],
  'norwegian forest cat':['🌲', '❄️', '🏔️', '🦁', '🌿', '⭐'],
  'turkish angora':      ['🤍', '✨', '👑', '🌸', '💫', '🌟'],
  'munchkin':            ['🥰', '🌸', '💕', '✨', '🎀', '💜'],
}

// Mood → emoji
export const MOOD_EMOJI: Record<string, string> = {
  happy: '😄',
  playful: '🤩',
  tired: '😴',
  grumpy: '😒',
  anxious: '😰',
  calm: '😌',
  excited: '🥳',
};

// Mood → color (uses FurEver brand palette)
export const MOOD_COLOR: Record<string, string> = {
  happy: '#4ADE80',     // Green — joy
  playful: '#FF8C55',   // Coral gold — energy
  tired: '#94A3B8',     // Cool slate — rest
  grumpy: '#E8A320',    // Amber — caution
  anxious: '#E24B4A',   // Red — alert
  calm: '#4ECDC4',      // Mint — serenity
  excited: '#FF6B6B',   // Pink-coral — excitement
};

// Vaccine status thresholds (days)
export const VACCINE_WARN_DAYS = 30;
export const VACCINE_URGENT_DAYS = 0;
