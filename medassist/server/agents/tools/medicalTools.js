const fetch = require('node-fetch');

// ── Reference Range Table (40 parameters) ─────────────────────────────────────
const REFERENCE_RANGES = {
  // CBC
  hemoglobin:         { male: '13.5–17.5 g/dL', female: '12.0–15.5 g/dL', unit: 'g/dL', critical_low: 7, critical_high: 20 },
  hematocrit:         { male: '41–53%', female: '36–46%', unit: '%' },
  wbc:                { normal: '4.5–11.0 x10³/μL', unit: 'x10³/μL', critical_low: 2, critical_high: 30 },
  rbc:                { male: '4.5–5.5 x10⁶/μL', female: '4.0–5.0 x10⁶/μL', unit: 'x10⁶/μL' },
  platelets:          { normal: '150–400 x10³/μL', unit: 'x10³/μL', critical_low: 50, critical_high: 1000 },
  mcv:                { normal: '80–100 fL', unit: 'fL' },
  mchc:               { normal: '32–36 g/dL', unit: 'g/dL' },
  // Glucose / Diabetes
  glucose:            { fasting: '70–99 mg/dL', random: '<200 mg/dL', unit: 'mg/dL', critical_low: 40, critical_high: 500 },
  hba1c:              { normal: '<5.7%', prediabetes: '5.7–6.4%', diabetes: '≥6.5%', unit: '%' },
  insulin:            { fasting: '2.6–24.9 μIU/mL', unit: 'μIU/mL' },
  // Basic Metabolic Panel
  sodium:             { normal: '136–145 mEq/L', unit: 'mEq/L', critical_low: 120, critical_high: 160 },
  potassium:          { normal: '3.5–5.0 mEq/L', unit: 'mEq/L', critical_low: 2.5, critical_high: 6.5 },
  chloride:           { normal: '98–106 mEq/L', unit: 'mEq/L' },
  bicarbonate:        { normal: '22–29 mEq/L', unit: 'mEq/L' },
  bun:                { normal: '7–20 mg/dL', unit: 'mg/dL', critical_high: 100 },
  creatinine:         { male: '0.74–1.35 mg/dL', female: '0.59–1.04 mg/dL', unit: 'mg/dL', critical_high: 10 },
  gfr:                { normal: '>60 mL/min/1.73m²', unit: 'mL/min/1.73m²', critical_low: 15 },
  // Liver Function
  alt:                { male: '7–56 U/L', female: '7–45 U/L', unit: 'U/L', critical_high: 1000 },
  ast:                { normal: '10–40 U/L', unit: 'U/L', critical_high: 1000 },
  bilirubin_total:    { normal: '0.1–1.2 mg/dL', unit: 'mg/dL', critical_high: 15 },
  alkaline_phosphatase: { normal: '44–147 U/L', unit: 'U/L' },
  albumin:            { normal: '3.4–5.4 g/dL', unit: 'g/dL', critical_low: 2.0 },
  total_protein:      { normal: '6.3–8.2 g/dL', unit: 'g/dL' },
  // Lipid Panel
  total_cholesterol:  { normal: '<200 mg/dL', borderline: '200–239 mg/dL', high: '≥240 mg/dL', unit: 'mg/dL' },
  ldl:                { optimal: '<100 mg/dL', near_optimal: '100–129 mg/dL', high: '≥160 mg/dL', unit: 'mg/dL' },
  hdl:                { male_low: '<40 mg/dL', female_low: '<50 mg/dL', protective: '>60 mg/dL', unit: 'mg/dL' },
  triglycerides:      { normal: '<150 mg/dL', high: '200–499 mg/dL', unit: 'mg/dL', critical_high: 1000 },
  // Thyroid
  tsh:                { normal: '0.4–4.0 mIU/L', unit: 'mIU/L', critical_low: 0.01, critical_high: 100 },
  t3_free:            { normal: '2.3–4.1 pg/mL', unit: 'pg/mL' },
  t4_free:            { normal: '0.8–1.8 ng/dL', unit: 'ng/dL' },
  // Minerals & Vitamins
  calcium:            { normal: '8.5–10.2 mg/dL', unit: 'mg/dL', critical_low: 7, critical_high: 13 },
  magnesium:          { normal: '1.7–2.2 mg/dL', unit: 'mg/dL' },
  phosphorus:         { normal: '2.5–4.5 mg/dL', unit: 'mg/dL' },
  vitamin_d:          { deficient: '<20 ng/mL', insufficient: '20–29 ng/mL', normal: '30–100 ng/mL', unit: 'ng/mL' },
  vitamin_b12:        { normal: '200–900 pg/mL', unit: 'pg/mL', critical_low: 150 },
  iron:               { male: '65–175 μg/dL', female: '50–170 μg/dL', unit: 'μg/dL' },
  ferritin:           { male: '12–300 ng/mL', female: '12–150 ng/mL', unit: 'ng/mL' },
  // Inflammation
  crp:                { normal: '<1.0 mg/L', elevated: '1.0–3.0 mg/L', high: '>3.0 mg/L', unit: 'mg/L' },
  esr:                { male: '0–22 mm/hr', female: '0–29 mm/hr', unit: 'mm/hr' },
  // Other
  uric_acid:          { male: '3.4–7.0 mg/dL', female: '2.4–6.0 mg/dL', unit: 'mg/dL', critical_high: 12 },
  ldh:                { normal: '140–280 U/L', unit: 'U/L' },
  inr:                { normal: '0.9–1.1', therapeutic: '2.0–3.0 (anticoagulation)', unit: 'ratio' },
};

