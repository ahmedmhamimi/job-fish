/**
 * Sidebar controller for Job Fish. Runs in the Chrome Side Panel browser context.
 * Manages all UI interactions, file upload (DOCX text extraction via JSZip),
 * chrome.runtime message passing, and dynamic diff rendering.
 *
 * Architecture change in v2: the LLM now returns a structured mutable-fields JSON
 * (not a free-form diff). Diffs are computed here by comparing MUTABLE_DEFAULTS
 * against the LLM output before rendering the git-diff-style cards.
 *
 * Key functions:
 * - init() -> Promise<void>: loads settings, wires all event listeners.
 * - _initFileUpload() -> void: triggers file picker, extracts DOCX text via JSZip.
 * - _extractDocxText(file: File) -> Promise<string>: unzips DOCX, strips XML tags.
 * - _runAnalysis() -> Promise<void>: validates JD, calls LLM, renders output.
 * - _computeDiffs(payload: object) -> object[]: compares MUTABLE_DEFAULTS vs LLM output.
 * - _renderOutput(payload: object) -> void: summary block + diff cards.
 * - _buildDiffCard(item: object) -> HTMLElement: git-diff-style card element.
 * - _renderError(type: string, msg: string, detail?: string) -> void: error card.
 */

import { Engine }           from '../core/engine.js';
import { downloadDocx, downloadPdf } from '../services/exporter.js';
import {
  MUTABLE_DEFAULTS,
  EXPERIENCE_LABELS,
  PROJECT_LABELS,
  SKILL_LABELS,
} from '../template/resume-data.js';
import {
  MSG,
  GROQ_MODELS,
  ERROR_MESSAGES,
  ERROR_TYPES,
  DEFAULTS,
} from '../shared/constants.js';

// ── Module state ─────────────────────────────────────────────────────────────
const engine       = new Engine();
let currentPayload = null;
let isAnalyzing    = false;
let toastTimer     = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  _populateModelSelect(DEFAULTS.MODEL);
  _initSettingsToggle();
  _initApiKeyField();
  _initSlider(DEFAULTS.MATCH_TARGET);
  _initFileUpload();
  _initBaseResumeField('');
  _initAnalyzeButton();
  _initDownloadButtons();

  try {
    const res = await _sendMsg(MSG.GET_SETTINGS);
    if (res?.ok && res.data) {
      const { hasApiKey, endpoint, baseResume, matchTarget } = res.data;
      _populateModelSelect(endpoint);
      _initSlider(matchTarget);
      _initBaseResumeField(baseResume);
      if (hasApiKey) {
        const st = _el('apiKeyStatus');
        st.textContent = '✓ Key saved';
        st.classList.add('is-visible');
      }
    }
  } catch (_) {
    _showToast('Could not reach background worker — try reloading.', 'error');
  }
}

// ── Settings Toggle ───────────────────────────────────────────────────────────
function _initSettingsToggle() {
  const toggle  = _el('settingsToggle');
  const wrapper = _el('settingsWrapper');
  toggle.addEventListener('click', () => {
    const open = wrapper.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

// ── API Key ───────────────────────────────────────────────────────────────────
function _initApiKeyField() {
  const reveal = _el('revealApiKey');
  const input  = _el('apiKeyInput');
  const save   = _el('saveApiKey');
  const status = _el('apiKeyStatus');

  reveal.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    reveal.setAttribute('aria-pressed', String(!showing));
  });

  save.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) { _showStatus(status, '✗ Enter a key', true); return; }
    save.disabled = true;
    const res = await _sendMsg(MSG.SAVE_API_KEY, key);
    save.disabled = false;
    if (res?.ok) {
      input.value = ''; input.type = 'password';
      reveal.setAttribute('aria-pressed', 'false');
      _showStatus(status, '✓ Saved');
      _showToast('API key saved', 'success');
    } else {
      _showStatus(status, '✗ Failed', true);
    }
  });
}

// ── Model Selector ────────────────────────────────────────────────────────────
function _populateModelSelect(current) {
  const select = _el('modelSelect');
  select.innerHTML = '';
  for (const m of GROQ_MODELS) {
    const opt = document.createElement('option');
    opt.value = m.value; opt.textContent = m.label; opt.selected = m.value === current;
    select.appendChild(opt);
  }
  select.addEventListener('change', () =>
    _sendMsg(MSG.SAVE_SETTINGS, { endpoint: select.value }));
}

