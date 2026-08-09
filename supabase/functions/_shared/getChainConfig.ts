// Fetches per-use-case AI fallback chains from app_settings.
// Falls back to hardcoded defaults matching current production behaviour.

export interface ModelSlot {
  provider: 'gemini' | 'deepseek' | 'openai' | 'anthropic' | string;
  model: string;
  timeoutSecs: number;
}

export type UseCaseKey =
  | 'mood_scan'
  | 'symptom_scan'
  | 'vet_chat'
  | 'health_records'
  | 'pet_timeline'
  | 'general_vision'
  | 'general_text';

export type AIChainConfig = Record<UseCaseKey, ModelSlot[]>;

const DEFAULTS: AIChainConfig = {
  mood_scan:      [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 12 }],
  symptom_scan:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 10 }],
  vet_chat:       [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 10 }],
  health_records: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 15 },
                   { provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 20 }],
  pet_timeline:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 12 },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 15 }],
  general_vision: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 8  }],
  general_text:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 10 }],
};

let cached: AIChainConfig | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export async function getChainConfig(): Promise<AIChainConfig> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  try {
    const url    = Deno.env.get('SUPABASE_URL')!;
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const res = await fetch(
      `${url}/rest/v1/app_settings?key=eq.ai_chain_config&select=value&limit=1`,
      { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } },
    );

    if (res.ok) {
      const rows = await res.json() as Array<{ value: unknown }>;
      if (rows.length && rows[0].value && typeof rows[0].value === 'object') {
        const v = rows[0].value as Partial<AIChainConfig>;
        const merged: AIChainConfig = { ...DEFAULTS };
        for (const key of Object.keys(DEFAULTS) as UseCaseKey[]) {
          const slots = v[key];
          if (Array.isArray(slots) && slots.length > 0) merged[key] = slots as ModelSlot[];
        }
        cached = merged;
        cachedAt = Date.now();
        return cached;
      }
    }
  } catch (e) {
    console.warn('[getChainConfig] DB fetch failed, using defaults:', e);
  }

  cached = { ...DEFAULTS };
  cachedAt = Date.now();
  return cached;
}

// ── Provider call helpers ──────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface CallResult {
  text: string;
  provider: string;
  model: string;
}

// Call Gemini generateContent with a pre-built request body.
export async function callGeminiSlot(
  slot: ModelSlot,
  body: object,
  geminiKey: string,
  tag: string,
): Promise<CallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${slot.model}:generateContent?key=${geminiKey}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, slot.timeoutSecs * 1000);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`[${tag}] gemini/${slot.model} HTTP ${res.status}: ${errBody.slice(0, 120)}`);
  }
  const j = await res.json();
  if (j.error) throw new Error(`[${tag}] gemini/${slot.model} API error: ${j.error.message}`);
  const text: string = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error(`[${tag}] gemini/${slot.model} returned empty content`);
  return { text, provider: 'gemini', model: slot.model };
}

// Call DeepSeek chat/completions with an OpenAI-compatible body.
export async function callDeepSeekSlot(
  slot: ModelSlot,
  messages: { role: string; content: string }[],
  deepseekKey: string,
  tag: string,
  extra?: object,
): Promise<CallResult> {
  const res = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseekKey}` },
    body: JSON.stringify({ model: slot.model, messages, ...extra }),
  }, slot.timeoutSecs * 1000);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`[${tag}] deepseek/${slot.model} HTTP ${res.status}: ${errBody.slice(0, 120)}`);
  }
  const j = await res.json();
  const text: string = j.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error(`[${tag}] deepseek/${slot.model} returned empty content`);
  return { text, provider: 'deepseek', model: slot.model };
}

// Run a chain of slots, calling each in order until one succeeds.
// buildGeminiBody / buildDeepSeekMessages are called lazily per-provider.
export async function runChain(
  chain: ModelSlot[],
  opts: {
    geminiKey?: string;
    deepseekKey?: string;
    tag: string;
    buildGeminiBody: (slot: ModelSlot) => object;
    buildDeepSeekMessages: (slot: ModelSlot) => { role: string; content: string }[];
    deepseekExtra?: object;
  },
): Promise<CallResult> {
  const errors: string[] = [];
  for (const slot of chain) {
    try {
      if (slot.provider === 'gemini' || slot.provider === 'custom') {
        if (!opts.geminiKey) { errors.push(`${slot.provider}/${slot.model}: no API key`); continue; }
        return await callGeminiSlot(slot, opts.buildGeminiBody(slot), opts.geminiKey, opts.tag);
      }
      if (slot.provider === 'deepseek') {
        if (!opts.deepseekKey) { errors.push(`deepseek/${slot.model}: no API key`); continue; }
        return await callDeepSeekSlot(slot, opts.buildDeepSeekMessages(slot), opts.deepseekKey, opts.tag, opts.deepseekExtra);
      }
      errors.push(`${slot.provider}/${slot.model}: unsupported provider`);
    } catch (e: any) {
      console.warn(`[${opts.tag}] slot ${slot.provider}/${slot.model} failed:`, e.message);
      errors.push(e.message ?? String(e));
    }
  }
  throw new Error(`All slots failed for ${opts.tag}: ${errors.join(' | ')}`);
}
