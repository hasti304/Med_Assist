const {
  getAvailableToolProviders, getProviders,
  getPrimaryToolProvider,
  isProviderLimited, markProviderLimited, markProviderLimitedRPM,
} = require('../utils/aiClients');

const MAX_TURNS = 6;
const INTER_TURN_DELAY_MS = 500;

/** Sleep for ms milliseconds */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveProvider(clientOverride, modelOverride) {
  const primary = getPrimaryToolProvider();
  return {
    groq: clientOverride || primary.client,
    MODEL: modelOverride || primary.model,
  };
}

// Track per-provider model index for iterating fallback models within a provider
const _providerModelIndex = new Map(); // providerName → index into fallbackModels

/**
 * Returns the next available provider/model, cycling through fallbackModels before
 * switching providers. Returns null when all options are exhausted.
 */
function getNextProvider(currentProviderName, currentModel) {
  // Use tool-capable providers only — OpenRouter free models don't support function calling
  const available = getAvailableToolProviders();
  const providers = getProviders();

  // Scan forward through fallback models on the same provider, skipping currentModel
  if (currentProviderName) {
    const p = providers[currentProviderName];
    const fallbacks = p?.fallbackModels;
    if (fallbacks?.length && !isProviderLimited(currentProviderName)) {
      const startIdx = _providerModelIndex.get(currentProviderName) ?? 0;
      for (let i = startIdx; i < fallbacks.length; i++) {
        if (fallbacks[i] !== currentModel) {
          _providerModelIndex.set(currentProviderName, i + 1);
          console.log(`[agentRunner] Trying next model on ${currentProviderName}: ${fallbacks[i]}`);
          return { client: p.client, model: fallbacks[i], providerName: currentProviderName };
        }
      }
      // All fallback models exhausted on this provider — mark limited so the loop below skips it
      markProviderLimited(currentProviderName);
    }
  }

  // Move to the next available tool-capable provider
  for (const name of available) {
    if (!isProviderLimited(name)) {
      _providerModelIndex.delete(name);
      console.log(`[agentRunner] Falling back to provider: ${providers[name].name} (${name})`);
      return { client: providers[name].client, model: providers[name].model, providerName: name };
    }
  }
  return null;
}

/**
 * Identify which provider name a client+model belongs to.
 */
function identifyProvider(client, model) {
  const providers = getProviders();
  for (const [name, p] of Object.entries(providers)) {
    if (p.client === client && p.model === model) return name;
  }
  // Fallback: match by client only
  for (const [name, p] of Object.entries(providers)) {
    if (p.client === client) return name;
  }
  return null;
}

/**
 * Call AI with automatic retry and multi-provider fallback.
 *
 * Fallback triggers:
 *  - Any status with x-should-retry: false → hard failure, switch provider
 *  - Any 5xx after retries exhausted       → try next provider before giving up
 *  - 429 with x-should-retry: true/absent  → exponential backoff retry (same provider)
 *
 * Returns { response, client, model } so callers can track provider switches.
 */
