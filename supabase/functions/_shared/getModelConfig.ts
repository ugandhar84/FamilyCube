// Fetches the admin-controlled AI model priority list from app_settings.
// Falls back to hardcoded defaults so every function works without DB config.

export interface ModelConfig {
  vision: string[];   // Gemini vision models in priority order
  text: string[];     // Gemini text models in priority order
  deepseek: string[]; // DeepSeek models (usually just deepseek-chat)
}

const DEFAULTS: ModelConfig = {
  vision:   ['gemini-2.5-flash', 'gemini-2.0-flash'],
  text:     ['gemini-2.5-flash', 'gemini-2.0-flash'],
  deepseek: ['deepseek-chat'],
};

// Cache per function instance (warm execution reuses this)
let cached: ModelConfig | null = null;
let cachedAt = 0;
const TTL_MS = 60_000; // re-fetch from DB at most once per minute

export async function getModelConfig(): Promise<ModelConfig> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  try {
    const url     = Deno.env.get('SUPABASE_URL')!;
    const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const res = await fetch(
      `${url}/rest/v1/app_settings?key=eq.ai_model_config&select=value&limit=1`,
      { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } },
    );

    if (res.ok) {
      const rows = await res.json() as Array<{ value: unknown }>;
      if (rows.length && rows[0].value && typeof rows[0].value === 'object') {
        const v = rows[0].value as Partial<ModelConfig>;
        cached = {
          vision:   Array.isArray(v.vision)   && v.vision.length   ? v.vision   : DEFAULTS.vision,
          text:     Array.isArray(v.text)      && v.text.length     ? v.text     : DEFAULTS.text,
          deepseek: Array.isArray(v.deepseek)  && v.deepseek.length ? v.deepseek : DEFAULTS.deepseek,
        };
        cachedAt = Date.now();
        return cached;
      }
    }
  } catch (e) {
    console.warn('[getModelConfig] DB fetch failed, using defaults:', e);
  }

  cached = DEFAULTS;
  cachedAt = Date.now();
  return cached;
}
