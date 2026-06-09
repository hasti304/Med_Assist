const router  = require('express').Router();
const https   = require('https');
const verifyToken = require('../middleware/auth');
const { getProviders, getAvailableProviders, getAvailableVoiceProviders } = require('../utils/aiClients');

const ELEVENLABS_VOICE_ID = 'W1TKxm4MpGXSlpN7iVQy';
const ELEVENLABS_MODEL    = 'eleven_turbo_v2';

// ── POST /api/voice/speak ───────────────────────────────────────────────────
// Body: { text: string }
// Returns: audio/mpeg binary
router.post('/speak', verifyToken, async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') {
    // Client uses browser Speech Synthesis by default (no API key required)
    return res.json({ mode: 'browser', text: text.slice(0, 3000) });
  }

  const body = JSON.stringify({
    text: text.slice(0, 3000),
    model_id: ELEVENLABS_MODEL,
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    path: `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const elevReq = https.request(options, elevRes => {
    if (elevRes.statusCode !== 200) {
      let errData = '';
      elevRes.on('data', d => { errData += d; });
      elevRes.on('end', () => {
        console.error('[voice/speak] ElevenLabs error:', elevRes.statusCode, errData);
        res.status(502).json({ error: 'ElevenLabs TTS failed', details: errData });
      });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    elevRes.pipe(res);
  });

  elevReq.on('error', err => {
    console.error('[voice/speak] Request error:', err.message);
    res.status(502).json({ error: 'ElevenLabs connection failed' });
  });

  elevReq.write(body);
  elevReq.end();
});

// ─── POST /api/voice/narrate-report ────────────────────────────────────────
// Generates a doctor-style audio narration of the patient's blood report.
// Returns: audio/mpeg buffer
router.post('/narrate-report', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  const pool = require('../db/pool');

  try {
  let report;
  try {
    const { rows } = await pool.query(
      'SELECT analysis, extracted_values FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    report = rows[0];
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch report' });
  }

  let analysis = report.analysis || {};
  if (typeof analysis === 'string') {
    try { analysis = JSON.parse(analysis); } catch { analysis = {}; }
  }
  const summary = analysis.summary || {};
  const abnormal = analysis.abnormal_findings || [];

  const abnormalLines = abnormal.length > 0
    ? abnormal.slice(0, 6).map(f =>
        `- ${f.parameter}: ${f.your_value} (normal: ${f.normal_range}) — ${f.status}${f.interpretation ? `. ${f.interpretation}` : ''}`
      ).join('\n')
    : '- All values are within the normal range.';

  const scriptPrompt = `You are a warm, empathetic doctor speaking directly to a patient after reviewing their blood test results. Write a clear, calm 2-minute spoken narration (about 200-250 words) in this exact order:

1. GREETING — Start with a brief friendly greeting and tell the patient you have reviewed their blood report.
2. DIAGNOSIS / OVERALL FINDING — Explain what the report found overall: the likely root cause or condition identified, and how serious it is (complexity level). This is the most important part — speak about the diagnosis first.
3. ABNORMAL VALUES — Walk through the key abnormal findings one by one in plain English. For each one, say what the parameter does in the body, whether it is too high or too low, and what that means for the patient's health day-to-day.
4. LIFESTYLE TIPS — Give one or two simple, practical lifestyle suggestions based on the findings.
5. CLOSING — End with encouragement and a reminder to follow up with their doctor.

Do NOT use medical jargon. Do NOT say "your analysis shows" — speak naturally as if talking to the patient in person.
Do NOT include any JSON, bullet points, section headers, or formatting — just flowing spoken sentences.

Report data:
Overall assessment: ${summary.overall_assessment || 'Analysis complete.'}
Diagnosis / Root cause: ${summary.root_cause || 'Not clearly identified.'}
Severity: ${summary.complexity || 'Moderate'} complexity
Abnormal findings:
${abnormalLines}`;

  const { getAvailableVoiceProviders } = require('../utils/aiClients');
  const providers = getProviders();
  const voiceProviders = getAvailableVoiceProviders();
  const available = voiceProviders.length ? voiceProviders : require('../utils/aiClients').getAvailableProviders();

  let script = null;
  for (const name of available) {
    const provider = providers[name];
    if (!provider?.client) continue;
    const models = [provider.model, ...(provider.fallbackModels || [])].filter(
      (m, i, arr) => m && arr.indexOf(m) === i
    );
    for (const model of models) {
      try {
        const response = await provider.client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You write warm, plain-English medical narrations for patients. Output ONLY the spoken text, no formatting.' },
            { role: 'user', content: scriptPrompt },
          ],
          temperature: 0.7,
          max_tokens: 600,
        });
        script = response.choices[0]?.message?.content?.trim();
        if (script) break;
      } catch (err) {
        const status = err?.status || err?.response?.status;
        console.warn(`[voice/narrate-report] ${provider.name} (${model}) failed:`, err.message);
        if ([400, 401, 402, 404, 429, 503].includes(status)) continue;
        throw err;
      }
    }
    if (script) break;
  }

  if (!script) {
    // Fallback narration from report data when AI is unavailable
    script = [
      'Hello, I have reviewed your blood test results.',
      summary.overall_assessment || 'Your report shows several values that need attention.',
      abnormal.length
        ? `Key findings include ${abnormal.slice(0, 3).map((f) => f.parameter).join(', ')}.`
        : 'Most of your values look acceptable.',
      'Please follow up with your doctor to discuss these results in detail.',
    ].join(' ');
  }

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your_elevenlabs_api_key_here') {
    console.log('[voice/narrate-report] No ElevenLabs key — returning script for browser TTS');
    return res.json({ mode: 'browser', script });
  }

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: script,
          model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('[voice/narrate-report] ElevenLabs error:', errText);
      return res.json({ mode: 'browser', script });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const audioBuffer = await ttsRes.arrayBuffer();
    return res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('[voice/narrate-report] TTS fetch failed, using browser TTS:', err.message);
    return res.json({ mode: 'browser', script });
  }
  } catch (err) {
    console.error('[voice/narrate-report] Error:', err);
    return res.status(500).json({ error: err.message || 'Narration failed' });
  }
});


// ─── POST /api/voice/explain-finding ───────────────────────────────────────
// Returns a plain-English explanation of a single abnormal blood finding.
// Returns: { explanation: string }
router.post('/explain-finding', verifyToken, async (req, res) => {
  const { parameter, your_value, normal_range, status, lang = 'en' } = req.body;
  if (!parameter) return res.status(400).json({ error: 'parameter is required' });

  const langNote = lang === 'es'
    ? '\n\nIMPORTANT: Write the entire explanation in Spanish (Español) only. Use simple, clear medical Spanish that a patient can understand.'
    : '';

  const prompt = `A patient's blood test shows: ${parameter} = ${your_value} (normal range: ${normal_range || 'not specified'}, status: ${status || 'abnormal'}).

Write a 2-3 sentence plain-English explanation for the patient (no medical jargon) that covers:
1. What this parameter does in the body
2. What it means that it is ${status || 'abnormal'}
3. One practical implication for daily life

Be warm, clear, and reassuring. Do not recommend specific treatments or drugs.${langNote}`;

  const providers = getProviders();
  const available = getAvailableProviders();

  let explanation = null;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: lang === 'es'
            ? 'Explicas resultados de análisis de sangre en español sencillo a pacientes. Sé conciso (2-3 oraciones), cálido y evita tecnicismos médicos.'
            : 'You explain blood test results in plain English to patients. Be concise (2-3 sentences), warm, and avoid jargon.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 150,
      });
      explanation = response.choices[0]?.message?.content?.trim();
      if (explanation) break;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 429 || status === 503) continue;
      throw err;
    }
  }

  if (!explanation) {
    return res.status(503).json({ error: 'Could not generate explanation. Try again.' });
  }

  return res.json({ explanation });
});


// ─── POST /api/voice/report-chat ───────────────────────────────────────────
// Conversational Q&A about an analyzed blood report.
// Body: { reportId, message, history: [{role, content}], lang }
// Returns: { reply: string }
router.post('/report-chat', verifyToken, async (req, res) => {
  const { reportId, message, history = [], lang = 'en' } = req.body;
  if (!reportId || !message) {
    return res.status(400).json({ error: 'reportId and message are required' });
  }

  const pool = require('../db/pool');
  let report;
  try {
    const { rows } = await pool.query(
      'SELECT analysis, extracted_values FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    report = rows[0];
  } catch {
    return res.status(500).json({ error: 'Failed to fetch report' });
  }

  const analysis = report.analysis || {};
  const summary = analysis.summary || {};
  const abnormal = analysis.abnormal_findings || [];
  const extractedValues = Array.isArray(report.extracted_values) ? report.extracted_values : [];

  const abnormalLines = abnormal.map(f =>
    `  • ${f.parameter}: ${f.your_value} (normal ${f.normal_range}) — ${f.status}${f.interpretation ? `. ${f.interpretation}` : ''}`
  ).join('\n') || '  • None — all values within normal range';

  const allValuesLine = extractedValues.length
    ? extractedValues.map(v => `${v.parameter}: ${v.value}${v.unit ? ' ' + v.unit : ''}`).join(', ')
    : '';

  const dietOverview = analysis.diet_plan?.overview || '';
  const eatList = (analysis.diet_plan?.foods_to_eat || []).slice(0, 5).map(f => f.food).join(', ');
  const avoidList = (analysis.diet_plan?.foods_to_avoid || []).slice(0, 5).map(f => f.food).join(', ');
  const ingredientsList = (analysis.recovery_ingredients || []).slice(0, 5).map(i => i.ingredient).join(', ');

  const langInstruction = lang === 'es'
    ? '\n\nIMPORTANT: Respond ONLY in Spanish (Español). Speak naturally as a Spanish-speaking doctor would to their patient. Use clear, simple medical Spanish.'
    : '';

  const systemPrompt = `You are Dr. MedAssist, a warm and experienced family doctor speaking directly with a patient about their blood test results. The patient just asked you a question — answer it the way a real doctor would in a face-to-face consultation.

HOW TO SPEAK:
- Always cite the patient's actual numbers (e.g. "Your hemoglobin came back at 10.2, which is below the normal range of 12–16...")
- Speak in natural, flowing sentences — never use bullet points, dashes, or lists
- Be specific to what was found in THIS report, not generic advice
- Keep your reply under 120 words unless the patient explicitly asks for more detail
- End with one short personal note, like "I'd suggest mentioning this at your next doctor's visit"
- Never say "based on your report" or "your analysis shows" — just speak naturally as a doctor would

ANSWER ONLY from the data below. If asked about something not in the report, say so naturally.${langInstruction}

── THIS PATIENT'S REPORT ──
Overall finding: ${summary.overall_assessment || 'Analysis complete'}
Diagnosis / root cause: ${summary.root_cause || 'Not clearly identified'}
Severity: ${summary.complexity || 'Moderate'} complexity
${summary.referral_reason ? `Why referral was recommended: ${summary.referral_reason}` : ''}

Abnormal values found:
${abnormalLines}
${allValuesLine ? `\nAll values from the test: ${allValuesLine}` : ''}
${dietOverview ? `\nDiet recommendation: ${dietOverview}` : ''}
${eatList ? `Good foods for this patient: ${eatList}` : ''}
${avoidList ? `Foods to avoid: ${avoidList}` : ''}
${ingredientsList ? `Helpful recovery ingredients: ${ingredientsList}` : ''}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const providers = getProviders();
  const available = getAvailableProviders();

  let reply = null;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages,
        temperature: 0.6,
        max_tokens: 300,
      });
      reply = response.choices[0]?.message?.content?.trim();
      if (reply) break;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 429 || status === 503) continue;
      throw err;
    }
  }

  if (!reply) {
    return res.status(503).json({ error: 'Could not generate response. Try again.' });
  }

  return res.json({ reply });
});

