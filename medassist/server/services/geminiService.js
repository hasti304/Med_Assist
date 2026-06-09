/**
 * geminiService.js — Blood report OCR service
 *
 * Strategy:
 *   Text PDF   → pdf-parse text → Cerebras/text AI parsing (fast)
 *   Scanned PDF → pdftoppm converts first page to JPEG → OpenRouter vision OCR
 *   JPEG/PNG   → OpenRouter vision OCR directly
 *
 * Vision models (OpenRouter free tier):
 *   1. meta-llama/llama-3.2-11b-vision-instruct:free
 *   2. qwen/qwen-2-vl-7b-instruct:free
 *   Fallback: Gemini 1.5 Flash (if GEMINI_API_KEY is set)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai');

const TEXT_PARSE_PROMPT = `You are a medical data extraction AI.
Below is raw text extracted from a blood test report.
Extract ALL blood test values and return a JSON array ONLY — no markdown, no explanation.

Required structure per item:
{
  "parameter": "Hemoglobin",
  "abbreviation": "Hb",
  "value": "13.2",
  "unit": "g/dL",
  "normal_range": "13.5–17.5",
  "status": "low"
}

Rules:
- "status" must be one of: "normal", "low", "high", "critical_low", "critical_high"
- Determine status by comparing value to normal_range
- Include ALL parameters visible in the text
- If a field is missing or unclear, use "" (empty string) for that field
- Return ONLY the JSON array, nothing else`;

const VISION_PARSE_PROMPT = `You are a medical data extraction AI analyzing a blood test report.
Look carefully at the entire image and extract ALL blood test values visible.
Return a JSON array ONLY — no markdown, no explanation, no preamble.

Required structure per item:
{
  "parameter": "Hemoglobin",
  "abbreviation": "Hb",
  "value": "13.2",
  "unit": "g/dL",
  "normal_range": "13.5–17.5",
  "status": "low"
}

Rules:
- "status" must be one of: "normal", "low", "high", "critical_low", "critical_high"
- Determine status by comparing value to normal_range
- Include ALL parameters visible (CBC, LFT, KFT, lipid panel, thyroid, etc.)
- If a field is missing or unclear, use "" (empty string) for that field
- Return ONLY the JSON array, nothing else`;

// OpenRouter vision models in priority order (mix of free and low-cost)
const OPENROUTER_VISION_MODELS = [
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'meta-llama/llama-3.2-90b-vision-instruct:free',
  'qwen/qwen2-vl-7b-instruct:free',
  'google/gemini-2.0-flash-001',
  'google/gemini-flash-1.5',
];

function getOpenRouterClient() {
  if (!process.env.OPENROUTER_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.CLIENT_URL || 'https://medassist-ai.onrender.com',
      'X-Title': 'MedAssist AI',
    },
  });
}

/**
 * Use OpenRouter free vision models to OCR a blood report image.
 */
