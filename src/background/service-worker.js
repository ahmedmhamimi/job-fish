/**
 * Background service worker for Job Fish (Manifest V3).
 * The sole trusted proxy between the sidebar UI and external resources.
 * Handles all chrome.runtime messages, securely stores credentials in
 * chrome.storage.local, and invokes the LLM pipeline — keeping the raw
 * API key completely out of the sidebar/UI layer.
 *
 * - onInstalled listener: writes default storage values on first install.
 * - onClicked listener: opens the Chrome side panel for the active tab.
 * - onMessage listener: routes SAVE_API_KEY | SAVE_RESUME | GET_SETTINGS | SAVE_SETTINGS | RUN_ANALYSIS.
 * - _handleSaveApiKey(payload: string, sendResponse: fn) -> void: validates and stores API key.
 * - _handleSaveResume(payload: string, sendResponse: fn) -> void: validates and stores base resume.
 * - _handleGetSettings(sendResponse: fn) -> void: retrieves all non-secret settings for the sidebar.
 * - _handleSaveSettings(payload: object, sendResponse: fn) -> void: persists endpoint and matchTarget.
 * - _handleRunAnalysis(payload: object, sendResponse: fn) -> void: runs LLM pipeline, caches result to history.
 */

import { callLLM }                                   from '../services/llm.js';
import { MSG, STORAGE_KEYS, DEFAULTS, ERROR_TYPES, ERROR_MESSAGES } from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.MATCH_TARGET,
    STORAGE_KEYS.API_ENDPOINT,
    STORAGE_KEYS.OPTIMIZATION_HISTORY,
  ]);

  const defaults = {};
  if (existing[STORAGE_KEYS.MATCH_TARGET] === undefined) {
    defaults[STORAGE_KEYS.MATCH_TARGET] = DEFAULTS.MATCH_TARGET;
  }
  if (existing[STORAGE_KEYS.API_ENDPOINT] === undefined) {
    defaults[STORAGE_KEYS.API_ENDPOINT] = DEFAULTS.MODEL;
  }
  if (existing[STORAGE_KEYS.OPTIMIZATION_HISTORY] === undefined) {
    defaults[STORAGE_KEYS.OPTIMIZATION_HISTORY] = [];
  }

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }
});

// Open the side panel when the user clicks the action icon.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Fallback for older Chrome versions that require the onClicked approach.
    chrome.action.onClicked.addListener(tab => {
      if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
    });
  });

// ---------------------------------------------------------------------------
// Message Router
// Return `true` from every handler branch to signal async sendResponse.
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message ?? {};

  switch (type) {
    case MSG.SAVE_API_KEY:
      _handleSaveApiKey(payload, sendResponse);
      return true;

    case MSG.SAVE_RESUME:
      _handleSaveResume(payload, sendResponse);
      return true;

    case MSG.GET_SETTINGS:
      _handleGetSettings(sendResponse);
      return true;

    case MSG.SAVE_SETTINGS:
      _handleSaveSettings(payload, sendResponse);
      return true;

    case MSG.RUN_ANALYSIS:
      _handleRunAnalysis(payload, sendResponse);
      return true;

    default:
      sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE_TYPE' });
      return false;
  }
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function _handleSaveApiKey(payload, sendResponse) {
  try {
    if (typeof payload !== 'string' || payload.trim().length === 0) {
      sendResponse({ ok: false, error: 'INVALID_KEY', message: 'API key must be a non-empty string.' });
      return;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.GROQ_API_KEY]: payload.trim() });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: 'STORAGE_ERROR', message: err.message });
  }
}

async function _handleSaveResume(payload, sendResponse) {
  try {
    if (typeof payload !== 'string' || payload.trim().length === 0) {
      sendResponse({ ok: false, error: 'INVALID_RESUME', message: 'Resume must be a non-empty string.' });
      return;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.BASE_RESUME]: payload.trim() });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: 'STORAGE_ERROR', message: err.message });
  }
}

async function _handleGetSettings(sendResponse) {
  try {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.GROQ_API_KEY,
      STORAGE_KEYS.API_ENDPOINT,
      STORAGE_KEYS.BASE_RESUME,
      STORAGE_KEYS.MATCH_TARGET,
      STORAGE_KEYS.OPTIMIZATION_HISTORY,
    ]);

    sendResponse({
      ok: true,
      data: {
        hasApiKey:   Boolean(stored[STORAGE_KEYS.GROQ_API_KEY]),
        endpoint:    stored[STORAGE_KEYS.API_ENDPOINT]          || DEFAULTS.MODEL,
        baseResume:  stored[STORAGE_KEYS.BASE_RESUME]           || '',
        matchTarget: stored[STORAGE_KEYS.MATCH_TARGET]          ?? DEFAULTS.MATCH_TARGET,
        history:     stored[STORAGE_KEYS.OPTIMIZATION_HISTORY]  || [],
      },
    });
  } catch (err) {
    sendResponse({ ok: false, error: 'STORAGE_ERROR', message: err.message });
  }
}

async function _handleSaveSettings(payload, sendResponse) {
  try {
    const update = {};
    if (payload?.endpoint    !== undefined) update[STORAGE_KEYS.API_ENDPOINT] = payload.endpoint;
    if (payload?.matchTarget !== undefined) update[STORAGE_KEYS.MATCH_TARGET] = Number(payload.matchTarget);
    await chrome.storage.local.set(update);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: 'STORAGE_ERROR', message: err.message });
  }
}

async function _handleRunAnalysis(payload, sendResponse) {
  const { jobDescription, matchTarget } = payload ?? {};

  if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length < 20) {
    sendResponse({
      ok:      false,
      error:   ERROR_TYPES.VALIDATION,
      message: ERROR_MESSAGES.VALIDATION,
    });
    return;
  }

  const target = Number.isFinite(matchTarget) ? matchTarget : DEFAULTS.MATCH_TARGET;

  try {
    const result = await callLLM(jobDescription.trim(), target);

    // Prepend to history, keep last N.
    const stored  = await chrome.storage.local.get(STORAGE_KEYS.OPTIMIZATION_HISTORY);
    const history = stored[STORAGE_KEYS.OPTIMIZATION_HISTORY] || [];
    const updated = [{ ...result, _timestamp: Date.now() }, ...history]
      .slice(0, DEFAULTS.HISTORY_LIMIT);
    await chrome.storage.local.set({ [STORAGE_KEYS.OPTIMIZATION_HISTORY]: updated });

    sendResponse({ ok: true, data: result });
  } catch (err) {
    const errorType = err?.error || ERROR_TYPES.API_ERROR;
    sendResponse({
      ok:      false,
      error:   errorType,
      message: ERROR_MESSAGES[errorType] || ERROR_MESSAGES.API_ERROR,
      raw:     err?.raw || null,
    });
  }
}
