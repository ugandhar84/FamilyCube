export interface GroomType { key: string; emoji: string; label: string }

export const GROOM_TYPES_BY_SPECIES: Record<string, GroomType[]> = {
  dog:    [
    { key: 'brush',     emoji: '🪮', label: 'Brushing'    },
    { key: 'bath',      emoji: '🛁', label: 'Bath'         },
    { key: 'nails',     emoji: '💅', label: 'Nail trim'    },
    { key: 'ear_clean', emoji: '👂', label: 'Ear clean'    },
    { key: 'trim',      emoji: '✂️',  label: 'Haircut'      },
  ],
  cat:    [
    { key: 'brush',     emoji: '🪮', label: 'Brushing'    },
    { key: 'nails',     emoji: '💅', label: 'Nail trim'    },
    { key: 'bath',      emoji: '🛁', label: 'Bath'         },
    { key: 'ear_clean', emoji: '👂', label: 'Ear clean'    },
    { key: 'dental',    emoji: '🦷', label: 'Dental'       },
  ],
  rabbit: [
    { key: 'brush',     emoji: '🪮', label: 'Brushing'    },
    { key: 'nails',     emoji: '💅', label: 'Nail trim'    },
  ],
  horse:  [
    { key: 'brush',     emoji: '🪮', label: 'Brushing'    },
    { key: 'hoof_trim', emoji: '🐴', label: 'Hoof trim'    },
    { key: 'bath',      emoji: '🛁', label: 'Bath'         },
    { key: 'mane_tail', emoji: '✂️',  label: 'Mane & tail'  },
  ],
  bird:   [
    { key: 'bath',       emoji: '🛁', label: 'Water bath'  },
    { key: 'nails',      emoji: '💅', label: 'Nail trim'   },
    { key: 'cage_clean', emoji: '🧹', label: 'Cage clean'  },
  ],
  fish:   [
    { key: 'tank_clean',  emoji: '🧹', label: 'Tank cleaning' },
    { key: 'water_qual',  emoji: '💧', label: 'Water quality' },
    { key: 'filter',      emoji: '💨', label: 'Filter maintenance' },
  ],
  hamster: [
    { key: 'cage_clean',  emoji: '🧹', label: 'Cage cleaning' },
    { key: 'bedding',     emoji: '🏠', label: 'Bedding change' },
    { key: 'teeth_trim',  emoji: '🦷', label: 'Teeth trimming' },
  ],
  turtle: [
    { key: 'shell_clean', emoji: '🐢', label: 'Shell cleaning' },
    { key: 'basking',     emoji: '☀️', label: 'Basking area setup' },
    { key: 'water_change',emoji: '💧', label: 'Water change' },
    { key: 'uvb_light',   emoji: '💡', label: 'UVB light check' },
  ],
};

export const GROOM_TYPES_DEFAULT: GroomType[] = [
  { key: 'brush', emoji: '🪮', label: 'Brushing'  },
  { key: 'bath',  emoji: '🛁', label: 'Bath'       },
  { key: 'nails', emoji: '💅', label: 'Nail trim'  },
];

export const GROOM_PHOTO_TYPES = new Set(['bath', 'trim']);

export interface GroomPreset { days: number; label: string }

export const GROOM_PRESETS: Record<string, GroomPreset[]> = {
  brush:       [{ days: 1, label: 'Daily' }, { days: 2, label: 'Every 2 days' }, { days: 3, label: 'Every 3 days' }, { days: 7, label: 'Weekly' }],
  bath:        [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 21, label: 'Every 3 wks' }, { days: 30, label: 'Monthly' }],
  nails:       [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 21, label: 'Every 3 wks' }, { days: 30, label: 'Monthly' }],
  ear_clean:   [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 30, label: 'Monthly' }],
  trim:        [{ days: 28, label: 'Every 4 wks' }, { days: 42, label: 'Every 6 wks' }, { days: 56, label: 'Every 8 wks' }],
  dental:      [{ days: 2, label: 'Every 2 days' }, { days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }],
  hoof_trim:   [{ days: 42, label: 'Every 6 wks' }, { days: 56, label: 'Every 8 wks' }, { days: 84, label: 'Every 12 wks' }],
  mane_tail:   [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 30, label: 'Monthly' }],
  cage_clean:  [{ days: 1, label: 'Daily' }, { days: 2, label: 'Every 2 days' }, { days: 3, label: 'Every 3 days' }],
  tank_clean:  [{ days: 3, label: 'Every 3 days' }, { days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }],
  water_qual:  [{ days: 1, label: 'Daily' }, { days: 2, label: 'Every 2 days' }, { days: 3, label: 'Every 3 days' }],
  filter:      [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 30, label: 'Monthly' }],
  bedding:     [{ days: 2, label: 'Every 2 days' }, { days: 3, label: 'Every 3 days' }, { days: 7, label: 'Weekly' }],
  teeth_trim:  [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 30, label: 'Monthly' }],
  shell_clean: [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 30, label: 'Monthly' }],
  basking:     [{ days: 1, label: 'Daily' }, { days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }],
  water_change:[{ days: 3, label: 'Every 3 days' }, { days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }],
  uvb_light:   [{ days: 7, label: 'Weekly' }, { days: 14, label: 'Every 2 wks' }, { days: 30, label: 'Monthly' }],
};

export const GROOM_DEFAULTS: Record<string, number> = {
  brush: 2, bath: 14, nails: 14, ear_clean: 7, trim: 42, dental: 7, hoof_trim: 42, mane_tail: 7, cage_clean: 1,
  tank_clean: 7, water_qual: 1, filter: 14, bedding: 2, teeth_trim: 14, shell_clean: 14, basking: 1, water_change: 7, uvb_light: 7,
};

export function groomTypesForSpecies(species?: string | null): GroomType[] {
  return GROOM_TYPES_BY_SPECIES[species ?? ''] ?? GROOM_TYPES_DEFAULT;
}
