/**
 * Shared constants for the Job Fish Chrome Extension.
 * Centralises all message type strings, storage key names, default config values,
 * Groq model options, ATS section header labels, and user-facing error messages.
 *
 * - MSG: object of chrome.runtime message type string constants.
 * - STORAGE_KEYS: object of chrome.storage.local key names.
 * - DEFAULTS: object of default configuration values (match target, model, timeouts, etc.).
 * - GROQ_MODELS: readonly array of {value, label} model option objects for the selector.
 * - ATS_HEADERS: object mapping section category keys to ALL CAPS ATS-compliant labels.
 * - ERROR_TYPES: object of error type identifier strings.
 * - ERROR_MESSAGES: object of human-readable error message strings keyed by error type.
 */

export const MSG = Object.freeze({
  SAVE_API_KEY:    'SAVE_API_KEY',
  SAVE_RESUME:     'SAVE_RESUME',
  RUN_ANALYSIS:    'RUN_ANALYSIS',
  GET_SETTINGS:    'GET_SETTINGS',
  SAVE_SETTINGS:   'SAVE_SETTINGS',
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
  MODEL:            'llama3-70b-8192',
  HISTORY_LIMIT:    3,
  FETCH_TIMEOUT_MS: 30000,
  MAX_TOKENS:       4096,
  TEMPERATURE:      0.2,
});

export const GROQ_MODELS = Object.freeze([
  { value: 'llama3-70b-8192',         label: 'LLaMA 3 70B — 8K ctx (Recommended)' },
  { value: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B Versatile' },
  { value: 'llama3-8b-8192',          label: 'LLaMA 3 8B — 8K ctx (Fast)' },
  { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B — 32K ctx' },
]);

export const ATS_HEADERS = Object.freeze({
  summary:        'PROFESSIONAL SUMMARY',
  experience:     'WORK EXPERIENCE',
  skills:         'TECHNICAL SKILLS',
  projects:       'PROJECTS',
  education:      'EDUCATION',
  certifications: 'CERTIFICATIONS',
  awards:         'AWARDS & RECOGNITION',
});

export const ERROR_TYPES = Object.freeze({
  NO_API_KEY:    'NO_API_KEY',
  NO_RESUME:     'NO_RESUME',
  PARSE_FAILURE: 'PARSE_FAILURE',
  FETCH_TIMEOUT: 'FETCH_TIMEOUT',
  API_ERROR:     'API_ERROR',
  VALIDATION:    'VALIDATION',
});

export const ERROR_MESSAGES = Object.freeze({
  NO_API_KEY:    'No API key saved. Open Settings (⚙) and paste your Groq API key.',
  NO_RESUME:     'No base resume saved. Open Settings (⚙) and paste your master resume.',
  PARSE_FAILURE: 'The model returned an unreadable response. This is usually transient — please retry.',
  FETCH_TIMEOUT: 'Request timed out after 30 seconds. Check your connection and retry.',
  API_ERROR:     'The Groq API returned an error. Verify your API key is valid and has quota remaining.',
  VALIDATION:    'Please paste a job description before running analysis.',
});