// ── Tool Definitions (Gemini functionDeclarations format) ─────────────────────
// OpenAI/Groq-compatible function definitions (lowercase types)
const definitions = [
  {
    name: 'lookup_icd_code',
    description: 'Look up official ICD-10-CM codes for a disease or medical condition using the NIH ClinicalTables database. Always call this for each suspected disease.',
    parameters: {
      type: 'object',
      properties: {
        condition_name: {
          type: 'string',
          description: 'Name of the disease or medical condition to look up (e.g., "type 2 diabetes mellitus")',
        },
      },
      required: ['condition_name'],
    },
  },
  {
    name: 'get_lab_reference_range',
    description: 'Get the normal reference range for a laboratory blood test parameter.',
    parameters: {
      type: 'object',
      properties: {
        parameter_name: {
          type: 'string',
          description: 'Lab parameter name in lowercase (e.g., hemoglobin, glucose, tsh, creatinine, hba1c)',
        },
      },
      required: ['parameter_name'],
    },
  },
  {
    name: 'search_drug_by_condition',
    description: 'Search for FDA-approved drugs used to treat a medical condition using OpenFDA.',
    parameters: {
      type: 'object',
      properties: {
        condition_name: {
          type: 'string',
          description: 'Medical condition to find approved treatments for',
        },
      },
      required: ['condition_name'],
    },
  },
  {
    name: 'check_drug_interactions',
    description: 'Check for clinically significant interactions between multiple drugs using the RxNorm API.',
    parameters: {
      type: 'object',
      properties: {
        drug_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of drug generic names to check for interactions (min 2)',
        },
      },
      required: ['drug_names'],
    },
  },
  {
    name: 'get_drug_details',
    description: 'Get detailed FDA label information for a specific drug including dosage, contraindications, and warnings.',
    parameters: {
      type: 'object',
      properties: {
        drug_name: {
          type: 'string',
          description: 'Generic or brand name of the drug',
        },
      },
      required: ['drug_name'],
    },
  },
];

// ── Tool Implementations ───────────────────────────────────────────────────────

async function lookupIcdCode({ condition_name }) {
  try {
    const encoded = encodeURIComponent(condition_name);
    const url = `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=${encoded}&maxList=5&sf=code,name&df=code,name`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    // Response: [total, [codes], null, [[code, name], ...]]
    const results = (data[3] || []).map(([code, name]) => ({ code, name }));
    if (results.length === 0) return { results: [], note: 'No ICD-10 code found for this condition' };
    return { results };
  } catch (err) {
    return { error: `ICD lookup failed: ${err.message}` };
  }
}

async function getLabReferenceRange({ parameter_name }) {
  const key = parameter_name.toLowerCase().replace(/[\s\-]/g, '_');
  const range = REFERENCE_RANGES[key];
  if (!range) {
    // Try partial match
    const match = Object.keys(REFERENCE_RANGES).find(k => k.includes(key) || key.includes(k));
    if (match) return { parameter: match, ...REFERENCE_RANGES[match] };
    return { note: `Reference range not found for "${parameter_name}". Consult clinical guidelines.` };
  }
  return { parameter: key, ...range };
}

