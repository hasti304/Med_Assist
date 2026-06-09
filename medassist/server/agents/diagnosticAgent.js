const { runEnsembleWithConsensus } = require('./ensembleRunner');

const SYSTEM_PROMPT = `You are a medical informatics AI for an educational health platform.
Given a patient's symptoms (with severity 1-10, duration, and onset), diagnose the top 5 most likely diseases.

Return ONLY a valid JSON array. No explanation outside the array.

Format:
[
  {
    "disease": "Full disease name",
    "icd_code": "ICD-10 code e.g. E11",
    "icd_description": "ICD-10 description",
    "probability": 85,
    "description": "Brief 1-2 sentence clinical description",
    "matched_symptoms": ["symptom1", "symptom2"],
    "reasoning": "Brief clinical reasoning"
  }
]

Rules:
- Return exactly 5 diseases, ranked by probability (highest first)
- probability is an integer 0-100
- icd_code must be a real ICD-10 code
- matched_symptoms lists which input symptoms support this diagnosis
- Keep descriptions educational, not prescriptive
- Educational use only — not a substitute for professional medical advice`;

/**
 * Run the Diagnostic Agent: symptoms → top 5 diseases with ICD-10 codes.
 * Uses ensemble consensus across all configured AI providers.
 *
 * @param {Array} symptoms - [{ name, severity, duration, onset }, ...]
 * @param {object|null} profile - patient profile (may be null)
 * @returns {{ diseases, turns }}
 */
async function runDiagnosticAgent(symptoms, profile = null) {
  const symptomLines = symptoms.map((s) =>
    `- ${s.name}: severity ${s.severity}/10, duration ${s.duration} day(s), onset ${s.onset || 'not specified'}`
  ).join('\n');

  const profileText = profile
    ? [
        `Age: ${profile.age}`,
        `Gender: ${profile.gender}`,
        profile.blood_group ? `Blood Group: ${profile.blood_group}` : null,
        profile.existing_conditions?.length
          ? `Existing conditions: ${profile.existing_conditions.join(', ')}`
          : null,
        profile.allergies?.length
          ? `Allergies: ${profile.allergies.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : 'Profile not provided';

  const userMessage = `Patient Profile: ${profileText}

Symptoms:
${symptomLines}

Based on these symptoms, provide the top 5 differential diagnoses with ICD-10 codes and probabilities.`;

  const { consensusRaw, agentCount } = await runEnsembleWithConsensus(
    SYSTEM_PROMPT,
    userMessage,
    'disease_diagnosis',
    1500
  );

  let diseases = [];
  try {
    const parsed = JSON.parse(consensusRaw);
    diseases = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    const match = consensusRaw.match(/\[[\s\S]*\]/);
    if (match) {
      try { diseases = JSON.parse(match[0]).slice(0, 5); } catch { diseases = []; }
    }
  }

  // Ensure required fields
  diseases = diseases.map((d) => ({
    disease: d.disease || 'Unknown',
    icd_code: d.icd_code || 'Z99',
    icd_description: d.icd_description || d.disease || 'Unknown',
    probability: typeof d.probability === 'number' ? d.probability : 50,
    description: d.description || '',
    matched_symptoms: d.matched_symptoms || [],
    reasoning: d.reasoning || '',
    consensus_count: d.consensus_count || agentCount,
    confidence: d.confidence || null,
  }));

  return { diseases, turns: agentCount };
}

module.exports = { runDiagnosticAgent };
