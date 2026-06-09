/**
 * ensembleRunner.js
 *
 * Runs the same prompt on all configured AI providers in parallel, then uses a
 * "consensus judge" call to merge the outputs into a single higher-accuracy result.
 *
 * Usage:
 *   const { runEnsembleWithConsensus } = require('./ensembleRunner');
 *   const { consensusRaw, agentCount, agentOutputs } = await runEnsembleWithConsensus(
 *     systemPrompt, userMessage, 'disease_diagnosis'
 *   );
 */

const { getProviders, getAvailableProviders, getAvailableJudgeProviders, isProviderLimited, markProviderLimited } = require('../utils/aiClients');

// ─── Low-level helpers ────────────────────────────────────────────────────────

async function callProvider(provider, systemPrompt, userMessage, maxTokens = 2000, isJudge = false) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });

  // For analysis tasks, prefer analysisModels (larger, no tool-use needed);
  // fall back to fallbackModels or the primary model
  const modelsToTry = provider.analysisModels || provider.fallbackModels || [provider.model];

  // Tag calls for Helicone observability so judge calls are visually distinct
  const heliconeHeaders = process.env.HELICONE_API_KEY ? {
    'Helicone-Property-Call-Type': isJudge ? 'consensus-judge' : 'ensemble-agent',
  } : {};

  let lastErr;
  for (const model of modelsToTry) {
    try {
      const response = await provider.client.chat.completions.create({
        model,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
      }, { headers: heliconeHeaders });
      const msg = response.choices[0]?.message;
      // Some models (reasoning/thinking) put output in reasoning_content with null content
      const text = msg?.content || msg?.reasoning_content || '';
      if (!text) {
        const noContentErr = new Error(`${provider.name} model ${model} returned empty content`);
        noContentErr.status = 400;
        throw noContentErr;
      }
      if (model !== provider.model) {
        console.log(`[ensembleRunner] ${provider.name}: using fallback model ${model}`);
      }
      return text.trim();
    } catch (err) {
      // 429 = overloaded, 503 = service down, 404 = model unavailable, 400 = provider error — try next model
      if (err.status === 429 || err.status === 503 || err.status === 404 || err.status === 400) {
        lastErr = err;
        continue;
      }
      throw err; // non-retryable error
    }
  }
  // All models exhausted — throw with clean message (not the raw API error object)
  const exhaustedErr = new Error(`${provider.name}: all ${modelsToTry.length} models unavailable (${lastErr?.status})`);
  exhaustedErr.status = lastErr?.status;
  throw exhaustedErr;
}

// ─── Consensus task instructions ─────────────────────────────────────────────

const TASK_INSTRUCTIONS = {
  disease_diagnosis: `
Compare the disease diagnosis lists from each agent.
- Diseases predicted by 2+ agents: assign confidence 0.8–1.0
- Diseases predicted by only 1 agent: assign confidence 0.4–0.6
- Merge into a single ranked JSON array of top 5 diseases (highest confidence first)
- Add "consensus_count" (how many agents predicted it) and "confidence" (0–1) fields to each item
- Keep all original fields: disease, icd_code, icd_description, probability, description, matched_symptoms, reasoning
- Return ONLY the JSON array, no markdown fences`,

  blood_analysis: `
Compare the medical analyses from each agent.
- Where agents agree, use the consensus value
- For conflicts, prefer the more conservative/safer medical recommendation
- Merge into one comprehensive JSON object preserving all sections
- Add a "consensus_note" field to each top-level section indicating agreement level (high/medium/low)
- Return ONLY the JSON object, no markdown fences`,

  test_recommendations: `
Compare blood test recommendation lists from each agent.
- Tests recommended by 2+ agents are high priority — keep them all
- Tests from only 1 agent: include if clinically important, mark with lower urgency
- Deduplicate (same test with different names counts as one — be fuzzy)
- Return a single JSON array sorted by how many agents recommended each test
- Add "consensus_count" field to each item
- Return ONLY the JSON array, no markdown fences`,

  treatment_plan: `
Compare the treatment plans from each agent.
- Medications recommended by 2+ agents: HIGH confidence — keep as-is
- Medications from only 1 agent: include only if FDA-approved and clinically justified
- For conflicting dosages: prefer the LOWER/SAFER dose (start low, titrate up)
- For conflicting durations: prefer the SHORTER duration unless chronic condition
- NEVER include medications the patient is allergic to (check allergies in context)
- Flag any drug-drug interactions between recommended treatments
- Deduplicate by generic name (same drug, different brands = one entry)
- Return ONLY the JSON object with "treatment_solutions" array, no markdown fences
- Each item: { condition, medication, generic_name, dosage, frequency, duration, route, fda_approved, evidence, precautions }`,

  drug_interactions: `
Compare drug interaction analyses from each agent.
- Interactions flagged by 2+ agents: high confidence — keep severity as-is or upgrade
- Interactions flagged by only 1 agent: include but note lower confidence
- Merge into one JSON object with "interactions" array, "summary" string, and "safe_combinations" array
- Each interaction: { drugs, severity (Major/Moderate/Minor/None), mechanism, description, recommendation }
- For conflicting severities, use the MORE SEVERE rating (patient safety first)
- Deduplicate drug pairs (A+B = B+A)
- Return ONLY the JSON object, no markdown fences`,
};

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Run the same prompt on all available providers in parallel.
 * Returns array of { provider, providerName, output } for successful calls.
 */