async function searchDrugByCondition({ condition_name }) {
  try {
    const encoded = encodeURIComponent(`"${condition_name}"`);
    const url = `https://api.fda.gov/drug/label.json?search=indications_and_usage:${encoded}&limit=5`;
    const res = await fetch(url, { timeout: 10000 });
    if (res.status === 404) return { drugs: [], note: 'No FDA-approved drugs found for this condition' };
    const data = await res.json();
    const drugs = (data.results || []).map((d) => ({
      brand_name: d.openfda?.brand_name?.[0] || 'Unknown',
      generic_name: d.openfda?.generic_name?.[0] || 'Unknown',
      manufacturer: d.openfda?.manufacturer_name?.[0] || 'Unknown',
      indications: d.indications_and_usage?.[0]?.slice(0, 300) || '',
    }));
    return { drugs };
  } catch (err) {
    return { error: `Drug search failed: ${err.message}` };
  }
}

async function checkDrugInteractions({ drug_names }) {
  if (!Array.isArray(drug_names) || drug_names.length < 2) {
    return { note: 'Provide at least 2 drug names to check interactions' };
  }
  try {
    // Step 1: get RxCUI for each drug
    const rxcuis = [];
    for (const name of drug_names.slice(0, 4)) { // max 4 drugs
      const res = await fetch(
        `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=1`,
        { timeout: 8000 }
      );
      const data = await res.json();
      const ids = data.idGroup?.rxnormId;
      if (ids && ids.length > 0) rxcuis.push({ name, rxcui: ids[0] });
    }
    if (rxcuis.length < 2) return { interactions: [], note: 'Could not find RxCUI for enough drugs to check interactions' };

    // Step 2: check interactions
    const rxcuiList = rxcuis.map(r => r.rxcui).join('+');
    const res = await fetch(
      `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuiList}`,
      { timeout: 10000 }
    );
    const data = await res.json();
    const interactions = [];
    for (const group of data.fullInteractionTypeGroup || []) {
      for (const type of group.fullInteractionType || []) {
        for (const pair of type.interactionPair || []) {
          interactions.push({
            description: pair.description,
            severity: pair.severity || 'unknown',
            drugs: pair.interactionConcept?.map(c => c.minConceptItem?.name) || [],
          });
        }
      }
    }
    return { drugs_checked: rxcuis.map(r => r.name), interactions };
  } catch (err) {
    return { error: `Interaction check failed: ${err.message}` };
  }
}

async function getDrugDetails({ drug_name }) {
  try {
    const encoded = encodeURIComponent(`"${drug_name}"`);
    const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encoded}&limit=1`;
    const res = await fetch(url, { timeout: 10000 });
    if (res.status === 404) {
      // Try brand name
      const res2 = await fetch(
        `https://api.fda.gov/drug/label.json?search=openfda.brand_name:${encoded}&limit=1`,
        { timeout: 10000 }
      );
      if (res2.status === 404) return { note: `No FDA label found for "${drug_name}"` };
      const d2 = await res2.json();
      return extractDrugLabel(d2.results?.[0]);
    }
    const data = await res.json();
    return extractDrugLabel(data.results?.[0]);
  } catch (err) {
    return { error: `Drug details failed: ${err.message}` };
  }
}

function extractDrugLabel(result) {
  if (!result) return { note: 'Drug label not available' };
  return {
    brand_name: result.openfda?.brand_name?.[0] || 'Unknown',
    generic_name: result.openfda?.generic_name?.[0] || 'Unknown',
    dosage_and_administration: result.dosage_and_administration?.[0]?.slice(0, 400) || 'See prescriber',
    warnings: result.warnings?.[0]?.slice(0, 400) || '',
    contraindications: result.contraindications?.[0]?.slice(0, 400) || '',
    adverse_reactions: result.adverse_reactions?.[0]?.slice(0, 300) || '',
  };
}

// ── Handlers map ──────────────────────────────────────────────────────────────
const handlers = {
  lookup_icd_code: lookupIcdCode,
  get_lab_reference_range: getLabReferenceRange,
  search_drug_by_condition: searchDrugByCondition,
  check_drug_interactions: checkDrugInteractions,
  get_drug_details: getDrugDetails,
};

module.exports = { definitions, handlers };
