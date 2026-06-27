/**
 * Sidebar controller for Job Fish. Runs in the side panel browser context.
 * Manages all UI interactions, chrome.runtime message passing, and
 * dynamic rendering of diff cards, summary blocks, and error states.
 *
 * - init() -> Promise<void>: loads settings from storage, wires all event listeners.
 * - _initSettingsToggle() -> void: settings accordion open/close with ARIA state updates.
 * - _initApiKeyField() -> void: show/hide toggle + save-on-click + field clear.
 * - _populateModelSelect(currentModel: string) -> void: builds model option elements.
 * - _initSlider(initialValue: number) -> void: live label update + persist on change.
 * - _initBaseResumeField(initialValue: string) -> void: pre-populates and wires save button.
 * - _initAnalyzeButton() -> void: validates, locks UI, dispatches RUN_ANALYSIS message.
 * - _initDownloadButton() -> void: calls exportResume with current payload on click.
 * - _runAnalysis() -> Promise<void>: full analysis flow with UI state management.
 * - _lockUI() -> void / _unlockUI() -> void: disables/re-enables interactive elements.
 * - _showLoading() -> void / _hideLoading() -> void: loading state visibility.
 * - _renderOutput(payload: object) -> void: orchestrates all output rendering.
 * - _buildSummaryBlock(payload: object) -> HTMLElement: match score + keyword chips + notes.
 * - _buildSkillsCard(skillsAdditions: object[]) -> HTMLElement: skills section diff card.
 * - _buildDiffCard(item: object) -> HTMLElement: single git-diff-style bullet diff card.
 * - _buildReorderCard(reorderPayload: object) -> HTMLElement: section order suggestion card.
 * - _renderError(errorType: string, message: string) -> void: error card in output area.
 * - _clearOutput() -> void: empties output section, disables download button.
 * - _showToast(message: string, type?: string) -> void: ephemeral status notification.
 * - _sendMsg(type: string, payload?: any) -> Promise<object>: promisified chrome.runtime.sendMessage.
 * - _el(id: string) -> HTMLElement: getElementById shorthand.
 */

import { Engine }        from '../core/engine.js';
import { exportResume }  from '../services/exporter.js';
import {
  MSG,
  GROQ_MODELS,
  ERROR_MESSAGES,
  ERROR_TYPES,
  DEFAULTS,
} from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const engine = new Engine();
let currentPayload   = null;
let isAnalyzing      = false;
let toastTimer       = null;
let reorderAccepted  = false;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  _populateModelSelect(DEFAULTS.MODEL);
  _initSettingsToggle();
  _initApiKeyField();
  _initSlider(DEFAULTS.MATCH_TARGET);
  _initAnalyzeButton();
  _initDownloadButton();

  try {
    const res = await _sendMsg(MSG.GET_SETTINGS);
    if (res?.ok && res.data) {
      const { hasApiKey, endpoint, baseResume, matchTarget } = res.data;

      _populateModelSelect(endpoint);
      _initBaseResumeField(baseResume);
      _initSlider(matchTarget);

      // Show a subtle indicator if API key is already saved.
      if (hasApiKey) {
        const status = _el('apiKeyStatus');
        status.textContent = '✓ Key saved';
        status.classList.add('is-visible');
      }
    }
  } catch (_) {
    _showToast('Could not connect to the background worker. Try reloading.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Settings Toggle
// ---------------------------------------------------------------------------

function _initSettingsToggle() {
  const toggle  = _el('settingsToggle');
  const wrapper = _el('settingsWrapper');

  toggle.addEventListener('click', () => {
    const isOpen = wrapper.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// ---------------------------------------------------------------------------
// API Key Field
// ---------------------------------------------------------------------------

function _initApiKeyField() {
  const revealBtn  = _el('revealApiKey');
  const input      = _el('apiKeyInput');
  const saveBtn    = _el('saveApiKey');
  const statusEl   = _el('apiKeyStatus');

  revealBtn.addEventListener('click', () => {
    const isShowing = input.type === 'text';
    input.type = isShowing ? 'password' : 'text';
    revealBtn.setAttribute('aria-pressed', String(!isShowing));
  });

  saveBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) {
      _showStatus(statusEl, '✗ Enter a key', true);
      return;
    }
    saveBtn.disabled = true;
    const res = await _sendMsg(MSG.SAVE_API_KEY, key);
    saveBtn.disabled = false;

    if (res?.ok) {
      input.value = '';
      input.type  = 'password';
      revealBtn.setAttribute('aria-pressed', 'false');
      _showStatus(statusEl, '✓ Key saved');
      _showToast('API key saved successfully', 'success');
    } else {
      _showStatus(statusEl, '✗ Failed to save', true);
    }
  });
}

// ---------------------------------------------------------------------------
// Model Selector
// ---------------------------------------------------------------------------

function _populateModelSelect(currentModel) {
  const select = _el('modelSelect');
  select.innerHTML = '';

  for (const model of GROQ_MODELS) {
    const opt = document.createElement('option');
    opt.value       = model.value;
    opt.textContent = model.label;
    opt.selected    = model.value === currentModel;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    _sendMsg(MSG.SAVE_SETTINGS, { endpoint: select.value });
  });
}

// ---------------------------------------------------------------------------
// ATS Match Slider
// ---------------------------------------------------------------------------

function _initSlider(initialValue) {
  const slider     = _el('matchSlider');
  const valueLabel = _el('sliderValue');

  slider.value = initialValue;
  valueLabel.textContent = `${initialValue}%`;
  slider.setAttribute('aria-valuenow', String(initialValue));

  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    valueLabel.textContent = `${v}%`;
    slider.setAttribute('aria-valuenow', String(v));
  });

  slider.addEventListener('change', () => {
    _sendMsg(MSG.SAVE_SETTINGS, { matchTarget: Number(slider.value) });
  });
}