// ── ATS Match Slider ──────────────────────────────────────────────────────────
function _initSlider(val) {
  const slider = _el('matchSlider');
  const label  = _el('sliderValue');
  slider.value = val; label.textContent = `${val}%`;
  slider.setAttribute('aria-valuenow', String(val));
  slider.addEventListener('input', () => {
    label.textContent = `${slider.value}%`;
    slider.setAttribute('aria-valuenow', slider.value);
  });
  slider.addEventListener('change', () =>
    _sendMsg(MSG.SAVE_SETTINGS, { matchTarget: Number(slider.value) }));
}

// ── Base Resume Field ─────────────────────────────────────────────────────────
function _initBaseResumeField(text) {
  const ta     = _el('baseResume');
  const save   = _el('saveResume');
  const status = _el('resumeStatus');
  if (text) ta.value = text;
  save.addEventListener('click', async () => {
    const val = ta.value.trim();
    if (!val) { _showStatus(status, '✗ Empty', true); return; }
    save.disabled = true;
    const res = await _sendMsg(MSG.SAVE_RESUME, val);
    save.disabled = false;
    res?.ok ? _showStatus(status, '✓ Saved') : _showStatus(status, '✗ Failed', true);
  });
}

// ── File Upload ───────────────────────────────────────────────────────────────
function _initFileUpload() {
  const input   = _el('resumeFileInput');
  const trigger = _el('uploadResumeBtn');
  const status  = _el('uploadStatus');

  trigger.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    trigger.disabled = true;
    _showStatus(status, '⏳ Reading…');
    try {
      const text = await _extractDocxText(file);
      _el('baseResume').value = text;
      const res = await _sendMsg(MSG.SAVE_RESUME, text);
      if (res?.ok) {
        _showStatus(status, `✓ ${file.name} loaded`);
        _showToast('Resume uploaded and saved', 'success');
      } else {
        _showStatus(status, '✗ Save failed', true);
      }
    } catch (err) {
      _showStatus(status, `✗ ${err.message}`, true);
      _showToast('Could not read file — make sure it is a .docx', 'error');
    } finally {
      trigger.disabled = false;
      input.value = '';
    }
  });
}

/**
 * Extracts plain text from a .docx file using JSZip.
 * Reads word/document.xml, strips OOXML tags, preserves paragraph breaks.
 */
