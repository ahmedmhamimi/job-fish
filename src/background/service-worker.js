/**
 * Background service worker for Job Fish (Manifest V3).
 * Secure message router and LLM proxy. The raw API key never leaves this context.
 *
 * Message handlers:
 * - SAVE_API_KEY: validates and stores the API key in chrome.storage.local.
 * - SAVE_RESUME: stores extracted base resume text for LLM context.
 * - GET_SETTINGS: returns all non-secret settings to the sidebar.
 * - SAVE_SETTINGS: persists endpoint model, matchTarget, outputFilename, and downloadFolder changes.
 * - RUN_ANALYSIS: orchestrates LLM call, caches result in optimization_history.
 */

import { callLLM } from '../services/llm.js';
import { MSG, STORAGE_KEYS, DEFAULTS, ERROR_TYPES, ERROR_MESSAGES } from '../shared/constants.js';

// ── Lifecycle ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.MATCH_TARGET,
    STORAGE_KEYS.API_ENDPOINT,
    STORAGE_KEYS.OPTIMIZATION_HISTORY,
  ]);
  const init = {};
  if (existing[STORAGE_KEYS.MATCH_TARGET]         === undefined) init[STORAGE_KEYS.MATCH_TARGET]         = DEFAULTS.MATCH_TARGET;
  if (existing[STORAGE_KEYS.API_ENDPOINT]         === undefined) init[STORAGE_KEYS.API_ENDPOINT]         = DEFAULTS.MODEL;
  if (existing[STORAGE_KEYS.OPTIMIZATION_HISTORY] === undefined) init[STORAGE_KEYS.OPTIMIZATION_HISTORY] = [];
  if (Object.keys(init).length) await chrome.storage.local.set(init);
});

// Open side panel on toolbar icon click.
// Must be registered at top level (not in a callback) for MV3 SW reliability.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.action.onClicked.addListener(tab => {
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

// ── Message Router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message ?? {};
  switch (type) {
    case MSG.SAVE_API_KEY:  _handleSaveApiKey(payload, sendResponse);  return true;
    case MSG.SAVE_RESUME:   _handleSaveResume(payload, sendResponse);  return true;
    case MSG.GET_SETTINGS:  _handleGetSettings(sendResponse);          return true;
    case MSG.SAVE_SETTINGS: _handleSaveSettings(payload, sendResponse); return true;
    case MSG.RUN_ANALYSIS:  _handleRunAnalysis(payload, sendResponse); return true;
    default: sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE_TYPE' }); return false;
  }
});

// ── Handlers ───────────────────────────────────────────────────────────────
async function _handleSaveApiKey(payload, sendResponse) {
  try {
    if (typeof payload !== 'string' || !payload.trim()) {
      sendResponse({ ok: false, error: 'INVALID_KEY' }); return;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.GROQ_API_KEY]: payload.trim() });
    sendResponse({ ok: true });
  } catch (e) { sendResponse({ ok: false, error: e.message }); }
}

async function _handleSaveResume(payload, sendResponse) {
  try {
    // payload is either a plain string (paste flow, back-compat) or
    // { text: string, filename?: string } (file-upload flow, carries the
    // original uploaded filename so exports can be named to match).
    const text     = typeof payload === 'string' ? payload : payload?.text;
    const filename = typeof payload === 'string' ? undefined : payload?.filename;

    if (typeof text !== 'string' || !text.trim()) {
      sendResponse({ ok: false, error: 'INVALID_RESUME' }); return;
    }
    const toSave = { [STORAGE_KEYS.BASE_RESUME]: text.trim() };
    if (typeof filename === 'string' && filename.trim()) {
      toSave[STORAGE_KEYS.RESUME_FILENAME] = filename.trim();
    }
    await chrome.storage.local.set(toSave);
    sendResponse({ ok: true });
  } catch (e) { sendResponse({ ok: false, error: e.message }); }
}

