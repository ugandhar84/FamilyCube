/**
 * Two-layer profanity filter.
 *
 * containsProfanity(text) → boolean   — used to warn/block before sending
 * censorText(text)        → string    — replaces matched words with asterisks
 *
 * The core list is hardcoded below. Admins can extend it at runtime via
 * app_settings key 'blocked_words_extra' (JSON string array).
 * Call reloadBlockedWords() after saving new words to refresh the pattern.
 */

import { supabase } from '@/lib/supabase';

// Core list — always active, no DB required.
export const CORE_BLOCKED_WORDS: string[] = [
  'fuck', 'f+ck', 'fuk', 'fuq',
  'shit', 'sh1t',
  'ass', 'arse',
  'bitch', 'b1tch',
  'cunt',
  'dick', 'd1ck',
  'cock',
  'pussy',
  'bastard',
  'whore',
  'slut',
  'nigger', 'nigga',
  'faggot', 'fag',
  'retard',
  'piss', 'p1ss',
  'damn',
  'crap',
  'twat',
  'wank',
  'bollocks',
  'motherfucker', 'mofo',
  'asshole', 'arsehole',
  'jackass',
  'bullshit',
  'douchebag',
  'prick',
  'cum',
  'jizz',
];

function buildPattern(words: string[]): RegExp {
  const escaped = words.map(w =>
    w.split('').map(c => {
      switch (c) {
        case 'a': return '[a@4]';
        case 'e': return '[e3]';
        case 'i': return '[i1!]';
        case 'o': return '[o0]';
        case 's': return '[s$5]';
        case '+': return '\\+';
        default:  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }).join('[^a-z0-9]*')
  );
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

let _pattern = buildPattern(CORE_BLOCKED_WORDS);
let _extraWords: string[] = [];

// Call once at app start (or after admin saves new words) to merge DB extras.
export async function reloadBlockedWords(): Promise<void> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'blocked_words_extra')
      .maybeSingle();
    const extra: string[] = Array.isArray(data?.value) ? data!.value : [];
    _extraWords = extra;
    const all = [...CORE_BLOCKED_WORDS, ...extra.filter(w => w.trim())];
    _pattern = buildPattern(all);
  } catch {
    // silently keep existing pattern if DB unreachable
  }
}

export function getExtraBlockedWords(): string[] {
  return _extraWords;
}

export function containsProfanity(text: string): boolean {
  _pattern.lastIndex = 0;
  return _pattern.test(text);
}

export function censorText(text: string): string {
  _pattern.lastIndex = 0;
  return text.replace(_pattern, match => '*'.repeat(match.length));
}
