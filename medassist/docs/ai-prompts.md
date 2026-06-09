# MedAssist AI — Agent Prompts & Design Documentation

**Project:** MedAssist AI Full-Stack Application  
**Date:** April 2026

---

## Overview

MedAssist AI uses three primary AI agents plus an ensemble consensus system.  
All agents use an **OpenAI-compatible chat completion API** via:
- **Primary**: Groq (`llama-3.3-70b-versatile`)
- **Fallback**: Additional providers configured in `server/utils/aiClients.js`
- **Vision/OCR**: Google Gemini (`gemini-1.5-flash`)

The **Ensemble Runner** (`server/agents/ensembleRunner.js`) runs prompts across all available providers in parallel, then calls a *consensus judge* to merge outputs into a single higher-accuracy result.

---

## Agent 1: Diagnostic Agent

**File:** `server/agents/diagnosticAgent.js`  
**Route:** `POST /api/disease/predict`  
**Purpose:** Symptom → differential diagnosis (top 5 diseases with ICD-10 codes)

### System Prompt

```
You are a medical informatics AI for an educational health platform.
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
- Educational use only — not a substitute for professional medical advice
```

### User Message Template

```
Patient Profile: Age: {age} | Gender: {gender} | Blood Group: {blood_group} | Existing conditions: {conditions}

Symptoms:
- {symptom_name}: severity {severity}/10, duration {duration} day(s), onset {onset}
...

Based on these symptoms, provide the top 5 differential diagnoses with ICD-10 codes and probabilities.
```

### Output Structure

```json
[
  {
    "disease": "Type 2 Diabetes Mellitus",
    "icd_code": "E11",
    "icd_description": "Type 2 diabetes mellitus",
    "probability": 85,
    "description": "A metabolic disorder characterized by hyperglycemia...",
    "matched_symptoms": ["Fatigue", "Increased Thirst", "Frequent Urination"],
    "reasoning": "Classic triad of polyuria, polydipsia, and fatigue...",
    "consensus_count": 2,
    "confidence": 0.9
  }
]
```

### Design Decisions
- Uses `runEnsembleWithConsensus` with task type `disease_diagnosis`
- Consensus judge merges predictions from multiple providers by confidence
- `consensus_count` field shows how many agents agreed on each disease
- Empty `symptoms` array returns HTTP 400 — validation before agent call

---

## Agent 2: Blood Report Agent

**File:** `server/agents/bloodReportAgent.js`  
**Route:** `POST /api/blood-report/analyze`  
**Purpose:** Extracted blood values → medical analysis + medication recommendations

### System Prompt (Analysis Phase)

```
You are a medical informatics AI assistant for an educational health platform.
Analyze the given blood test results and provide a comprehensive medical analysis.

Return ONLY a valid JSON object with the following structure:
{
  "summary": {
    "overall_assessment": "Brief overall health status",
    "risk_level": "low | moderate | high | critical",
    "key_findings": ["finding1", "finding2"]
  },
  "abnormal_findings": [
    {
      "parameter": "Parameter name",
      "your_value": "Patient's value with unit",
      "normal_range": "Reference range",
      "status": "high | low | critical_high | critical_low",
      "clinical_significance": "What this means",
      "recommendation": "What to do"
    }
  ],
  "normal_findings": ["parameter1", "parameter2"],
  "diet_plan": {
    "foods_to_eat": ["food1", "food2"],
    "foods_to_avoid": ["food1", "food2"],
    "meal_timing": "Meal timing guidance"
  },
  "lifestyle_recommendations": ["rec1", "rec2"],
  "follow_up_urgency": "immediate | within_week | within_month | routine"
}
```

### Design Decisions
- Agent uses multi-turn agentic loop (max 6 turns) via `agentRunner.js`
- Tools available: `analyze_blood_values`, `check_drug_interactions`, `get_medication_details`
- Results cached in `blood_reports.analysis` column to avoid re-running expensive agents
- Pass `{ force: true }` in request body to bypass cache and re-analyze

---

## Agent 3: Blood Test Recommendation Agent

**File:** `server/services/groqService.js`  
**Route:** `POST /api/disease/tests`  
**Purpose:** Given a disease + patient profile → recommended blood tests (5-8 tests)

### System Prompt

```
You are a medical informatics AI assistant for an educational health platform.
Given a diagnosed disease and patient profile, recommend the most important blood tests a doctor would order.

Return ONLY a valid JSON array. No explanation outside the array.

Format:
[
  {
    "test_name": "Full name of the test",
    "abbreviation": "Short code e.g. CBC, HbA1c",
    "reason": "Why this test is ordered for the disease",
    "normal_range": "Typical reference range with units",
    "urgency": "essential | recommended | optional",
    "what_to_expect": "Brief patient-facing note (fasting, timing, etc.)"
  }
]

Rules:
- Return 5 to 8 tests maximum
- Sort by urgency: essential first, then recommended, then optional
- Keep language simple and educational
- Educational use only — not a substitute for professional medical advice
```

