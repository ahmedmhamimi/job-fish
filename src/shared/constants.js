/**
 * Shared constants for the Job Fish Chrome Extension.
 * Updated June 2026: migrated from Groq to Google Gemini API.
 *
 * - MSG: chrome.runtime message type strings.
 * - STORAGE_KEYS: chrome.storage.local key names.
 * - DEFAULTS: default config values.
 * - GROQ_MODELS: LLM model options (Gemini).
 * - ERROR_TYPES / ERROR_MESSAGES: structured error identifiers and user-facing text.
 */

export const MSG = Object.freeze({
  SAVE_API_KEY:  'SAVE_API_KEY',
  SAVE_RESUME:   'SAVE_RESUME',
  RUN_ANALYSIS:  'RUN_ANALYSIS',
  GET_SETTINGS:  'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
});

export const STORAGE_KEYS = Object.freeze({
  GROQ_API_KEY:         'groq_api_key',        // storage key kept for backwards compatibility
  API_ENDPOINT:         'api_endpoint',
  BASE_RESUME:          'base_resume',
  RESUME_FILENAME:      'resume_filename',     // original uploaded filename (no extension)
  OUTPUT_FILENAME:      'output_filename',     // user-set override for exported file names
  MATCH_TARGET:         'match_target',
  OPTIMIZATION_HISTORY: 'optimization_history',
});

export const DEFAULTS = Object.freeze({
  MATCH_TARGET:     82,
  MODEL:            'gemini-2.5-flash',
  HISTORY_LIMIT:    3,
  FETCH_TIMEOUT_MS: 45000,
  MAX_TOKENS:       32768,
  THINKING_BUDGET:  0,
  TEMPERATURE:      0.25,
});

// Gemini models (June 2026).
// Free tier: gemini-2.0-flash 1M TPM, gemini-2.5-flash 250K TPM — no rate limit issues.
// maxTokens raised from the old 8192: the output schema (keyword list, summary,
// skills, 3 experience-bullet groups, 7 project-bullet groups) regularly needs
// well over 8K tokens, and on 2.5-series models "thinking" tokens are drawn from
// the SAME maxOutputTokens budget — silently truncating the JSON mid-string
// (finishReason: MAX_TOKENS) before it could close.
// thinkingBudget: 0 disables thinking entirely on 2.5/2.0 Flash, so the full
// token budget goes to visible output. Gemini 2.5 Pro can't fully disable
// thinking (nonzero minimum), so it gets a small budget instead.
export const GROQ_MODELS = Object.freeze([
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash \u2014 Best quality (Recommended)', maxTokens: 32768, jdLimit: 8000, thinkingBudget: 0 },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash \u2014 Fastest, 1M TPM',            maxTokens: 32768, jdLimit: 8000, thinkingBudget: 0 },
  { value: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro \u2014 Most capable',                  maxTokens: 32768, jdLimit: 8000, thinkingBudget: 128 },
]);

export const ERROR_TYPES = Object.freeze({
  NO_API_KEY:    'NO_API_KEY',
  NO_RESUME:     'NO_RESUME',
  PARSE_FAILURE: 'PARSE_FAILURE',
  TRUNCATED:     'TRUNCATED',
  FETCH_TIMEOUT: 'FETCH_TIMEOUT',
  API_ERROR:     'API_ERROR',
  VALIDATION:    'VALIDATION',
});

export const ERROR_MESSAGES = Object.freeze({
  NO_API_KEY:    'No API key saved. Open Settings (\u2699) and paste your Gemini API key.',
  NO_RESUME:     'No base resume text found. Upload a .docx or paste your resume in Settings.',
  PARSE_FAILURE: 'The model returned an unreadable response. Please retry \u2014 this is usually transient.',
  TRUNCATED:     'The model response was cut off before it finished (hit the output token limit). Try a shorter job description, or increase Max Tokens in Settings.',
  FETCH_TIMEOUT: 'Request timed out after 45 seconds. Check your connection and retry.',
  API_ERROR:     'The Gemini API returned an error. Check your API key and selected model.',
  VALIDATION:    'Please paste a job description before running analysis.',
});