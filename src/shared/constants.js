/**
 * Shared constants for the Job Fish Chrome Extension.
 * Updated June 2026: model list reflects current Groq offerings after llama3-70b-8192
 * and llama-3.3-70b-versatile deprecations (May/June 2026).
 *
 * - MSG: chrome.runtime message type strings.
 * - STORAGE_KEYS: chrome.storage.local key names.
 * - DEFAULTS: default config values.
 * - GROQ_MODELS: current Groq model options.
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
  GROQ_API_KEY:         'groq_api_key',
  API_ENDPOINT:         'api_endpoint',
  BASE_RESUME:          'base_resume',
  MATCH_TARGET:         'match_target',
  OPTIMIZATION_HISTORY: 'optimization_history',
});

export const DEFAULTS = Object.freeze({
  MATCH_TARGET:     82,
  MODEL:            'openai/gpt-oss-120b',
  HISTORY_LIMIT:    3,
  FETCH_TIMEOUT_MS: 45000,
  MAX_TOKENS:       6000,
  TEMPERATURE:      0.25,
});

// Current Groq models as of June 2026 (post llama3-70b + llama-3.3-70b deprecations).
export const GROQ_MODELS = Object.freeze([
  { value: 'openai/gpt-oss-120b',  label: 'GPT-OSS 120B \u2014 Best quality (Recommended)' },
  { value: 'qwen/qwen3.6-27b',     label: 'Qwen 3.6 27B \u2014 Fast & capable' },
  { value: 'openai/gpt-oss-20b',   label: 'GPT-OSS 20B \u2014 Fastest' },
]);

export const ERROR_TYPES = Object.freeze({
  NO_API_KEY:    'NO_API_KEY',
  NO_RESUME:     'NO_RESUME',
  PARSE_FAILURE: 'PARSE_FAILURE',
  FETCH_TIMEOUT: 'FETCH_TIMEOUT',
  API_ERROR:     'API_ERROR',
  VALIDATION:    'VALIDATION',
});

export const ERROR_MESSAGES = Object.freeze({
  NO_API_KEY:    'No API key saved. Open Settings (\u2699) and paste your Groq API key.',
  NO_RESUME:     'No base resume text found. Upload a .docx or paste your resume in Settings.',
  PARSE_FAILURE: 'The model returned an unreadable response. Please retry \u2014 this is usually transient.',
  FETCH_TIMEOUT: 'Request timed out after 45 seconds. Check your connection and retry.',
  API_ERROR:     'The Groq API returned an error. Check your API key and selected model.',
  VALIDATION:    'Please paste a job description before running analysis.',
});
