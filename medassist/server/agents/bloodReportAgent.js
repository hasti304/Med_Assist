const { runAgent, MAX_TURNS } = require('./agentRunner');
const { runEnsembleWithConsensus } = require('./ensembleRunner');
const { getAvailableProviders, getAvailableToolProviders } = require('../utils/aiClients');

const { definitions: allDefinitions, handlers } = require('./tools/medicalTools');
const pool = require('../db/pool');
const { getEmitter } = require('../utils/eventEmitter');

/**
 * Attempt to repair truncated JSON by closing open brackets/braces/strings.
 */
function repairTruncatedJSON(str) {
  // First try parsing as-is
  try { return JSON.parse(str); } catch {}

  // Remove trailing comma before attempting repairs
  let s = str.replace(/,\s*$/, '');

  // Track open brackets/braces/strings
  let inString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  // Close open string
  if (inString) s += '"';
  // Close open brackets/braces
  while (stack.length > 0) {
    const open = stack.pop();
    // Remove trailing comma before closing
    s = s.replace(/,\s*$/, '');
    s += open === '{' ? '}' : ']';
  }

  try { return JSON.parse(s); } catch {}

  // Last resort: find the largest parseable prefix
  for (let end = s.length; end > 10; end--) {
    let attempt = s.slice(0, end).replace(/,\s*$/, '');
    // Auto-close
    let inStr = false, esc = false;
    const st = [];
    for (let i = 0; i < attempt.length; i++) {
      const c = attempt[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') st.push(c);
      if (c === '}' || c === ']') st.pop();
    }
    if (inStr) attempt += '"';
    while (st.length) {
      const o = st.pop();
      attempt = attempt.replace(/,\s*$/, '');
      attempt += o === '{' ? '}' : ']';
    }
    try { return JSON.parse(attempt); } catch { continue; }
  }

  return null;
}

// Only lab reference range — drug tools removed (drug info not shown in UI, saves API quota)
const TOOL_NAMES = ['get_lab_reference_range'];
const definitions = allDefinitions.filter((d) => TOOL_NAMES.includes(d.name));

// Phase 1 — get reference ranges only (max 3 tool calls for the most abnormal parameters)
const PHASE1_SYSTEM = `You are a medical blood report analyzer. Call tools to gather clinical data.

Call get_lab_reference_range for the TOP 3 most abnormal parameters only. No other tool calls.

When all tool calls are done, respond with exactly: TOOLS_COMPLETE`;

// Phase 2a — medical sections only (summary + findings) ~1000 tokens output
const PHASE2A_SYSTEM = `You are a medical report formatter. Output ONLY valid JSON — no markdown, no extra text.

Output this exact structure:
{"summary":{"overall_assessment":"2-3 sentences","root_cause":null,"complexity":"Low|Medium|High","doctor_referral_needed":false,"referral_reason":null},"abnormal_findings":[{"parameter":"","your_value":"","normal_range":"","status":"high|low|critical_high|critical_low","interpretation":"1 sentence"}]}

Rules:
- doctor_referral_needed true if 3+ critical values. Do NOT include treatment or medication fields.
- root_cause: set ONLY if a single clear cause is strongly supported by the data (e.g. definite iron-deficiency pattern). If speculative or multi-factorial, set to null and include the context in overall_assessment instead.`;

// Phase 2b — lifestyle sections only (diet + recovery) ~1500 tokens output
const PHASE2B_SYSTEM = `You are a medical nutrition advisor. Output ONLY valid JSON — no markdown, no extra text.

Output this exact structure:
{"diet_plan":{"overview":"1 sentence","foods_to_eat":[{"food":"","reason":"","frequency":""}],"foods_to_avoid":[{"food":"","reason":""}],"meal_schedule":[{"meal":"Breakfast","suggestion":""},{"meal":"Lunch","suggestion":""},{"meal":"Dinner","suggestion":""},{"meal":"Snacks","suggestion":""}]},"recovery_ingredients":[{"ingredient":"","benefit":"","how_to_use":"","targets":[""]}]}

Rules: min 4 foods_to_eat, 3 foods_to_avoid, all 4 meal_schedule entries, min 3 recovery_ingredients. Target the specific abnormal parameters listed.`;

/**
 * Run the Blood Report Agent (multi-phase: tool calls → medical → lifestyle → treatment).
 */
async function runBloodReportAgent({ reportId, extractedValues, patientProfile }) {
  const emitter = getEmitter(reportId);

  const abnormal = extractedValues.filter((v) => v.status && v.status !== 'normal');
  const abnormalText = abnormal.length > 0
    ? abnormal.map((v) => `${v.parameter}: ${v.value} ${v.unit} (range: ${v.normal_range || 'N/A'}, status: ${v.status})`).join('\n')
    : 'No abnormal values detected.';

  const profileText = patientProfile
    ? [
        `Age: ${patientProfile.age || 'unknown'}`,
        `Gender: ${patientProfile.gender || 'unknown'}`,
        patientProfile.weight_kg    ? `Weight: ${patientProfile.weight_kg} kg`       : null,
        patientProfile.height_cm    ? `Height: ${patientProfile.height_cm} cm`       : null,
        patientProfile.blood_group  ? `Blood group: ${patientProfile.blood_group}`   : null,
        patientProfile.existing_conditions?.length
          ? `Existing conditions: ${patientProfile.existing_conditions.join(', ')}` : null,
        patientProfile.allergies?.length
          ? `Allergies: ${patientProfile.allergies.join(', ')}`                     : null,
        patientProfile.current_medications?.length
          ? `Current medications: ${patientProfile.current_medications.join(', ')}` : null,
        patientProfile.smoking_status ? `Smoking: ${patientProfile.smoking_status}` : null,
        patientProfile.alcohol_use    ? `Alcohol: ${patientProfile.alcohol_use}`     : null,
      ].filter(Boolean).join(' | ')
    : 'Not available';

  const ensembleProviders = getAvailableProviders();
  const toolProviders = getAvailableToolProviders();
  const skipToolPhase =
    ensembleProviders.length === 1 &&
    ensembleProviders[0] === 'groq' &&
    !toolProviders.includes('openai');

  const userMessage = `Patient: ${profileText}

Abnormal results (${abnormal.length} of ${extractedValues.length} parameters):
${abnormalText}

Call the tools now to gather reference ranges and drug data.`;

  // ── Phase 1: Tool calls (skipped on Groq-only — saves quota & avoids overload) ───
  let phase1Text = '';
  let steps = [];
  let turns = 0;

  if (skipToolPhase) {
    console.log('[bloodReportAgent] Groq-only mode — skipping Phase 1 tool calls');
    emitter.emit('step', {
      tool: '_tools_skipped',
      args: {},
      result: { message: 'Single-provider mode (Groq) — running direct analysis without tool phase.' },
      timestamp: new Date().toISOString(),
    });
  } else {
    try {
      const phase1 = await runAgent({
        systemInstruction: PHASE1_SYSTEM,
        userMessage,
        tools: definitions,
        toolHandlers: handlers,
        onStep: (step) => emitter.emit('step', step),
        maxTokens: 1500,
      });
      phase1Text = phase1.text;
      steps = phase1.steps;
      turns = phase1.turns;
    } catch (phase1Err) {
      console.warn('[bloodReportAgent] Phase 1 tool calls skipped:', phase1Err.message);
      emitter.emit('step', {
        tool: '_tools_skipped',
        args: {},
        result: { message: 'Reference lookup skipped — continuing with analysis.' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── Phase 2a: Medical sections — ensemble across all providers ───────────
  const toolSummary = steps.map((s) =>
    `${s.tool}(${JSON.stringify(s.args).slice(0, 80)}): ${JSON.stringify(s.result).slice(0, 200)}`
  ).join('\n');

  const sharedContext = `Patient: ${profileText}
Abnormal results: ${abnormalText}
Tool data: ${toolSummary || 'none'}`;

  const ensembleLabel =
    ensembleProviders.length <= 1
      ? `Running analysis with ${ensembleProviders[0] || 'AI'}…`
      : 'Running ensemble analysis: multiple AI providers generating medical plan…';

  emitter.emit('step', {
    tool: '_ensemble',
    args: {},
    result: { message: ensembleLabel },
    timestamp: new Date().toISOString(),
  });

  let medical = null;
  try {
    const { consensusRaw: raw2a, agentCount: ac2a } = await runEnsembleWithConsensus(
      PHASE2A_SYSTEM,
      `${sharedContext}\nGenerate the medical JSON now.`,
      'blood_analysis',
      2000
    );
    console.log(`[bloodReportAgent] Phase 2a ensemble (${ac2a} providers), length: ${raw2a.length}`);
    try {
      medical = JSON.parse(raw2a);
    } catch {
      console.log('[bloodReportAgent] Phase 2a: attempting JSON repair...');
      medical = repairTruncatedJSON(raw2a);
      if (medical) console.log('[bloodReportAgent] Phase 2a: JSON repaired');
    }
  } catch (err) {
    console.error('[bloodReportAgent] Phase 2a ensemble failed:', err.message);
  }

  // ── Phase 2b: Lifestyle sections — ensemble ───────────────────────────────
  let lifestyle = null;
  try {
    const { consensusRaw: raw2b, agentCount: ac2b } = await runEnsembleWithConsensus(
      PHASE2B_SYSTEM,
      `${sharedContext}\nGenerate the diet and recovery JSON now.`,
      'blood_analysis',
      3500
    );
    console.log(`[bloodReportAgent] Phase 2b ensemble (${ac2b} providers), length: ${raw2b.length}`);
    try {
      lifestyle = JSON.parse(raw2b);
    } catch {
      console.log('[bloodReportAgent] Phase 2b: attempting JSON repair...');
      lifestyle = repairTruncatedJSON(raw2b);
      if (lifestyle) console.log('[bloodReportAgent] Phase 2b: JSON repaired');
    }
  } catch (err) {
    console.error('[bloodReportAgent] Phase 2b ensemble failed:', err.message);
  }

  console.log(`[bloodReportAgent] Final — diet:${!!lifestyle?.diet_plan} recovery:${lifestyle?.recovery_ingredients?.length ?? 0}`);

  // ── Merge results with fallbacks ─────────────────────────────────────────
  const doctorReferralNeeded = medical?.summary?.doctor_referral_needed || false;
  const analysis = {
    summary: medical?.summary || {
      overall_assessment: 'AI providers are temporarily overloaded — please retry in a few minutes.',
      root_cause: 'All AI providers rate-limited. Re-upload your report or wait ~5 minutes and try again.',
      complexity: 'Medium',
      doctor_referral_needed: true,
      referral_reason: 'Analysis incomplete due to temporary AI overload — manual review recommended',
    },
    abnormal_findings: medical?.abnormal_findings || abnormal.map((v) => ({
      parameter: v.parameter,
      your_value: `${v.value} ${v.unit}`,
      normal_range: v.normal_range || 'N/A',
      status: v.status,
      interpretation: 'Manual review required',
    })),
    diet_plan: lifestyle?.diet_plan || null,
    recovery_ingredients: lifestyle?.recovery_ingredients || [],
  };

  // Save to DB
  try {
    await pool.query(
      `UPDATE blood_reports
       SET analysis = $1, tablet_recommendations = $2, complexity_flag = $3
       WHERE id = $4`,
      [JSON.stringify(analysis), JSON.stringify([]), doctorReferralNeeded, reportId]
    );
    await pool.query(
      `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
       VALUES ($1, $2, $3, $4)`,
      [reportId, 'bloodReportAgent', JSON.stringify(steps), turns]
    );
  } catch (dbErr) {
    console.error('[bloodReportAgent] DB save error:', dbErr.message);
  }

  emitter.emit('done', { analysis, tabletRecommendations: [], doctorReferralNeeded });
  return { analysis, tabletRecommendations: [], doctorReferralNeeded, steps, turns };
}

module.exports = { runBloodReportAgent };