async function _handleGetSettings(sendResponse) {
  try {
    const s = await chrome.storage.local.get([
      STORAGE_KEYS.GROQ_API_KEY,
      STORAGE_KEYS.API_ENDPOINT,
      STORAGE_KEYS.BASE_RESUME,
      STORAGE_KEYS.RESUME_FILENAME,
      STORAGE_KEYS.OUTPUT_FILENAME,
      STORAGE_KEYS.DOWNLOAD_FOLDER,
      STORAGE_KEYS.MATCH_TARGET,
      STORAGE_KEYS.OPTIMIZATION_HISTORY,
    ]);
    sendResponse({ ok: true, data: {
      hasApiKey:      Boolean(s[STORAGE_KEYS.GROQ_API_KEY]),
      endpoint:       s[STORAGE_KEYS.API_ENDPOINT]          || DEFAULTS.MODEL,
      baseResume:     s[STORAGE_KEYS.BASE_RESUME]           || '',
      resumeFilename: s[STORAGE_KEYS.RESUME_FILENAME]       || '',
      outputFilename: s[STORAGE_KEYS.OUTPUT_FILENAME]       || '',
      downloadFolder: s[STORAGE_KEYS.DOWNLOAD_FOLDER]       || '',
      matchTarget:    s[STORAGE_KEYS.MATCH_TARGET]          ?? DEFAULTS.MATCH_TARGET,
      history:        s[STORAGE_KEYS.OPTIMIZATION_HISTORY]  || [],
    }});
  } catch (e) { sendResponse({ ok: false, error: e.message }); }
}

async function _handleSaveSettings(payload, sendResponse) {
  try {
    const u = {};
    if (payload?.endpoint    != null) u[STORAGE_KEYS.API_ENDPOINT] = payload.endpoint;
    if (payload?.matchTarget != null) u[STORAGE_KEYS.MATCH_TARGET] = Number(payload.matchTarget);
    // Empty string is a valid, intentional value here — it means "clear the
    // override and fall back to the uploaded resume's filename" — so this
    // checks for null/undefined only, not falsy.
    if (payload?.outputFilename != null) {
      u[STORAGE_KEYS.OUTPUT_FILENAME] = String(payload.outputFilename).trim();
    }
    // Same "empty string clears it" convention as outputFilename above.
    if (payload?.downloadFolder != null) {
      u[STORAGE_KEYS.DOWNLOAD_FOLDER] = String(payload.downloadFolder).trim();
    }
    await chrome.storage.local.set(u);
    sendResponse({ ok: true });
  } catch (e) { sendResponse({ ok: false, error: e.message }); }
}

async function _handleRunAnalysis(payload, sendResponse) {
  const { jobDescription, matchTarget } = payload ?? {};
  if (!jobDescription?.trim() || jobDescription.trim().length < 20) {
    sendResponse({ ok: false, error: ERROR_TYPES.VALIDATION, message: ERROR_MESSAGES.VALIDATION });
    return;
  }
  const target = Number.isFinite(matchTarget) ? matchTarget : DEFAULTS.MATCH_TARGET;
  try {
    const result = await callLLM(jobDescription.trim(), target);

    // Prepend to history (keep last N).
    const s       = await chrome.storage.local.get(STORAGE_KEYS.OPTIMIZATION_HISTORY);
    const history = s[STORAGE_KEYS.OPTIMIZATION_HISTORY] || [];
    await chrome.storage.local.set({
      [STORAGE_KEYS.OPTIMIZATION_HISTORY]: [
        { ...result, _timestamp: Date.now() },
        ...history,
      ].slice(0, DEFAULTS.HISTORY_LIMIT),
    });
    sendResponse({ ok: true, data: result });
  } catch (err) {
    const errorType = err?.error || ERROR_TYPES.API_ERROR;
    sendResponse({
      ok:      false,
      error:   errorType,
      message: ERROR_MESSAGES[errorType] || ERROR_MESSAGES.API_ERROR,
      detail:  err?.detail  || null,
      status:  err?.status  || null,
      raw:     err?.raw     || null,
    });
  }
}