### Design Decisions
- Uses `runEnsembleWithConsensus` with task type `test_recommendations`
- Deduplicates tests by fuzzy name matching in consensus phase
- `consensus_count` field added by judge to indicate cross-provider agreement
- Tests persisted to `symptom_sessions.recommended_tests` for future reference

---

## Agent 4: Doctor Assist Agent

**File:** `server/agents/doctorAssistAgent.js`  
**Route:** `POST /api/doctor-assist/suggest-tests`  
**Purpose:** Doctor enters patient case → AI suggests missing diagnostic tests

### System Prompt

The Doctor Assist Agent uses a multi-turn agentic loop with tool calls.  
It is restricted to `role: 'doctor'` users.

**Core task:** Given a patient case description and existing tests already ordered, identify which *essential* diagnostic tests are missing — not already covered.

### Design Decisions
- Returns `allCovered: true` if all essential tests are already ordered
- `suggestions` array contains only tests not covered by `existingTests`
- Sessions saved to `doctor_assist_sessions` table for audit trail
- Agent logs saved to `agent_logs` table for debugging and course submission

---

## Agent 5: Risk Scoring Agent

**File:** `server/agents/riskScoringAgent.js`  
**Route:** `POST /api/blood-report/risk-scores`  
**Purpose:** Blood values → composite clinical risk scores (kidney, liver, cardiovascular)

### Output Structure

```json
{
  "composite_score": 72,
  "risk_level": "moderate",
  "summary": "Moderate cardiovascular risk based on lipid panel...",
  "organ_scores": {
    "kidney": { "score": 80, "risk": "low", "key_findings": [] },
    "liver": { "score": 65, "risk": "moderate", "key_findings": [] },
    "cardiovascular": { "score": 55, "risk": "moderate", "key_findings": [] }
  }
}
```

---

## Agent 6: Follow-Up Agent

**File:** `server/agents/followUpAgent.js`  
**Route:** `POST /api/blood-report/follow-up`  
**Purpose:** Abnormal findings + medications → follow-up test schedule

### Output Structure

```json
[
  {
    "test": "HbA1c",
    "reason": "Monitor glycemic control",
    "recheck_in": "3 months",
    "urgency": "recommended"
  }
]
```

### Design Decisions
- Follow-up schedule is used to auto-create email reminders in `reminders` table
- Reminders fire 3 days before the recheck date via `reminderService.js`

---

## Ensemble Consensus System

**File:** `server/agents/ensembleRunner.js`

The ensemble system runs the same prompt on **all configured AI providers in parallel**, then calls a *consensus judge* to merge results.

### Task Types

| Task Type | Used By | Merge Strategy |
|-----------|---------|----------------|
| `disease_diagnosis` | Diagnostic Agent | Diseases in 2+ agents get confidence 0.8-1.0; single-agent diseases get 0.4-0.6 |
| `test_recommendations` | Blood Test Agent | Tests from 2+ agents are high priority; single-agent tests downgraded |
| `blood_analysis` | Blood Report Agent | Prefer conservative/safer medical values on conflict |
| `treatment_plan` | Blood Report Agent | Prefer lower/safer doses on conflict; never include allergens |
| `drug_interactions` | Doctor Assist | Use MORE SEVERE severity rating when agents disagree |

### Provider Priority

Configured in `server/utils/aiClients.js`. Primary provider: Groq (`llama-3.3-70b-versatile`).  
Additional providers: configurable via environment variables.  
Hard-rate-limited providers are automatically bypassed with a 5-minute TTL.

---

## OCR / Vision: Gemini Service

**File:** `server/services/geminiService.js`  
**Route:** `POST /api/blood-report/upload`  
**Purpose:** Extract structured blood test values from uploaded PDF/image

### Model
`gemini-1.5-flash` via `@google/generative-ai` SDK

### Prompt

```
Extract all blood test parameters from this medical report image/PDF.
Return ONLY a JSON array of extracted values.

Format:
[
  {
    "parameter": "Test name",
    "value": "Numeric value",
    "unit": "Unit (mg/dL, etc.)",
    "normal_range": "Reference range",
    "status": "normal | high | low | critical_high | critical_low"
  }
]
```

---

## Safety & Disclaimer

All AI outputs include educational disclaimers. The system:
1. Never prescribes medications — only suggests educational information
2. Flags complex cases with `doctorReferralNeeded: true`
3. All AI-generated content is labeled as educational, not medical advice
4. Prompts explicitly state: *"Educational use only — not a substitute for professional medical advice"*
