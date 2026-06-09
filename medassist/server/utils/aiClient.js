/**
 * aiClient.js — backward-compatible primary AI client
 *
 * Automatically picks the best available provider based on which keys are in .env:
 *   CEREBRAS_API_KEY  → Cerebras llama-3.3-70b  (fastest, most generous free tier)
 *   GITHUB_TOKEN      → GitHub Models gpt-4o-mini
 *   GEMINI_API_KEY    → Gemini 2.0 Flash (fallback — quota=0 in some regions)
 *
 * All existing agents import { client, MODEL } from this file and work unchanged.
 */

const { getPrimaryProvider } = require('./aiClients');

// Resolve at first require (after dotenv has already loaded .env)
const primary = getPrimaryProvider();

const client = primary.client;
const MODEL = primary.model;

console.log(`[aiClient] Primary provider: ${primary.name} (${MODEL})`);

module.exports = { client, MODEL };