// ---------------------------------------------------------------------------
// Base Resume Field
// ---------------------------------------------------------------------------

function _initBaseResumeField(initialValue) {
  const textarea = _el('baseResume');
  const saveBtn  = _el('saveResume');
  const statusEl = _el('resumeStatus');

  if (initialValue) textarea.value = initialValue;

  saveBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      _showStatus(statusEl, '✗ Resume is empty', true);
      return;
    }
    saveBtn.disabled = true;
    const res = await _sendMsg(MSG.SAVE_RESUME, text);
    saveBtn.disabled = false;

    if (res?.ok) {
      _showStatus(statusEl, '✓ Saved');
      _showToast('Base resume saved', 'success');
    } else {
      _showStatus(statusEl, '✗ Failed', true);
    }
  });
}

// ---------------------------------------------------------------------------
// Analyze Button
// ---------------------------------------------------------------------------

function _initAnalyzeButton() {
  _el('analyzeBtn').addEventListener('click', () => {
    if (!isAnalyzing) _runAnalysis();
  });
}

// ---------------------------------------------------------------------------
// Download Button
// ---------------------------------------------------------------------------

function _initDownloadButton() {
  _el('downloadBtn').addEventListener('click', () => {
    if (!currentPayload) return;
    const baseResume = _el('baseResume').value.trim();

    if (!baseResume) {
      _showToast('Base resume not found in settings. Please save it first.', 'error');
      return;
    }

    exportResume(baseResume, currentPayload, reorderAccepted);
    _showToast('Download started', 'success');
  });
}

// ---------------------------------------------------------------------------
// Analysis Flow
// ---------------------------------------------------------------------------

async function _runAnalysis() {
  const jobDescription = _el('jobDescription').value.trim();
  const matchTarget    = Number(_el('matchSlider').value);
  const baseResume     = _el('baseResume').value.trim();

  // Client-side validation using the Engine.
  const validation = engine.validate(baseResume, jobDescription);
  if (!validation.valid) {
    _showToast(ERROR_MESSAGES[validation.error] || 'Validation failed.', 'error');
    return;
  }

  _lockUI();
  _showLoading();
  _clearOutput();

  try {
    const res = await _sendMsg(MSG.RUN_ANALYSIS, { jobDescription, matchTarget });

    if (res?.ok && res.data) {
      _renderOutput(res.data);
      _showToast('Analysis complete', 'success');
    } else {
      _renderError(res?.error || ERROR_TYPES.API_ERROR, res?.message || ERROR_MESSAGES.API_ERROR);
    }
  } catch (err) {
    _renderError(ERROR_TYPES.API_ERROR, 'Failed to communicate with the background worker. Try reloading the extension.');
  } finally {
    _hideLoading();
    _unlockUI();
  }
}