async function extractWithOpenRouterVision(imageBuffer, mimeType) {
  const client = getOpenRouterClient();
  if (!client) {
    throw new Error('OPENROUTER_API_KEY is not configured. Cannot process image/scanned documents.');
  }

  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  console.log(`[geminiService] OpenRouter Vision OCR — ${mimeType}, ${Math.round(imageBuffer.length / 1024)}KB`);

  let lastErr;
  for (const model of OPENROUTER_VISION_MODELS) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PARSE_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      });

      const raw = response.choices[0].message.content.trim();
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        console.error(`[geminiService] ${model} returned non-JSON:`, raw.slice(0, 300));
        lastErr = new Error('Vision model returned non-JSON response');
        continue;
      }

      if (!Array.isArray(parsed)) {
        lastErr = new Error('Vision model returned unexpected format — expected array');
        continue;
      }

      console.log(`[geminiService] OpenRouter Vision (${model}) extracted ${parsed.length} values`);
      return parsed;
    } catch (err) {
      const status = err.status || err.code;
      if (status === 429 || status === 503 || status === 400 || status === 404 || status === 402) {
        console.warn(`[geminiService] ${model} failed (${status}), trying next vision model`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('All OpenRouter vision models failed');
}

/**
 * Use Gemini Vision (primary when GEMINI_API_KEY is set).
 * Tries gemini-2.0-flash first, then falls back to older models.
 */
async function extractWithGeminiVision(buffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'All vision models failed and GEMINI_API_KEY is not set. ' +
      'For scanned PDFs, try photographing the report and uploading as JPEG instead.'
    );
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastGeminiErr;

  for (const modelName of geminiModels) {
    try {
      console.log(`[geminiService] Gemini Vision OCR — ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        VISION_PARSE_PROMPT,
        { inlineData: { data: buffer.toString('base64'), mimeType } },
      ]);

      const raw = result.response.text().trim();
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        console.error(`[geminiService] ${modelName} returned non-JSON:`, raw.slice(0, 300));
        lastGeminiErr = new Error('Gemini Vision returned non-JSON response');
        continue;
      }

      if (!Array.isArray(parsed)) {
        lastGeminiErr = new Error('Gemini Vision returned unexpected format');
        continue;
      }

      console.log(`[geminiService] Gemini Vision (${modelName}) extracted ${parsed.length} values`);
      return parsed;
    } catch (err) {
      console.warn(`[geminiService] ${modelName} failed:`, err.message);
      lastGeminiErr = err;
    }
  }

  throw lastGeminiErr || new Error('All Gemini Vision models failed');
}

/**
 * Convert first page of a scanned PDF to JPEG using pdftoppm (available on Linux/Render).
 * Returns null if pdftoppm is not available.
 */
async function convertScannedPDFToImage(pdfPath) {
  const { execSync } = require('child_process');
  const tmpDir = os.tmpdir();
  const outBase = path.join(tmpDir, `pdf_ocr_${Date.now()}`);

  try {
    execSync(`pdftoppm -jpeg -r 200 -singlefile -f 1 -l 1 "${pdfPath}" "${outBase}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    // pdftoppm outputs outBase.jpg or outBase-1.jpg depending on version
    let jpegPath = `${outBase}.jpg`;
    if (!fs.existsSync(jpegPath)) jpegPath = `${outBase}-1.jpg`;
    if (!fs.existsSync(jpegPath)) throw new Error('pdftoppm produced no output file');

    const buffer = fs.readFileSync(jpegPath);
    fs.unlink(jpegPath, () => {});
    console.log(`[geminiService] pdftoppm: PDF → JPEG (${Math.round(buffer.length / 1024)}KB)`);
    return buffer;
  } catch (err) {
    console.warn('[geminiService] pdftoppm unavailable or failed:', err.message);
    return null;
  }
}

/**
 * Parse raw text from a text-based PDF using Cerebras/SambaNova/OpenRouter.
 */
function parseJsonArrayFromAI(raw) {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array from AI parser');
  return parsed;
}

async function parseTextWithAI(rawText) {
  const truncatedText = rawText.length > 15000 ? rawText.slice(0, 15000) + '\n[truncated]' : rawText;

  const { getProviders, getAvailableProviders, isProviderLimited } = require('../utils/aiClients');
  const providers = getProviders();
  const available = getAvailableProviders().filter((name) => !isProviderLimited(name));

  if (!available.length) {
    throw new Error(
      'No AI provider configured for PDF parsing. Add GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY to server/.env'
    );
  }

  let lastErr;
  for (const name of available) {
    const provider = providers[name];
    const models = [provider.model, ...(provider.fallbackModels || [])].filter(
      (m, i, arr) => m && arr.indexOf(m) === i
    );

    for (const model of models) {
      try {
        const response = await provider.client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: TEXT_PARSE_PROMPT },
            { role: 'user', content: `Blood report text:\n\n${truncatedText}` },
          ],
          temperature: 0.1,
          max_tokens: 8000,
        });

        const raw = response.choices[0]?.message?.content?.trim() || '';
        const parsed = parseJsonArrayFromAI(raw);
        console.log(`[geminiService] Text PDF parsed by ${provider.name} (${model}) — ${parsed.length} values`);
        return parsed;
      } catch (err) {
        const status = err.status || err.response?.status;
        console.warn(`[geminiService] ${provider.name} (${model}) failed:`, err.message);
        lastErr = err;
        if ([400, 401, 402, 404, 429, 503].includes(status)) continue;
        throw err;
      }
    }
  }
  throw lastErr || new Error('All AI providers failed to parse PDF text');
}

