/**
 * aiClients.js — multi-provider AI client registry
 *
 * All providers expose the OpenAI-compatible chat.completions API so existing
 * agent code works without changes.
 *
 * Priority order (first key found in .env wins as primary):
 *   1. Cerebras   — fastest free inference, no monthly cap (RPM limited)
 *   2. SambaNova  — free, fast Llama 3.3 70B, no monthly cap
 *   3. OpenRouter — free :free models, no monthly cap
 *   4. GitHub     — free with any GitHub account PAT
 *
 * Helicone observability: set HELICONE_API_KEY in .env to proxy all calls
 * through Helicone's gateway and see live traces at helicone.ai/dashboard
 */

const OpenAI = require('openai');

/**
 * Build an OpenAI-compatible client.
 * If HELICONE_API_KEY is set, routes through Helicone gateway for observability.
 *
 * heliconePathPrefix: '/v1' for providers whose API paths include /v1 (Cerebras, SambaNova, OpenRouter)
 *                    ''    for providers whose paths don't include /v1 (GitHub Models)
 */
function makeClient(apiKey, targetURL, extraHeaders = {}, heliconePathPrefix = '/v1') {
  if (!apiKey) return null;

  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey && targetURL) {
    return new OpenAI({
      apiKey,
      baseURL: `https://gateway.helicone.ai${heliconePathPrefix}`,
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${heliconeKey}`,
        'Helicone-Target-URL': targetURL,
        ...extraHeaders,
      },
    });
  }

  return new OpenAI({ apiKey, baseURL: targetURL, defaultHeaders: extraHeaders });
}

// Lazily constructed so .env is read after dotenv.config() runs
let _providers = null;

function getProviders() {
  if (_providers) return _providers;
  const cerebrasClient = makeClient(process.env.CEREBRAS_API_KEY, 'https://api.cerebras.ai/v1');
  _providers = {
    // Groq — fast inference (OpenAI-compatible API)
    groq: {
      name: 'Groq Llama-3.3-70B',
      client: makeClient(process.env.GROQ_API_KEY, 'https://api.groq.com/openai/v1'),
      model: 'llama-3.3-70b-versatile',
      fallbackModels: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
      analysisModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    },
    // OpenAI — paid key, gpt-4o, used as dedicated judge + Phase 1 tool calls
    openai: {
      name: 'OpenAI gpt-4o',
      client: makeClient(process.env.OPENAI_API_KEY, 'https://api.openai.com/v1'),
      model: 'gpt-4o',
    },
    // Cerebras Qwen 235B — last-resort fallback, free but RPM-limited
    cerebras: {
      name: 'Cerebras Qwen-235B',
      client: cerebrasClient,
      model: 'qwen-3-235b-a22b-instruct-2507',
    },
    // SambaNova — free, OpenAI-compatible, no monthly cap
    sambanova: {
      name: 'SambaNova Llama-3.3-70B',
      client: makeClient(process.env.SAMBANOVA_API_KEY, 'https://api.sambanova.ai/v1'),
      model: 'Meta-Llama-3.3-70B-Instruct',
    },
    // OpenRouter — direct client (bypasses Helicone; Helicone gateway doesn't forward
    // Authorization header correctly to OpenRouter, causing silent 401s)
    openrouter: {
      name: 'OpenRouter',
      client: process.env.OPENROUTER_API_KEY
        ? new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5173',
              'X-Title': 'MedAssist AI',
            },
          })
        : null,
      // Tool-calling fallbacks (need function calling support)
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      fallbackModels: [
        'meta-llama/llama-3.1-8b-instruct:free',
        'mistralai/mistral-7b-instruct:free',
        'google/gemma-3-27b-it:free',
        'google/gemma-3-12b-it:free',
        'google/gemma-3n-e4b-it:free',
        'google/gemma-3-4b-it:free',
      ],
      // Analysis-only models (no tool calling needed — bigger/stronger free models)
      analysisModels: [
        'deepseek/deepseek-chat-v3-0324:free',
        'deepseek/deepseek-r1-distill-llama-70b:free',
        'google/gemma-3-27b-it:free',
        'mistralai/mistral-nemo:free',
        'meta-llama/llama-3.1-8b-instruct:free',
      ],
    },
    // GitHub Models — gpt-4o-mini, needs PAT with models:read scope
    // Note: GitHub's endpoint has no /v1 prefix, so heliconePathPrefix = ''
    github: {
      name: 'GitHub gpt-4o-mini',
      client: makeClient(process.env.GITHUB_TOKEN, 'https://models.inference.ai.azure.com', {}, ''),
      model: 'gpt-4o-mini',
    },
  };

  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey) {
    console.log('[aiClients] Helicone observability enabled — traces at helicone.ai/dashboard');
  }

  return _providers;
}

// Ensemble agents — free models run in parallel (OpenAI excluded: it's the dedicated judge)
const PRIORITY_ORDER = ['groq', 'sambanova', 'github', 'openrouter', 'cerebras'];

// Tool-calling — OpenAI first (paid, most reliable function calling), then free fallbacks
const TOOL_PROVIDERS_ORDER = ['openai', 'groq', 'sambanova', 'github', 'cerebras'];

// Judge — OpenAI gpt-4o first (paid, independent from ensemble agents → best accuracy)
const JUDGE_PRIORITY_ORDER = ['openai', 'sambanova', 'github'];

// Voice/lightweight order — GitHub gpt-4o-mini first (generous rate limits, fast JSON extraction)
const VOICE_PRIORITY_ORDER = ['groq', 'github', 'sambanova', 'openrouter', 'cerebras'];

// Providers to exclude (set via EXCLUDED_AI_PROVIDERS env var, comma-separated)
const EXCLUDED_PROVIDERS = new Set(
  (process.env.EXCLUDED_AI_PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean)
);

function _filterAvailable(order) {
  const providers = getProviders();
  return order.filter(
    (name) => providers[name]?.client != null && !EXCLUDED_PROVIDERS.has(name)
  );
}

/** Returns provider names for heavyweight tasks (agents), in priority order */
function getAvailableProviders() {
  return _filterAvailable(PRIORITY_ORDER);
}

/** Returns provider names that reliably support tool/function calling */
function getAvailableToolProviders() {
  return _filterAvailable(TOOL_PROVIDERS_ORDER);
}

/** Returns provider names for lightweight tasks (voice parsing, quick JSON extraction) */
function getAvailableVoiceProviders() {
  return _filterAvailable(VOICE_PRIORITY_ORDER);
}

/** Returns provider names for consensus judge — OpenAI first for highest accuracy */
function getAvailableJudgeProviders() {
  return _filterAvailable(JUDGE_PRIORITY_ORDER);
}

/** Best available tool-capable provider — skips ones already rate-limited */
function getPrimaryToolProvider() {
  const providers = getProviders();
  // Prefer non-limited tool providers
  const toolAvailable = getAvailableToolProviders().filter(name => !isProviderLimited(name));
  if (toolAvailable.length > 0) return providers[toolAvailable[0]];
  // All tool providers limited — fall back to any available provider
  const anyAvailable = getAvailableProviders().filter(name => !isProviderLimited(name));
  if (anyAvailable.length > 0) return providers[anyAvailable[0]];
  // Everything limited — return first configured provider and let it retry/fail gracefully
  const all = getAvailableProviders();
  if (all.length > 0) return providers[all[0]];
  throw new Error('No AI provider configured. Add CEREBRAS_API_KEY or GITHUB_TOKEN to your .env file.');
}

/** Primary provider — first available key in .env */
function getPrimaryProvider() {
  const available = getAvailableProviders();
  if (available.length === 0) {
    throw new Error(
      'No AI provider configured. Add CEREBRAS_API_KEY or GITHUB_TOKEN to your .env file.'
    );
  }
  return getProviders()[available[0]];
}

// ─── Shared rate-limit tracking ───────────────────────────────────────────────
// Used by both agentRunner and ensembleRunner so a 429 in Phase 1 prevents
// wasted retries in Phase 2 ensemble.

const _limitedProviders = new Map(); // name → { blockedAt, ttl }
const HARD_LIMIT_TTL_MS = 5 * 60 * 1000; // 5 min: daily/account quota exhausted
const RPM_LIMIT_TTL_MS  = 3 * 60 * 1000; // 3 min: per-minute RPM limit (prevents rapid re-retry)

function isProviderLimited(name) {
  const entry = _limitedProviders.get(name);
  if (!entry) return false;
  if (Date.now() - entry.blockedAt > entry.ttl) {
    _limitedProviders.delete(name);
    console.log(`[aiClients] Provider ${name} rate-limit TTL expired — will retry.`);
    return false;
  }
  return true;
}

function markProviderLimited(name, ttl = HARD_LIMIT_TTL_MS) {
  const now = Date.now();
  const providers = getProviders();
  const limitedClient = providers[name]?.client;
  // Also block any sibling provider sharing the same API key
  for (const [n, p] of Object.entries(providers)) {
    if (p.client === limitedClient) _limitedProviders.set(n, { blockedAt: now, ttl });
  }
  _limitedProviders.set(name, { blockedAt: now, ttl });
}

function markProviderLimitedRPM(name) {
  markProviderLimited(name, RPM_LIMIT_TTL_MS);
}

module.exports = {
  getProviders, getAvailableProviders, getAvailableToolProviders,
  getAvailableVoiceProviders, getAvailableJudgeProviders,
  getPrimaryProvider, getPrimaryToolProvider,
  isProviderLimited, markProviderLimited, markProviderLimitedRPM,
};