// ─── POST /api/voice/translate ─────────────────────────────────────────────
// Body: { lang: 'es', texts: { [key]: string } }
// Returns: { [key]: string }  (same keys, translated values)
// Splits large payloads into segments of 15 keys to avoid LLM max_tokens truncation.

const LANG_NAMES = { es: 'Spanish', fr: 'French', hi: 'Hindi', de: 'German', pt: 'Portuguese', zh: 'Chinese' };

async function translateSegment(textObj, langName, providers, available) {
  const systemPrompt = `You are a medical translation assistant. Translate values accurately, preserving clinical terminology.`;
  const userPrompt = `Translate ALL values in this JSON object from English to ${langName}.
Rules:
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON
- Keep every key exactly as-is, only translate the string values
- Preserve medical terms, drug names, and numeric references accurately
- If a value is already in ${langName}, keep it unchanged

${JSON.stringify(textObj)}`;

  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });
      const raw = response.choices[0]?.message?.content?.trim() || '';
      const clean = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')  // strip qwen-3/reasoning model think tokens
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      return JSON.parse(clean);
    } catch (err) {
      console.error(`[translate] Provider ${name} segment failed:`, err.message);
      continue;
    }
  }
  return textObj; // English fallback for this segment only
}

router.post('/translate', verifyToken, async (req, res) => {
  const { lang, texts } = req.body;
  if (!lang || !texts || typeof texts !== 'object') {
    return res.status(400).json({ error: 'lang and texts are required' });
  }
  if (lang === 'en') return res.json(texts);

  const entries = Object.entries(texts).filter(([, v]) => v && typeof v === 'string' && v.trim());
  if (!entries.length) return res.json({});

  const langName = LANG_NAMES[lang] || lang;
  const providers = getProviders();
  const available = getAvailableVoiceProviders(); // GitHub gpt-4o-mini first — higher RPM than Cerebras

  // Split into segments of 15 keys — each segment stays well under 4096 output tokens
  const SEGMENT_SIZE = 15;
  const segments = [];
  for (let i = 0; i < entries.length; i += SEGMENT_SIZE) {
    segments.push(Object.fromEntries(entries.slice(i, i + SEGMENT_SIZE)));
  }

  // Sequential — avoids concurrent request limits on GitHub (5/s) and Cerebras
  const merged = {};
  for (const seg of segments) {
    const result = await translateSegment(seg, langName, providers, available);
    Object.assign(merged, result);
  }

  return res.json(merged);
});

module.exports = router;