async function groqCreateWithRetry(client, params, maxRetries = 2) {
  let groq = client;
  let currentModel = params.model;
  // Track current provider name so we can mark it limited accurately
  let currentProviderName = identifyProvider(groq, currentModel);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({ ...params, model: currentModel });
      // Some providers return 200 with empty choices when overloaded — treat as a retryable error
      if (!response.choices?.length) {
        const emptyErr = new Error(`${currentProviderName || currentModel} returned empty choices`);
        emptyErr.status = 503;
        throw emptyErr;
      }
      return { response, client: groq, model: currentModel };
    } catch (err) {
      const status = err.status;
      const headers = err.headers;
      const shouldRetry =
        (typeof headers?.get === 'function' ? headers.get('x-should-retry') : null) ||
        headers?.['x-should-retry'] ||
        null;

      // Hard failure: provider explicitly says don't retry (429 quota cap, 503 down, etc.)
      if (shouldRetry === 'false') {
        if (currentProviderName) markProviderLimited(currentProviderName);
        console.warn(`[agentRunner] Hard ${status} on ${currentProviderName || 'unknown'} (x-should-retry: false). Trying next provider…`);

        const next = getNextProvider(currentProviderName, currentModel);
        if (next) {
          groq = next.client;
          currentModel = next.model;
          currentProviderName = next.providerName;
          attempt = -1;
          continue;
        }
        console.error('[agentRunner] All providers exhausted — no fallback left.');
        throw err;
      }

      // 400 invalid_request — tool-call failures should not block ensemble (short RPM cooldown only)
      if (status === 400 && err.error?.type === 'invalid_request_error') {
        const errMsg = err.message || err.error?.message || '';
        const isToolFailure = /tool|function|failed_generation/i.test(errMsg);
        if (currentProviderName) {
          if (isToolFailure) markProviderLimitedRPM(currentProviderName);
          else markProviderLimited(currentProviderName);
        }
        console.warn(`[agentRunner] 400 invalid_request on ${currentProviderName || 'unknown'} — skipping to next provider…`);
        const next = getNextProvider(currentProviderName, currentModel);
        if (next) {
          groq = next.client;
          currentModel = next.model;
          currentProviderName = next.providerName;
          attempt = -1;
          continue;
        }
        throw err;
      }

      // Daily limit exhausted — skip to next provider immediately
      if (status === 429) {
        const remainingDay =
          (typeof headers?.get === 'function' ? headers.get('x-ratelimit-remaining-requests-day') : null) ||
          headers?.['x-ratelimit-remaining-requests-day'] ||
          null;
        if (remainingDay === '0') {
          if (currentProviderName) markProviderLimited(currentProviderName);
          console.warn(`[agentRunner] Daily limit hit on ${currentProviderName || 'unknown'} — skipping to next provider…`);
          const next = getNextProvider(currentProviderName, currentModel);
          if (next) { groq = next.client; currentModel = next.model; currentProviderName = next.providerName; attempt = -1; continue; }
          throw err;
        }
      }

      // Soft 429 — if a fallback exists, switch immediately; only backoff if no alternative
      if (status === 429 && attempt < maxRetries) {
        const next = getNextProvider(currentProviderName, currentModel);
        if (next) {
          // Quota exhaustion (daily/account) → hard limit; RPM → short limit
          const errType = err.error?.error?.type || err.error?.type || '';
          const errCode = err.error?.error?.code || err.error?.code || '';
          const isQuotaExhausted = errType === 'rate_limit_exceeded' || errCode === 'request_quota_exceeded';
          if (currentProviderName) {
            if (isQuotaExhausted) markProviderLimited(currentProviderName);  // 5 min
            else markProviderLimitedRPM(currentProviderName);               // 3 min
          }
          console.warn(`[agentRunner] 429 on ${currentProviderName || 'unknown'} (${isQuotaExhausted ? 'quota' : 'RPM'}) — fast-switching to ${next.providerName}`);
          groq = next.client; currentModel = next.model; currentProviderName = next.providerName;
          attempt = -1; continue;
        }
        // No fallback available — wait with backoff and retry same provider
        const retryAfterRaw =
          (typeof headers?.get === 'function' ? headers.get('retry-after') : null) ||
          headers?.['retry-after'] ||
          null;
        const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : null;
        const backoff = Math.min(5 * Math.pow(2, attempt), 30);
        const waitSec = retryAfterSec && retryAfterSec < 60 ? retryAfterSec + 1 : backoff;
        console.log(`[agentRunner] 429 on ${currentProviderName}, no fallback — waiting ${waitSec}s…`);
        await sleep(waitSec * 1000);
        continue;
      }

      // 429 with no retries left — switch provider
      if (status === 429) {
        const errType = err.error?.error?.type || err.error?.type || '';
        const errCode = err.error?.error?.code || err.error?.code || '';
        const isQuotaExhausted = errType === 'rate_limit_exceeded' || errCode === 'request_quota_exceeded';
        if (currentProviderName) {
          if (isQuotaExhausted) markProviderLimited(currentProviderName);
          else markProviderLimitedRPM(currentProviderName);
        }
        console.warn(`[agentRunner] 429 on ${currentProviderName || 'unknown'} — trying next provider…`);
        const next = getNextProvider(currentProviderName, currentModel);
        if (next) { groq = next.client; currentModel = next.model; currentProviderName = next.providerName; attempt = -1; continue; }
        throw err;
      }

      // 4xx client errors (e.g. OpenRouter 404 model not found) — try next model/provider, don't mark limited immediately
      if (status >= 400 && status < 500) {
        const next = getNextProvider(currentProviderName, currentModel);
        if (next) {
          if (next.providerName !== currentProviderName) {
            // Exhausted all models on current provider — mark it limited
            if (currentProviderName) markProviderLimited(currentProviderName);
            console.warn(`[agentRunner] ${status} on ${currentProviderName || 'unknown'} (all models tried) — switching to ${next.providerName}`);
          } else {
            console.warn(`[agentRunner] ${status} on model ${currentModel} — trying next model on ${currentProviderName}`);
          }
          groq = next.client;
          currentModel = next.model;
          currentProviderName = next.providerName;
          attempt = -1;
          continue;
        }
        if (currentProviderName) markProviderLimited(currentProviderName);
        console.warn(`[agentRunner] ${status} on ${currentProviderName || 'unknown'} — all providers exhausted`);
        throw err;
      }

      // 5xx server error — retry, then try next provider as last resort
      if (status >= 500 && attempt < maxRetries) {
        const backoff = Math.min(3 * Math.pow(2, attempt), 15);
        console.log(`[agentRunner] Server error (${status}). Waiting ${backoff}s before retry ${attempt + 1}/${maxRetries}…`);
        await sleep(backoff * 1000);
        continue;
      }

      // Retries exhausted on a server error — try next provider before giving up
      if (status >= 500) {
        if (currentProviderName) markProviderLimited(currentProviderName);
        console.warn(`[agentRunner] ${status} on ${currentProviderName || 'unknown'} after ${maxRetries} retries. Trying next provider…`);

        const next = getNextProvider(currentProviderName, currentModel);
        if (next) {
          groq = next.client;
          currentModel = next.model;
          currentProviderName = next.providerName;
          attempt = -1;
          continue;
        }
      }

      throw err;
    }
  }
}