async function _extractDocxText(file) {
  if (!window.JSZip) throw new Error('JSZip not loaded');
  const buffer = await file.arrayBuffer();
  const zip    = await window.JSZip.loadAsync(buffer);
  const entry  = zip.file('word/document.xml');
  if (!entry) throw new Error('Invalid .docx: word/document.xml missing');
  const xml = await entry.async('string');

  return xml
    .replace(/<w:p[ >]/g,    '\n')    // paragraph → newline
    .replace(/<w:br[^>]*>/g,  '\n')   // line break → newline
    .replace(/<w:tab[^>]*/g,  '\t')   // tab → tab
    .replace(/<[^>]+>/g,       '')    // strip remaining tags
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Analyze Button ────────────────────────────────────────────────────────────
function _initAnalyzeButton() {
  _el('analyzeBtn').addEventListener('click', () => {
    if (!isAnalyzing) _runAnalysis();
  });
}

// ── Download Buttons ──────────────────────────────────────────────────────────
function _initDownloadButtons() {
  _el('downloadDocxBtn').addEventListener('click', async () => {
    if (!currentPayload) return;
    try {
      await downloadDocx(currentPayload);
      _showToast('DOCX download started', 'success');
    } catch (err) {
      _showToast(`DOCX error: ${err.message}`, 'error');
    }
  });

  _el('downloadPdfBtn').addEventListener('click', () => {
    if (!currentPayload) return;
    try {
      downloadPdf(currentPayload);
      _showToast('PDF download started', 'success');
    } catch (err) {
      _showToast(`PDF error: ${err.message}`, 'error');
    }
  });
}

// ── Analysis Flow ─────────────────────────────────────────────────────────────
async function _runAnalysis() {
  const jd     = _el('jobDescription').value.trim();
  const target = Number(_el('matchSlider').value);

  if (!jd || jd.length < 20) {
    _showToast('Please paste a job description first.', 'error'); return;
  }

  _lockUI(); _showLoading(); _clearOutput();

  try {
    const res = await _sendMsg(MSG.RUN_ANALYSIS, { jobDescription: jd, matchTarget: target });
    if (res?.ok && res.data) {
      _renderOutput(res.data);
      _showToast('Analysis complete', 'success');
    } else {
      _renderError(res?.error || ERROR_TYPES.API_ERROR, res?.message || ERROR_MESSAGES.API_ERROR, res?.detail || res?.raw);
    }
  } catch (err) {
    _renderError(ERROR_TYPES.API_ERROR, 'Failed to communicate with the background worker. Try reloading the extension.', err.message);
  } finally {
    _hideLoading(); _unlockUI();
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

// ── Output Rendering ──────────────────────────────────────────────────────────
function _renderOutput(payload) {
  currentPayload = payload;
  engine.setState(payload);
  const container = _el('outputSection');

  // 1. Summary block (keywords, score, notes)
  container.appendChild(_buildSummaryBlock(payload));

  // 2. Diff cards — computed by comparing defaults vs LLM output
  const diffs = _computeDiffs(payload);
  if (diffs.length > 0) {
    const hdr = document.createElement('div');
    hdr.className = 'cards-section-header';
    hdr.textContent = 'Modified Fields ';
    const badge = document.createElement('span');
    badge.className = 'cards-count-badge';
    badge.textContent = String(diffs.length);
    hdr.appendChild(badge);
    container.appendChild(hdr);
    diffs.forEach(d => container.appendChild(_buildDiffCard(d)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No modifications needed — your resume already covers the target stack for this role.';
    container.appendChild(empty);
  }

  // Enable download buttons
  for (const id of ['downloadDocxBtn', 'downloadPdfBtn']) {
    const btn = _el(id);
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
  }
}

function _buildSummaryBlock(payload) {
  const block = document.createElement('div');
  block.className = 'summary-block';

  const header = document.createElement('div');
  header.className = 'summary-header';
  const title = document.createElement('span');
  title.className = 'summary-title';
  title.textContent = 'ATS Analysis';
  const score = document.createElement('span');
  score.className = 'match-score';
  score.textContent = payload.estimatedTargetMatchScore || '—';
  header.appendChild(title); header.appendChild(score);
  block.appendChild(header);

  const body = document.createElement('div');
  body.className = 'summary-body';

  if ((payload.extractedPrimaryKeywords || []).length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'kw-section-label'; lbl.textContent = 'Primary Keywords';
    body.appendChild(lbl);
    const chips = document.createElement('div');
    chips.className = 'kw-chips';
    for (const kw of payload.extractedPrimaryKeywords) {
      const chip = document.createElement('span');
      chip.className = 'kw-chip'; chip.textContent = kw;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  if (payload.optimizerNotes) {
    const notes = document.createElement('p');
    notes.className = 'summary-notes'; notes.textContent = payload.optimizerNotes;
    body.appendChild(notes);
  }

  block.appendChild(body);
  return block;
}

/**
 * Computes structural diff between MUTABLE_DEFAULTS and the LLM payload.
 * Returns array of {section, originalLine, optimizedLine} objects.
 */
function _computeDiffs(payload) {
  const diffs = [];
  const def   = MUTABLE_DEFAULTS;
  const norm  = s => String(s || '').replace(/\s+/g, ' ').trim();

  // Summary
  if (payload.summary && norm(payload.summary) !== norm(def.summary)) {
    diffs.push({ section: 'Professional Summary', originalLine: def.summary, optimizedLine: payload.summary });
  }

  // Skills (languagesSpoken is immutable, handled by template)
  for (const [key, label] of Object.entries(SKILL_LABELS)) {
    const newVal = payload.skills?.[key];
    if (newVal && norm(newVal) !== norm(def.skills[key])) {
      diffs.push({ section: `Technical Skills — ${label}`, originalLine: def.skills[key], optimizedLine: newVal });
    }
  }

  // Experience bullets
  for (const [roleId, roleLabel] of Object.entries(EXPERIENCE_LABELS)) {
    const origArr = def.experienceBullets[roleId] || [];
    const newArr  = payload.experienceBullets?.[roleId] || origArr;
    origArr.forEach((orig, i) => {
      const next = newArr[i];
      if (next && norm(next) !== norm(orig)) {
        diffs.push({ section: `Work Experience — ${roleLabel}`, originalLine: orig, optimizedLine: next });
      }
    });
  }

  // Project bullets
  for (const [projId, projLabel] of Object.entries(PROJECT_LABELS)) {
    const origArr = def.projectBullets[projId] || [];
    const newArr  = payload.projectBullets?.[projId] || origArr;
    origArr.forEach((orig, i) => {
      const next = newArr[i];
      if (next && norm(next) !== norm(orig)) {
        diffs.push({ section: `Projects — ${projLabel}`, originalLine: orig, optimizedLine: next });
      }
    });
  }

  return diffs;
}

function _buildDiffCard(item) {
  const card = document.createElement('div');
  card.className = 'diff-card';

  const sec = document.createElement('div');
  sec.className = 'diff-section-label'; sec.textContent = item.section || '';
  card.appendChild(sec);

  // Removed line
  const rem = document.createElement('div');
  rem.className = 'diff-line diff-line--removed';
  const minusSpan = document.createElement('span');
  minusSpan.className = 'diff-prefix'; minusSpan.setAttribute('aria-hidden','true'); minusSpan.textContent = '-';
  const remText = document.createElement('span');
  remText.className = 'diff-text'; remText.textContent = item.originalLine || '';
  rem.appendChild(minusSpan); rem.appendChild(remText);
  card.appendChild(rem);

  // Added line
  const add = document.createElement('div');
  add.className = 'diff-line diff-line--added';
  const plusSpan = document.createElement('span');
  plusSpan.className = 'diff-prefix'; plusSpan.setAttribute('aria-hidden','true'); plusSpan.textContent = '+';
  const addText = document.createElement('span');
  addText.className = 'diff-text'; addText.textContent = item.optimizedLine || '';
  add.appendChild(plusSpan); add.appendChild(addText);
  card.appendChild(add);

  return card;
}

function _renderError(errorType, message, detail) {
  const container = _el('outputSection');
  const card = document.createElement('div');
  card.className = 'error-card';

  const type = document.createElement('div');
  type.className = 'error-type-label'; type.textContent = errorType || 'ERROR';
  card.appendChild(type);

  const msg = document.createElement('p');
  msg.className = 'error-message'; msg.textContent = message || 'An unexpected error occurred.';
  card.appendChild(msg);

  const hintMap = {
    [ERROR_TYPES.NO_API_KEY]:    'Open Settings (\u2699) and save your Groq API key.',
    [ERROR_TYPES.NO_RESUME]:     'Upload a .docx or paste your resume in Settings.',
    [ERROR_TYPES.PARSE_FAILURE]: 'The model response could not be parsed. Retry \u2014 or switch models in Settings.',
    [ERROR_TYPES.FETCH_TIMEOUT]: 'Request timed out. Check your connection and retry.',
    [ERROR_TYPES.API_ERROR]:     'If your key is correct, try switching to a different model in Settings.',
  };
  const hint = hintMap[errorType];
  if (hint) {
    const h = document.createElement('p');
    h.className = 'error-hint'; h.textContent = hint;
    card.appendChild(h);
  }

  if (detail) {
    const d = document.createElement('div');
    d.className = 'error-detail'; d.textContent = detail;
    card.appendChild(d);
  }

  container.appendChild(card);
}

function _clearOutput() {
  _el('outputSection').innerHTML = '';
  currentPayload = null;
  engine.clearState();
  for (const id of ['downloadDocxBtn', 'downloadPdfBtn']) {
    const btn = _el(id);
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
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
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function _sendMsg(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, response => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(response);
    });
  });
}

function _el(id) { return document.getElementById(id); }

// ── Entry point ───────────────────────────────────────────────────────────────
init().catch(err => console.error('[Job Fish] init failed:', err));