function _lockUI() {
  isAnalyzing = true;
  document.querySelector('.app-shell').classList.add('is-locked');
  _el('analyzeBtn').disabled = true;
  _el('analyzeBtn').setAttribute('aria-disabled', 'true');
}

function _unlockUI() {
  isAnalyzing = false;
  document.querySelector('.app-shell').classList.remove('is-locked');
  _el('analyzeBtn').disabled = false;
  _el('analyzeBtn').setAttribute('aria-disabled', 'false');
}

function _showLoading() {
  _el('loadingState').classList.add('is-visible');
  _el('loadingState').removeAttribute('aria-hidden');
}

function _hideLoading() {
  _el('loadingState').classList.remove('is-visible');
  _el('loadingState').setAttribute('aria-hidden', 'true');
}

// ---------------------------------------------------------------------------
// Output Rendering
// ---------------------------------------------------------------------------

function _renderOutput(payload) {
  currentPayload  = payload;
  reorderAccepted = false;
  engine.setState(payload);

  const container = _el('outputSection');

  // 1. Summary block.
  container.appendChild(_buildSummaryBlock(payload));

  // 2. Skills section additions.
  if (payload.skillsSectionAdditions?.length > 0) {
    container.appendChild(_buildSkillsCard(payload.skillsSectionAdditions));
  }

  // 3. Modified bullet diff cards.
  const bullets = payload.modifiedBulletPoints || [];
  if (bullets.length > 0) {
    // Section label + count.
    const headerRow = document.createElement('div');
    headerRow.className = 'cards-section-header';
    headerRow.textContent = 'Modified Bullets ';
    const countBadge = document.createElement('span');
    countBadge.className = 'cards-count-badge';
    countBadge.textContent = String(bullets.length);
    headerRow.appendChild(countBadge);
    container.appendChild(headerRow);

    for (const item of bullets) {
      container.appendChild(_buildDiffCard(item));
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No modifications needed — your resume already covers the target stack.';
    container.appendChild(empty);
  }

  // 4. Section reorder suggestion.
  if (payload.sectionReorderSuggestion?.suggested) {
    container.appendChild(_buildReorderCard(payload.sectionReorderSuggestion));
  }

  // Enable download button.
  const dlBtn = _el('downloadBtn');
  dlBtn.disabled = false;
  dlBtn.removeAttribute('aria-disabled');
}

function _buildSummaryBlock(payload) {
  const block = document.createElement('div');
  block.className = 'summary-block';

  // Header row with score.
  const header = document.createElement('div');
  header.className = 'summary-header';
  const title = document.createElement('span');
  title.className = 'summary-title';
  title.textContent = 'ATS Analysis';
  const score = document.createElement('span');
  score.className = 'match-score';
  score.textContent = payload.estimatedTargetMatchScore || '—';
  header.appendChild(title);
  header.appendChild(score);
  block.appendChild(header);

  const body = document.createElement('div');
  body.className = 'summary-body';

  // Primary keywords.
  const keywords = payload.extractedPrimaryKeywords || [];
  const titleWeighted = new Set(payload.titleWeightedKeywords || []);
  if (keywords.length > 0) {
    const kwLabel = document.createElement('div');
    kwLabel.className = 'kw-section-label';
    kwLabel.textContent = 'Primary Keywords';
    body.appendChild(kwLabel);

    const chips = document.createElement('div');
    chips.className = 'kw-chips';
    for (const kw of keywords) {
      const chip = document.createElement('span');
      chip.className = titleWeighted.has(kw)
        ? 'kw-chip kw-chip--title'
        : 'kw-chip';
      chip.textContent = kw;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  // Optimizer notes.
  if (payload.optimizerNotes) {
    const notesEl = document.createElement('p');
    notesEl.className = 'summary-notes';
    notesEl.textContent = payload.optimizerNotes;
    body.appendChild(notesEl);
  }

  block.appendChild(body);
  return block;
}

function _buildSkillsCard(skillsAdditions) {
  const card = document.createElement('div');
  card.className = 'skills-card';

  const cardHeader = document.createElement('div');
  cardHeader.className = 'skills-card-header';
  cardHeader.textContent = `Skills Section — ${skillsAdditions.length} Suggestion${skillsAdditions.length > 1 ? 's' : ''}`;
  card.appendChild(cardHeader);

  for (const item of skillsAdditions) {
    const row = document.createElement('div');
    row.className = 'skills-item';

    const oldLine = document.createElement('div');
    oldLine.className = 'skills-old';
    oldLine.textContent = item.existingSkillLine || '';
    row.appendChild(oldLine);

    const newLine = document.createElement('div');
    newLine.className = 'skills-new';
    newLine.textContent = item.suggestedSkillLine || '';
    row.appendChild(newLine);

    if (item.justification) {
      const just = document.createElement('div');
      just.className = 'skills-just';
      just.textContent = item.justification;
      row.appendChild(just);
    }

    card.appendChild(row);
  }

  return card;
}

function _buildDiffCard(item) {
  const card = document.createElement('div');
  card.className = 'diff-card';

  // Section label.
  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'diff-section-label';
  sectionLabel.textContent = item.section || 'Unknown Section';
  card.appendChild(sectionLabel);

  // Removed (original) line.
  const removedLine = document.createElement('div');
  removedLine.className = 'diff-line diff-line--removed';
  const minusSpan = document.createElement('span');
  minusSpan.className = 'diff-prefix';
  minusSpan.setAttribute('aria-hidden', 'true');
  minusSpan.textContent = '-';
  const removedText = document.createElement('span');
  removedText.className = 'diff-text';
  removedText.textContent = item.originalLine || '';
  removedLine.appendChild(minusSpan);
  removedLine.appendChild(removedText);
  card.appendChild(removedLine);

  // Added (optimized) line.
  const addedLine = document.createElement('div');
  addedLine.className = 'diff-line diff-line--added';
  const plusSpan = document.createElement('span');
  plusSpan.className = 'diff-prefix';
  plusSpan.setAttribute('aria-hidden', 'true');
  plusSpan.textContent = '+';
  const addedText = document.createElement('span');
  addedText.className = 'diff-text';
  addedText.textContent = item.optimizedLine || '';
  addedLine.appendChild(plusSpan);
  addedLine.appendChild(addedText);
  card.appendChild(addedLine);

  // Justification accordion.
  const details = document.createElement('details');
  details.className = 'diff-justification';

  const summary = document.createElement('summary');
  summary.className = 'diff-justification-summary';

  // Chevron icon.
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 10 10');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.classList.add('diff-chevron');
  const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevronPath.setAttribute('d', 'M3 2l4 3-4 3');
  chevronPath.setAttribute('stroke', 'currentColor');
  chevronPath.setAttribute('stroke-width', '1.5');
  chevronPath.setAttribute('stroke-linecap', 'round');
  chevronPath.setAttribute('stroke-linejoin', 'round');
  chevron.appendChild(chevronPath);

  const summaryText = document.createTextNode('Justification ');

  // Confidence badge.
  const confidence  = (item.confidence || 'medium').toLowerCase();
  const confBadge   = document.createElement('span');
  confBadge.className = `badge badge--${confidence}`;
  confBadge.textContent = confidence;

  summary.appendChild(chevron);
  summary.appendChild(summaryText);
  summary.appendChild(confBadge);

  const justText = document.createElement('p');
  justText.className = 'diff-justification-text';
  justText.textContent = item.justification || '';

  details.appendChild(summary);
  details.appendChild(justText);
  card.appendChild(details);

  return card;
}

function _buildReorderCard(reorderPayload) {
  const card = document.createElement('div');
  card.className = 'reorder-card';

  const title = document.createElement('div');
  title.className = 'reorder-title';
  title.textContent = '⚡ Section Order Suggestion';
  card.appendChild(title);

  const reason = document.createElement('p');
  reason.className = 'reorder-reason';
  reason.textContent = reorderPayload.reason || '';
  card.appendChild(reason);

  if (Array.isArray(reorderPayload.recommendedOrder)) {
    const label = document.createElement('div');
    label.className = 'kw-section-label';
    label.textContent = 'Recommended order:';
    card.appendChild(label);

    const orderRow = document.createElement('div');
    orderRow.className = 'reorder-order';
    for (const section of reorderPayload.recommendedOrder) {
      const item = document.createElement('span');
      item.className = 'reorder-order-item';
      item.textContent = section;
      orderRow.appendChild(item);
    }
    card.appendChild(orderRow);
  }

  // Checkbox to apply reorder on export.
  const checkLabel = document.createElement('label');
  checkLabel.className = 'reorder-label';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = false;
  checkbox.addEventListener('change', () => {
    reorderAccepted = checkbox.checked;
  });
  checkLabel.appendChild(checkbox);
  checkLabel.appendChild(document.createTextNode('Apply reorder when downloading'));
  card.appendChild(checkLabel);

  return card;
}

function _renderError(errorType, message) {
  const container = _el('outputSection');

  const card = document.createElement('div');
  card.className = 'error-card';

  const typeLabel = document.createElement('div');
  typeLabel.className = 'error-type-label';
  typeLabel.textContent = errorType || 'ERROR';
  card.appendChild(typeLabel);

  const msgEl = document.createElement('p');
  msgEl.className = 'error-message';
  msgEl.textContent = message || 'An unexpected error occurred.';
  card.appendChild(msgEl);

  // Contextual hint.
  const hintMap = {
    [ERROR_TYPES.NO_API_KEY]:    'Open Settings (⚙) and save your Groq API key.',
    [ERROR_TYPES.NO_RESUME]:     'Open Settings (⚙), paste your resume, and click Save Resume.',
    [ERROR_TYPES.PARSE_FAILURE]: 'The model response could not be parsed. Click Analyze & Optimize to retry.',
    [ERROR_TYPES.FETCH_TIMEOUT]: 'The request timed out. Check your internet connection and retry.',
    [ERROR_TYPES.API_ERROR]:     'Check that your Groq API key is valid and has remaining quota.',
  };

  const hint = hintMap[errorType];
  if (hint) {
    const hintEl = document.createElement('p');
    hintEl.className = 'error-hint';
    hintEl.textContent = hint;
    card.appendChild(hintEl);
  }

  container.appendChild(card);
}

function _clearOutput() {
  const container = _el('outputSection');
  container.innerHTML = '';
  currentPayload  = null;
  reorderAccepted = false;
  engine.clearState();

  const dlBtn = _el('downloadBtn');
  dlBtn.disabled = true;
  dlBtn.setAttribute('aria-disabled', 'true');
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function _showStatus(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('is-error', isError);
  el.classList.add('is-visible');
  setTimeout(() => el.classList.remove('is-visible'), 3500);
}

function _showToast(message, type = 'success') {
  const toast = _el('toast');
  clearTimeout(toastTimer);

  toast.textContent = message;
  toast.className   = `toast toast--${type}`;
  toast.classList.add('is-visible');

  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3000);
}

/**
 * Wraps chrome.runtime.sendMessage in a Promise.
 * Resolves with the response object; rejects if chrome.runtime.lastError is set.
 * @param {string} type
 * @param {*}      payload
 * @returns {Promise<object>}
 */
function _sendMsg(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function _el(id) {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// Entry point — ES modules always defer, so DOM is guaranteed ready here.
// ---------------------------------------------------------------------------
init().catch(err => {
  console.error('[Job Fish] init failed:', err);
});