// Cap parallel providers to limit free-tier API consumption
const MAX_ENSEMBLE_PROVIDERS = 2;

async function runParallel(systemPrompt, userMessage, maxTokens = 2000) {
  const available = getAvailableProviders()
    .filter(name => !isProviderLimited(name))
    .slice(0, MAX_ENSEMBLE_PROVIDERS);
  if (available.length === 0) throw new Error('No AI providers configured');

  const providers = getProviders();

  const results = await Promise.allSettled(
    available.map(async (name) => {
      const provider = providers[name];
      try {
        const output = await callProvider(provider, systemPrompt, userMessage, maxTokens);
        return { provider: name, providerName: provider.name, output };
      } catch (err) {
        if (err.status === 429) markProviderLimited(name);
        throw err;
      }
    })
  );

  const successful = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  // Map failures back to provider names using index into available[]
  const failed = results
    .map((r, i) => ({ status: r.status, provider: available[i], error: r.reason?.message }))
    .filter((r) => r.status === 'rejected');

  if (failed.length > 0) {
    failed.forEach((f) => console.log(`[ensembleRunner] ${f.provider} skipped: ${f.error}`));
  }

  if (successful.length === 0) throw new Error('All AI providers failed in ensemble run');
  return successful;
}

/**
 * Run a consensus/judge call to merge multiple agent outputs.
 */
async function runConsensus(agentOutputs, taskType) {
  const providers = getProviders();
  // Use judge-specific order: OpenAI gpt-4o first, free models as fallback
  const available = getAvailableJudgeProviders().filter(name => !isProviderLimited(name));
  const instruction = TASK_INSTRUCTIONS[taskType] || 'Merge the outputs, preferring items that appear in multiple outputs. Return ONLY JSON.';

  const judgePrompt = `You are a medical AI consensus judge.
${agentOutputs.length} independent AI agents analyzed the same medical case.
Your job: compare their outputs and produce one merged, higher-accuracy result.

${instruction}

--- Agent outputs ---
${agentOutputs.map((a, i) => `=== Agent ${i + 1} (${a.providerName}) ===\n${a.output}`).join('\n\n')}`;

  let lastErr;
  for (const name of available) {
    try {
      const raw = await callProvider(providers[name], '', judgePrompt, 2000, true);
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      return clean;
    } catch (err) {
      if (err.status === 429 || err.status === 503) {
        if (err.status === 429) markProviderLimited(name);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('All providers failed for consensus judge');
}

/**
 * Main export: run ensemble (parallel + consensus).
 *
 * If only 1 provider is available, skips consensus and returns that output directly.
 * Returns: { consensusRaw, agentCount, agentOutputs }
 */
async function runEnsembleWithConsensus(systemPrompt, userMessage, taskType, maxTokens = 2000) {
  const agentOutputs = await runParallel(systemPrompt, userMessage, maxTokens);

  // Single provider — no consensus needed
  if (agentOutputs.length === 1) {
    console.log(`[ensembleRunner] Single provider (${agentOutputs[0].providerName}) — skipping consensus`);
    const clean = agentOutputs[0].output
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    return { consensusRaw: clean, agentCount: 1, agentOutputs };
  }

  console.log(`[ensembleRunner] Running consensus across ${agentOutputs.length} providers: ${agentOutputs.map((a) => a.providerName).join(', ')}`);
  const consensusRaw = await runConsensus(agentOutputs, taskType);

  return { consensusRaw, agentCount: agentOutputs.length, agentOutputs };
}

module.exports = { runParallel, runConsensus, runEnsembleWithConsensus };
