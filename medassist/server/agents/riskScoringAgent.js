const { getProviders, getAvailableProviders } = require('../utils/aiClients');

const SYSTEM_PROMPT = `You are a clinical risk scoring calculator. Given a patient's blood report values and profile, compute a single composite health risk score.

Evaluate ALL of the following clinical dimensions that are relevant to the available data:
- Cardiovascular risk (Framingham-based: total cholesterol, HDL, LDL, BP, smoking, diabetes history)
- Diabetes risk (FINDRISC-based: fasting glucose, HbA1c, age, BMI, BP history)
- Kidney function (CKD-EPI-based: creatinine, eGFR, age, gender)
- Liver function (Child-Pugh-based: bilirubin, albumin, ALT, AST, INR)
- Thyroid function risk (TSH deviation from normal, free T4, free T3, total T3, reverse T3, thyroid antibody titers — TPO, TgAb — and presence of hypothyroidism/hyperthyroidism pattern)
- Hematological risk (hemoglobin, hematocrit, RBC, MCV, MCH, MCHC — severity of anemia, type of anemia)
- Autoimmune / Inflammatory risk (ANA titer, elevated antibodies like TPO >100 IU/mL, TgAb, CRP, ESR, other inflammatory markers)

Composite score rules:
- Each dimension contributes to the final score based on severity and clinical significance.
- Thyroid: TSH >10 mIU/L or florid antibody elevation (TPO >500 IU/mL or TgAb >200 IU/mL) = score 60–80 for that area.
- Hematological: Hemoglobin <11 g/dL = score 50–70; <9 g/dL = score 70–90.
- Autoimmune: ANA positive + elevated thyroid antibodies = score 50–70 for that area.
- The composite score is the weighted average across all applicable dimensions, not just the ones with data. Missing dimensions should be scored 0 (no risk), not ignored.

Then produce ONE composite score from 0–100 where:
- 0–25: Low risk (routine checkup sufficient)
- 26–50: Moderate risk (schedule a doctor visit within 1–2 months)
- 51–75: High risk (see a doctor within 1–2 weeks)
- 76–100: Critical risk (visit hospital immediately)

Output ONLY valid JSON with this structure:
{
  "composite_score": <number 0-100>,
  "risk_level": "Low|Moderate|High|Critical",
  "hospital_visit": "not_needed|recommended_soon|visit_within_2_weeks|immediate",
  "summary": "1-2 sentence plain English summary of overall risk",
  "breakdown": [
    { "area": "Cardiovascular", "score": <0-100>, "note": "short note" },
    { "area": "Diabetes", "score": <0-100>, "note": "short note" },
    { "area": "Kidney", "score": <0-100>, "note": "short note" },
    { "area": "Liver", "score": <0-100>, "note": "short note" },
    { "area": "Thyroid", "score": <0-100>, "note": "short note" },
    { "area": "Hematological", "score": <0-100>, "note": "short note" },
    { "area": "Autoimmune", "score": <0-100>, "note": "short note" }
  ]
}

Be conservative — when in doubt, score higher (safer for patient). Include ALL 7 areas in the breakdown every time, even if data is missing for some (score 0 with a note explaining missing data).`;

/**
 * Run the risk scoring agent (single-turn AI call).
 * @param {Object} params
 * @param {Array} params.extractedValues - blood report values
 * @param {Object|null} params.patientProfile - patient profile data
 * @returns {Object} risk scores JSON
 */
async function runRiskScoringAgent({ extractedValues, patientProfile }) {
  const providers = getProviders();
  const available = getAvailableProviders();

  const userMessage = `Patient Profile:
${patientProfile ? JSON.stringify(patientProfile, null, 2) : 'No profile available'}

Blood Report Values:
${JSON.stringify(extractedValues, null, 2)}

Calculate all applicable clinical risk scores.`;

  let lastErr;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content;

      try {
        const parsed = JSON.parse(jsonStr);
        console.log(`[riskScoringAgent] Success via ${provider.name}`);
        return parsed;
      } catch {
        console.error(`[riskScoringAgent] ${provider.name} returned non-JSON:`, content.slice(0, 200));
        lastErr = new Error('Non-JSON response from risk scoring model');
        continue;
      }
    } catch (err) {
      if (err.status === 429 || err.status === 503 || err.status === 400) {
        console.warn(`[riskScoringAgent] ${provider.name} rate-limited (${err.status}), trying next`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  console.error('[riskScoringAgent] All providers failed:', lastErr?.message);
  return {
    composite_score: null,
    risk_level: 'Unknown',
    hospital_visit: 'recommended_soon',
    summary: 'Unable to calculate risk score — please consult a doctor.',
    breakdown: [
      { area: 'Cardiovascular', score: null, note: 'Service temporarily unavailable' },
      { area: 'Diabetes', score: null, note: 'Service temporarily unavailable' },
      { area: 'Kidney', score: null, note: 'Service temporarily unavailable' },
      { area: 'Liver', score: null, note: 'Service temporarily unavailable' },
    ],
  };
}

module.exports = { runRiskScoringAgent };