/**
 * Groq vision — used when GEMINI/OPENROUTER are not configured.
 */
async function extractWithGroqVision(imageBuffer, mimeType) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const visionModels = ['llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview'];

  let lastErr;
  for (const model of visionModels) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PARSE_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      });
      const raw = response.choices[0]?.message?.content?.trim() || '';
      const parsed = parseJsonArrayFromAI(raw);
      console.log(`[geminiService] Groq Vision (${model}) extracted ${parsed.length} values`);
      return parsed;
    } catch (err) {
      console.warn(`[geminiService] Groq vision ${model} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Groq vision models failed');
}

/**
 * Extract blood values from a PDF.
 * Fast path: pdf-parse text → AI text parser.
 * Scanned path: pdftoppm → JPEG → vision OCR.
 */
async function extractFromPDF(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const rawText = data.text.trim();

  if (rawText && rawText.length > 50) {
    console.log('[geminiService] Text PDF detected, using text extraction path');
    try {
      return await parseTextWithAI(rawText);
    } catch (textErr) {
      console.warn('[geminiService] Text parse failed, falling back to vision OCR:', textErr.message);
    }
  } else {
    console.log('[geminiService] Scanned PDF detected, converting to image for OCR');
  }

  // Scanned PDF or text-parse fallback — vision OCR

  const jpegBuffer = await convertScannedPDFToImage(filePath);
  if (jpegBuffer) {
    // Try Gemini first (more accurate), fall back to OpenRouter
    if (process.env.GEMINI_API_KEY) {
      try {
        return await extractWithGeminiVision(jpegBuffer, 'image/jpeg');
      } catch (err) {
        console.warn('[geminiService] Gemini Vision failed:', err.message);
      }
    }
    if (process.env.GROQ_API_KEY) {
      try {
        return await extractWithGroqVision(jpegBuffer, 'image/jpeg');
      } catch (err) {
        console.warn('[geminiService] Groq Vision failed:', err.message);
      }
    }
    if (process.env.OPENROUTER_API_KEY) {
      return await extractWithOpenRouterVision(jpegBuffer, 'image/jpeg');
    }
    throw new Error('No vision API key configured (GROQ, GEMINI, or OPENROUTER)');
  }

  // pdftoppm not available — send raw PDF to Gemini Vision
  if (process.env.GEMINI_API_KEY) {
    return await extractWithGeminiVision(buffer, 'application/pdf');
  }
  if (process.env.GROQ_API_KEY) {
    try {
      return await extractWithGroqVision(buffer, 'application/pdf');
    } catch (err) {
      console.warn('[geminiService] Groq PDF vision failed:', err.message);
    }
  }

  throw new Error(
    'Could not process this PDF. Add GROQ_API_KEY or GEMINI_API_KEY to .env, ' +
    'or photograph your report and upload as JPEG/PNG.'
  );
}

/**
 * Main export: routes to correct extractor based on file type.
 */
async function extractBloodValuesFromImage(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    return await extractFromPDF(filePath);
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
    const buffer = fs.readFileSync(filePath);
    // Try Gemini first (key is set), fall back to OpenRouter
    if (process.env.GEMINI_API_KEY) {
      try {
        return await extractWithGeminiVision(buffer, mimeType);
      } catch (err) {
        console.warn('[geminiService] Gemini Vision failed, trying next provider:', err.message);
      }
    }
    if (process.env.GROQ_API_KEY) {
      try {
        return await extractWithGroqVision(buffer, mimeType);
      } catch (err) {
        console.warn('[geminiService] Groq Vision failed, trying OpenRouter:', err.message);
      }
    }
    return await extractWithOpenRouterVision(buffer, mimeType);
  }

  throw new Error(`Unsupported file type: ${mimeType}. Please upload a PDF, JPEG, or PNG.`);
}

module.exports = { extractBloodValuesFromImage };
