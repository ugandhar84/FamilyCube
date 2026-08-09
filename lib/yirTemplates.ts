export interface YIRTemplate {
  id: string;
  name: string;
  bg: readonly [string, string, string]; // 3-stop slide gradient
  accent: string;                        // bars, badges, highlights
  subText: string;                       // secondary/subtitle text
  musicCategory: 'upbeat' | 'calm' | 'nostalgic' | 'tender';
}

const mk = (
  id: string, name: string,
  c1: string, c2: string, c3: string,
  accent: string,
  musicCategory: YIRTemplate['musicCategory'],
): YIRTemplate => ({ id, name, bg: [c1, c2, c3], accent, subText: 'rgba(255,255,255,0.52)', musicCategory });

export const YIR_TEMPLATES: readonly YIRTemplate[] = [
  // ── Cosmic ────────────────────────────────────────────────────────────
  mk('nebula',     'Nebula',     '#0E0820', '#1E1040', '#2D1A58', '#9D6FFF', 'nostalgic'),
  mk('aurora',     'Aurora',     '#0D1F2D', '#0A3A4A', '#116466', '#2ECC71', 'calm'),
  mk('cosmos',     'Cosmos',     '#0A0E1F', '#0D1640', '#1A2060', '#60A5FA', 'nostalgic'),
  mk('stardust',   'Stardust',   '#110822', '#1A0F40', '#2B1668', '#C084FC', 'calm'),
  mk('galaxy',     'Galaxy',     '#07081A', '#0D0E30', '#14163A', '#818CF8', 'nostalgic'),
  // ── Warm ──────────────────────────────────────────────────────────────
  mk('amber',      'Amber',      '#1A0A00', '#3D1A00', '#5C2800', '#F59E0B', 'upbeat'),
  mk('sunset',     'Sunset',     '#1A0505', '#3D0A0A', '#5C1A10', '#F97316', 'upbeat'),
  mk('ember',      'Ember',      '#1A0800', '#3D1200', '#5C2000', '#EF4444', 'upbeat'),
  mk('saffron',    'Saffron',    '#1A1200', '#3D2800', '#5C3A00', '#FBBF24', 'upbeat'),
  mk('terracotta', 'Terracotta', '#1A0A06', '#3D1A10', '#5C2816', '#EA580C', 'upbeat'),
  // ── Nature ────────────────────────────────────────────────────────────
  mk('forest',     'Forest',     '#030F06', '#061A0A', '#0A2A12', '#22C55E', 'calm'),
  mk('moss',       'Moss',       '#0A0F04', '#141F06', '#1E2E08', '#84CC16', 'calm'),
  mk('ocean',      'Ocean',      '#020F1A', '#051828', '#083040', '#06B6D4', 'calm'),
  mk('lagoon',     'Lagoon',     '#021414', '#042A2A', '#064040', '#14B8A6', 'calm'),
  mk('pine',       'Pine',       '#040D08', '#081A10', '#0D2A18', '#16A34A', 'calm'),
  // ── Soft ──────────────────────────────────────────────────────────────
  mk('rose',       'Rose',       '#1A0510', '#3D0A20', '#5C1435', '#F43F5E', 'tender'),
  mk('blush',      'Blush',      '#1A050D', '#3D0A1A', '#5C142A', '#FB7185', 'tender'),
  mk('lavender',   'Lavender',   '#12081A', '#1E0F30', '#2A1645', '#A78BFA', 'nostalgic'),
  mk('peony',      'Peony',      '#1A0515', '#3D0A28', '#5C143A', '#E879F9', 'tender'),
  mk('orchid',     'Orchid',     '#14081A', '#24103A', '#341858', '#D946EF', 'tender'),
  // ── Midnight ──────────────────────────────────────────────────────────
  mk('midnight',   'Midnight',   '#080808', '#101010', '#181818', '#FBBF24', 'nostalgic'),
  mk('carbon',     'Carbon',     '#0A0A0A', '#141414', '#1E1E1E', '#94A3B8', 'nostalgic'),
  mk('steel',      'Steel',      '#080D14', '#0D1520', '#12203A', '#7C8FAC', 'calm'),
  mk('onyx',       'Onyx',       '#050505', '#0A0A0A', '#0F0F0F', '#F1F5F9', 'nostalgic'),
  mk('slate',      'Slate',      '#080A0F', '#10141E', '#181E2E', '#64748B', 'calm'),
  // ── Vibrant ───────────────────────────────────────────────────────────
  mk('electric',   'Electric',   '#050A1A', '#0A1440', '#0F1E64', '#3B82F6', 'upbeat'),
  mk('neon',       'Neon',       '#051A10', '#0A3020', '#0F4A30', '#10B981', 'upbeat'),
  mk('candy',      'Candy',      '#1A0510', '#3D0828', '#5C0F3C', '#EC4899', 'upbeat'),
  mk('tropical',   'Tropical',   '#050A1A', '#0A1228', '#0F1A3A', '#22D3EE', 'upbeat'),
  mk('festival',   'Festival',   '#1A0805', '#3D1208', '#5C1E10', '#FB923C', 'upbeat'),
];

// djb2 variant — fast, good distribution
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function assignTemplate(petId: string, year: number): YIRTemplate {
  return YIR_TEMPLATES[hash(petId + String(year)) % YIR_TEMPLATES.length];
}

export const MOOD_TO_MUSIC: Record<string, YIRTemplate['musicCategory']> = {
  happy:   'upbeat',
  playful: 'upbeat',
  excited: 'upbeat',
  calm:    'calm',
  tired:   'calm',
  anxious: 'tender',
  grumpy:  'tender',
};
