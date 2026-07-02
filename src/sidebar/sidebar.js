/**
 * Sidebar controller for Job Fish — v3 UI. Runs in the Chrome Side Panel browser context.
 * Manages all UI interactions, file upload (DOCX text extraction via JSZip),
 * chrome.runtime message passing, and dynamic diff rendering.
 *
 * v3 UI additions:
 * - _initTheme() -> void: dark/light toggle persisted to localStorage.
 * - _initDrawer() -> void: slide-out settings drawer with scrim.
 * - _updateResumeBanner(hasResume: bool) -> void: top-of-screen nudge.
 * - _animateScoreRing(pct: number) -> void: animated SVG arc for ATS score.
 * - _buildSummaryBlock() now renders a score-ring hero rather than plain text.
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

import { Engine }             from '../core/engine.js';
import {
  buildExportBlobs,
  revokeExportBlobs,
  triggerDownload,
} from '../services/exporter.js';
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
const engine        = new Engine();
let currentPayload  = null;
let isAnalyzing     = false;
let toastTimer      = null;
let resumeFilename  = '';   // original uploaded resume's base name (no extension)
let outputFilename  = '';   // user-set override for export file names; wins over resumeFilename
let exportBlobs     = null; // { docx: {blob,url,filename,mime}, pdf: {...} } — prebuilt for preview/download

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  _initTheme();
  _initDrawer();
  _populateModelSelect(DEFAULTS.MODEL);
  _initApiKeyField();
  _initSlider(DEFAULTS.MATCH_TARGET);
  _initFileUpload();
  _initBaseResumeField('');
  _initOutputFilenameField();
  _initAnalyzeButton();
  _initExportDock();
  _initPreviewModal();

  try {
    const res = await _sendMsg(MSG.GET_SETTINGS);
    if (res?.ok && res.data) {
      const {
        hasApiKey, endpoint, baseResume,
        resumeFilename: savedFilename,
        outputFilename: savedOutputFilename,
        matchTarget,
      } = res.data;
      _populateModelSelect(endpoint);
      _initSlider(matchTarget);
      _initBaseResumeField(baseResume);
      resumeFilename = savedFilename || '';
      outputFilename = savedOutputFilename || '';
      _el('outputFilename').value = outputFilename;
      const hasResume = !!(baseResume && baseResume.trim());
      _updateResumeBanner(hasResume);
      if (hasResume && resumeFilename) {
        _reflectUploadedFilename(resumeFilename);
      }
      if (hasApiKey) {
        const st = _el('apiKeyStatus');
        st.textContent = '✓ Key saved';
        st.classList.add('is-visible');
      }
    } else {
      _updateResumeBanner(false);
    }
  } catch (_) {
    _showToast('Could not reach background worker — try reloading.', 'error');
  }
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function _initTheme() {
  const stored = localStorage.getItem('jf-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);

  _el('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jf-theme', next);
  });
}

// ── Settings Drawer ───────────────────────────────────────────────────────────
function _initDrawer() {
  const toggle  = _el('settingsToggle');
  const drawer  = _el('settingsDrawer');
  const scrim   = _el('drawerScrim');
  const close   = _el('drawerClose');

  function openDrawer() {
    drawer.classList.add('is-open');
    scrim.classList.add('is-open');
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    scrim.removeAttribute('aria-hidden');
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    scrim.setAttribute('aria-hidden', 'true');
  }

  toggle.addEventListener('click', () => {
    drawer.classList.contains('is-open') ? closeDrawer() : openDrawer();
  });

  close.addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });
}

// ── Resume Banner ─────────────────────────────────────────────────────────────
function _updateResumeBanner(hasResume) {
  const banner = _el('resumeBanner');
  if (hasResume) {
    banner.classList.add('is-hidden');
  } else {
    banner.classList.remove('is-hidden');
    banner.onclick = () => {
      // Open settings drawer
      const drawer = _el('settingsDrawer');
      const scrim  = _el('drawerScrim');
      const toggle = _el('settingsToggle');
      drawer.classList.add('is-open');
      scrim.classList.add('is-open');
      toggle.classList.add('is-active');
      toggle.setAttribute('aria-expanded', 'true');
      scrim.removeAttribute('aria-hidden');
      // Focus the resume textarea
      setTimeout(() => _el('baseResume').focus(), 320);
    };
  }
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
    if (res?.ok) {
      _showStatus(status, '✓ Saved');
      _updateResumeBanner(true);
    } else {
      _showStatus(status, '✗ Failed', true);
    }
  });
}

// ── Output Filename (manual override, persists like the resume) ───────────────
function _initOutputFilenameField() {
  const input  = _el('outputFilename');
  const save   = _el('saveOutputFilename');
  const status = _el('outputFilenameStatus');

  save.addEventListener('click', async () => {
    const val = input.value.trim();
    save.disabled = true;
    const res = await _sendMsg(MSG.SAVE_SETTINGS, { outputFilename: val });
    save.disabled = false;
    if (res?.ok) {
      outputFilename = val;
      _showStatus(status, val ? '✓ Saved' : '✓ Cleared (using resume name)');
      _showToast(val ? 'Output file name saved' : 'Output file name cleared', 'success');
    } else {
      _showStatus(status, '✗ Failed', true);
    }
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
      const baseName = file.name.replace(/\.[^./\\]+$/, '').trim();
      _el('baseResume').value = text;
      const res = await _sendMsg(MSG.SAVE_RESUME, { text, filename: baseName });
      if (res?.ok) {
        resumeFilename = baseName;
        _showStatus(status, `✓ ${file.name}`);
        _showToast('Resume uploaded and saved', 'success');
        _updateResumeBanner(true);
        _reflectUploadedFilename(baseName, trigger);
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

/** Reflects the uploaded resume's filename onto the upload trigger button. */
function _reflectUploadedFilename(baseName, trigger = _el('uploadResumeBtn')) {
  if (!trigger || !baseName) return;
  trigger.classList.add('has-file');
  trigger.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    ${baseName}.docx`;
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

// ── Export Dock (download / preview) ──────────────────────────────────────────
function _initExportDock() {
  _wireExportCard('dragDocx', 'docx');
  _wireExportCard('dragPdf', 'pdf');
}

function _wireExportCard(elId, kind) {
  const card = _el(elId);
  if (!card) return;

  const activate = () => {
    const item = exportBlobs?.[kind];
    if (!item) return;
    triggerDownload(item.blob, item.filename);
    _showToast(`${kind.toUpperCase()} download started`, 'success');
  };

  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });
}

/**
 * Builds fresh DOCX + PDF blobs for the given payload and wires them into
 * the export dock (download, preview). Revokes any previously built blobs
 * first.
 */
async function _prepareExports(payload) {
  _showExportDock('loading');
  try {
    const filenameBase = outputFilename || resumeFilename;
    const blobs = await buildExportBlobs(payload, filenameBase);
    revokeExportBlobs(exportBlobs);
    exportBlobs = blobs;

    _el('docxFilenameLabel').textContent = blobs.docx.filename;
    _el('pdfFilenameLabel').textContent  = blobs.pdf.filename;
    _el('dragDocx').removeAttribute('aria-disabled');
    _el('dragPdf').removeAttribute('aria-disabled');
    _el('previewBtn').disabled = false;
    _el('previewBtn').removeAttribute('aria-disabled');

    _showExportDock('ready');
  } catch (err) {
    _showExportDock('hidden');
    _showToast(`Could not prepare export files: ${err.message}`, 'error');
  }
}

function _showExportDock(state) {
  const dock = _el('exportDock');
  dock.classList.remove('is-hidden', 'is-loading', 'is-ready');
  if (state === 'hidden') { dock.classList.add('is-hidden'); return; }
  dock.classList.add(state === 'loading' ? 'is-loading' : 'is-ready');
}

function _resetExportDock() {
  revokeExportBlobs(exportBlobs);
  exportBlobs = null;
  for (const id of ['dragDocx', 'dragPdf']) {
    _el(id).setAttribute('aria-disabled', 'true');
  }
  const previewBtn = _el('previewBtn');
  previewBtn.disabled = true;
  previewBtn.setAttribute('aria-disabled', 'true');
  _showExportDock('hidden');
}

// ── Preview Modal ─────────────────────────────────────────────────────────────
function _initPreviewModal() {
  const openBtn = _el('previewBtn');
  const closeBtn = _el('previewClose');
  const scrim = _el('previewScrim');

  openBtn.addEventListener('click', _openPreview);
  closeBtn.addEventListener('click', _closePreview);
  scrim.addEventListener('click', _closePreview);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _el('previewModal').classList.contains('is-open')) _closePreview();
  });
}

function _openPreview() {
  // PDF is the one format every browser can render natively in an iframe,
  // so it doubles as the visual preview for both export formats — the
  // DOCX carries identical content, just OOXML instead of PDF paint ops.
  const item = exportBlobs?.pdf;
  if (!item) return;
  const frame = _el('previewFrame');
  frame.src = item.url;
  _el('previewModal').classList.add('is-open');
  _el('previewScrim').classList.add('is-open');
  _el('previewModal').removeAttribute('aria-hidden');
}

function _closePreview() {
  _el('previewModal').classList.remove('is-open');
  _el('previewScrim').classList.remove('is-open');
  _el('previewModal').setAttribute('aria-hidden', 'true');
  // Drop the src so the embedded PDF viewer fully unloads.
  _el('previewFrame').src = 'about:blank';
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
      _prepareExports(res.data); // fire-and-forget: dock shows its own loading state
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
    empty.innerHTML = `
      <div class="empty-state-icon">🎯</div>
      <p>You're already well-matched!</p>
      <span>No modifications needed — your resume covers the target stack for this role.</span>`;
    container.appendChild(empty);
  }

  // Export dock (download/preview) is populated separately by
  // _prepareExports() once blobs are built — see _runAnalysis().
}

function _buildSummaryBlock(payload) {
  const block = document.createElement('div');
  block.className = 'summary-block';

  // ── Score hero row ──────────────────────────────────────────
  const scoreHero = document.createElement('div');
  scoreHero.className = 'score-hero';

  const rawScore   = payload.estimatedTargetMatchScore || '0%';
  const pctNum     = parseInt(rawScore, 10) || 0;
  // Ring geometry: r=34, circumference ≈ 213.6
  const CIRC       = 213.6;
  const offset     = CIRC - (pctNum / 100) * CIRC;

  const ringWrap   = document.createElement('div');
  ringWrap.className = 'score-ring-wrap';
  ringWrap.innerHTML = `
    <svg class="score-ring" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle class="score-ring-track" cx="40" cy="40" r="34"/>
      <circle class="score-ring-fill" cx="40" cy="40" r="34"
              stroke-dasharray="${CIRC}"
              stroke-dashoffset="${CIRC}"
              data-offset="${offset}"/>
    </svg>
    <div class="score-label">
      <span class="score-number">${pctNum}</span>
      <span class="score-pct">%</span>
    </div>`;
  scoreHero.appendChild(ringWrap);

  const scoreMeta = document.createElement('div');
  scoreMeta.className = 'score-meta';
  const scoreTitle = document.createElement('div');
  scoreTitle.className = 'score-title';
  scoreTitle.textContent = 'ATS Match Score';
  const scoreDesc = document.createElement('div');
  scoreDesc.className = 'score-desc';
  scoreDesc.textContent = pctNum >= 85
    ? 'Excellent match — strong alignment with this role.'
    : pctNum >= 75
      ? 'Good match — a few tweaks will push you over the top.'
      : 'Moderate match — apply the suggestions below for best results.';
  scoreMeta.appendChild(scoreTitle);
  scoreMeta.appendChild(scoreDesc);
  scoreHero.appendChild(scoreMeta);
  block.appendChild(scoreHero);

  // Animate the ring after a short delay
  requestAnimationFrame(() => {
    setTimeout(() => {
      const arc = ringWrap.querySelector('.score-ring-fill');
      if (arc) arc.style.strokeDashoffset = arc.dataset.offset;
    }, 120);
  });

  // ── Keywords + notes body ───────────────────────────────────
  const body = document.createElement('div');
  body.className = 'summary-body';

  if ((payload.extractedPrimaryKeywords || []).length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'kw-section-label';
    lbl.textContent = 'Primary Keywords';
    body.appendChild(lbl);
    const chips = document.createElement('div');
    chips.className = 'kw-chips';
    for (const kw of payload.extractedPrimaryKeywords) {
      const chip = document.createElement('span');
      chip.className = 'kw-chip';
      chip.textContent = kw;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  if (payload.optimizerNotes) {
    const notes = document.createElement('p');
    notes.className = 'summary-notes';
    notes.textContent = payload.optimizerNotes;
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
    [ERROR_TYPES.NO_API_KEY]:    'Open Settings (\u2699) and save your Gemini API key.',
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
  _resetExportDock();
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