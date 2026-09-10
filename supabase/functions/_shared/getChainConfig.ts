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
  | 'general_text'
  // Registered here so the admin console's AI Chain Config editor
  // (features/admin/screens/ai-chain-config.tsx) can view/edit these
  // three use cases too [live-requested: "we should be able to configure
  // ai chain for each ai edge function"]. ask_cube_chat/flyer_parse/
  // grocery_receipt_parse do NOT yet read their chain from here at
  // runtime — each still has its own inline model-selection logic
  // (ask-cube's callModel(), parse-flyer's MODELS retry array,
  // parse-grocery-receipt's single hardcoded call). Rerouting each one
  // through getChainConfig()/runChain() is real, separate work (ask-cube
  // especially, since it's tool-calling, not a single-shot generation —
  // runChain's buildGeminiBody/buildDeepSeekMessages shape doesn't cover
  // tool declarations) — tracked as a deliberate follow-up, not done in
  // this pass, so this DEFAULTS entry only documents current behavior
  // for now rather than actually controlling it yet.
  | 'ask_cube_chat'
  | 'flyer_parse'
  | 'grocery_receipt_parse';

export type AIChainConfig = Record<UseCaseKey, ModelSlot[]>;

// gemini-1.5-flash (previously every fallback slot's second Gemini attempt)
// is retired on the current v1beta API surface — HTTP 404 "models/
// gemini-1.5-flash is not found for API version v1beta" (live-reported via
// edge logs: a real image scan failed its primary gemini-2.5-flash attempt,
// then the "fallback" slot could never have succeeded either, since that
// model no longer exists at all). Retrying the SAME gemini-2.5-flash model
// is a real retry against a transient failure (network blip, momentary
// image-processing error) — falling through to a dead model name never was.
const DEFAULTS: AIChainConfig = {
  mood_scan:      [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 12 }],
  symptom_scan:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 }],
  vet_chat:       [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 }],
  health_records: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 15 },
                   { provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 20 }],
  pet_timeline:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 12 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 15 }],
  general_vision: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  }],
  general_text:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 }],
  // Documents ask-cube/index.ts's own callModel() cascade — Claude Haiku
  // primary, Gemini fallback, DeepSeek final fallback. Not yet wired to
  // actually control ask-cube's runtime behavior (see UseCaseKey's own
  // comment above).
  ask_cube_chat:  [{ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', timeoutSecs: 20 },
                   { provider: 'gemini',    model: 'gemini-2.5-flash',          timeoutSecs: 20 },
                   { provider: 'deepseek',  model: 'deepseek-chat',             timeoutSecs: 20 }],
  // Documents parse-flyer/index.ts's own MODELS retry array — 3x
  // gemini-2.5-flash at 35s each. Not yet wired to control runtime.
  flyer_parse:    [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 35 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 35 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 35 }],
  // Documents parse-grocery-receipt/index.ts's single hardcoded Gemini
  // call (no retry/timeout wrapper exists there today — 30s picked as a
  // sane default to register here). Not yet wired to control runtime.
  grocery_receipt_parse: [{ provider: 'gemini', model: 'gemini-2.5-flash', timeoutSecs: 30 }],
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

// Call Anthropic Messages API — added so an 'anthropic' slot in a chain
// (e.g. ask_cube_chat's primary) can actually be exercised once a caller
// routes through runChain(); ask-cube itself doesn't yet (see
// UseCaseKey's own comment on why).
export async function callAnthropicSlot(
  slot: ModelSlot,
  messages: { role: string; content: string }[],
  anthropicKey: string,
  tag: string,
): Promise<CallResult> {
  const systemMsg = messages.find(m => m.role === 'system');
  const rest = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content,
  }));
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: slot.model, max_tokens: 4096, system: systemMsg?.content, messages: rest }),
  }, slot.timeoutSecs * 1000);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`[${tag}] anthropic/${slot.model} HTTP ${res.status}: ${errBody.slice(0, 120)}`);
  }
  const j = await res.json();
  const textBlock = (j.content ?? []).find((b: any) => b.type === 'text');
  const text: string = textBlock?.text ?? '';
  if (!text) throw new Error(`[${tag}] anthropic/${slot.model} returned empty content`);
  return { text, provider: 'anthropic', model: slot.model };
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
    anthropicKey?: string;
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
      if (slot.provider === 'anthropic') {
        if (!opts.anthropicKey) { errors.push(`anthropic/${slot.model}: no API key`); continue; }
        return await callAnthropicSlot(slot, opts.buildDeepSeekMessages(slot), opts.anthropicKey, opts.tag);
      }
      errors.push(`${slot.provider}/${slot.model}: unsupported provider`);
    } catch (e: any) {
      console.warn(`[${opts.tag}] slot ${slot.provider}/${slot.model} failed:`, e.message);
      errors.push(e.message ?? String(e));
    }
  }
  throw new Error(`All slots failed for ${opts.tag}: ${errors.join(' | ')}`);
}