/**
 * Shared Groq agentic loop (OpenAI-compatible tool calling).
 * @param {object} opts
 * @param {string}   opts.systemInstruction  - System prompt
 * @param {string}   opts.userMessage        - Initial user message
 * @param {Array}    opts.tools              - Tool definitions (OpenAI function format)
 * @param {object}   opts.toolHandlers       - { toolName: async fn(args) }
 * @param {Function} [opts.onStep]           - Called after each tool execution: fn(step)
 * @param {number}   [opts.maxTokens]        - Max tokens per Groq call (default 2000)
 * @returns {{ text: string, steps: Array, turns: number }}
 */
async function runAgent({ systemInstruction, userMessage, tools, toolHandlers, onStep, maxTokens = 1500, client: clientOverride, model: modelOverride }) {
  let { groq, MODEL } = resolveProvider(clientOverride, modelOverride);

  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userMessage },
  ];

  const groqTools = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.properties,
        required: t.parameters.required || [],
      },
    },
  }));

  const steps = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      const result = await groqCreateWithRetry(groq, {
        model: MODEL,
        messages,
        tools: groqTools,
        tool_choice: 'auto',
        max_tokens: maxTokens,
      });
      response = result.response;
      // Persist any provider switch so subsequent calls use the new provider
      groq = result.client;
      MODEL = result.model;
    } catch (err) {
      // tool_use_failed (400) — model generated malformed tool call JSON.
      // Recover: strip tools and make one final plain-text call so the model
      // can still write its answer using whatever it reasoned so far.
      if (err.status === 400 && err.error?.error?.code === 'tool_use_failed') {
        console.warn('[agentRunner] tool_use_failed — falling back to tool-free completion.');
        try {
          const fallback = await groqCreateWithRetry(groq, {
            model: MODEL,
            messages: [
              ...messages,
              {
                role: 'user',
                content: 'Please write your final answer now as a JSON array in a markdown code block, based on your reasoning so far. Do not attempt any more tool calls.',
              },
            ],
            max_tokens: maxTokens,
            // no tools — forces plain text response
          });
          const fallbackText = fallback.response.choices[0]?.message?.content || '';
          groq = fallback.client;
          MODEL = fallback.model;
          console.log('[agentRunner] Fallback completion succeeded.');
          return { text: fallbackText, steps, turns: turn + 1 };
        } catch (fallbackErr) {
          console.error('[agentRunner] Fallback completion also failed:', fallbackErr.message);
          return { text: '', steps, turns: turn + 1 };
        }
      }
      throw err;
    }

    const choice = response.choices?.[0];
    if (!choice) {
      console.warn('[agentRunner] Provider returned empty choices — treating as completion.');
      return { text: '', steps, turns: turn + 1 };
    }
    const message = choice.message;

    messages.push(message);

    // No tool calls — agent is done
    if (choice.finish_reason === 'stop' || !message.tool_calls?.length) {
      return { text: message.content || '', steps, turns: turn + 1 };
    }

    // Execute each tool call
    for (const toolCall of message.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function;
      const step = { tool: name, timestamp: new Date().toISOString() };

      let args = {};
      try { args = JSON.parse(argsStr); } catch { args = {}; }
      step.args = args;

      const handler = toolHandlers[name];
      let result;
      if (!handler) {
        result = { error: `Unknown tool: ${name}` };
      } else {
        try {
          result = await handler(args);
        } catch (err) {
          result = { error: err.message };
        }
      }

      step.result = result;
      steps.push(step);
      if (onStep) onStep(step);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Small delay between turns to avoid burst rate limits
    await sleep(INTER_TURN_DELAY_MS);
  }

  // MAX_TURNS reached — make one final tool-free call to extract whatever answer the model has
  console.warn('[agentRunner] MAX_TURNS reached — requesting final tool-free completion.');
  try {
    const final = await groqCreateWithRetry(groq, {
      model: MODEL,
      messages: [
        ...messages,
        {
          role: 'user',
          content: 'You have completed your research. Now write your final answer as a JSON array or object in a markdown code block based on everything you have gathered. Do not call any more tools.',
        },
      ],
      max_tokens: maxTokens,
    });
    const finalText = final.response.choices[0]?.message?.content || '';
    return { text: finalText, steps, turns: MAX_TURNS };
  } catch (err) {
    console.error('[agentRunner] MAX_TURNS final completion failed:', err.message);
    return { text: '', steps, turns: MAX_TURNS };
  }
}

module.exports = { runAgent, MAX_TURNS };
