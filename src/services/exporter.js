/**
 * ATS resume exporter for Job Fish. Runs in the sidebar (browser) context only.
 * Reconstructs the user's base resume with optimized text substitutions applied,
 * enforces ATS structural conventions at the text level, and triggers a .txt download.
 *
 * - exportResume(baseResume: string, payload: object, acceptReorder?: boolean) -> void:
 *     top-level export entry point; applies diffs, cleans structure, triggers download.
 * - _applyAllDiffs(text: string, payload: object) -> string:
 *     iterates modifiedBulletPoints and skillsSectionAdditions, applies each via fuzzyApplyLine.
 * - _normalizeATSHeaders(text: string) -> string:
 *     rewrites common section header variants to ALL CAPS ATS-compliant labels.
 * - _normalizeATSBullets(text: string) -> string:
 *     delegates Unicode bullet replacement to replaceBulletChars util.
 * - _applyReorder(text: string, reorderPayload: object) -> string:
 *     splits resume into named section blocks and reassembles in recommendedOrder.
 * - _downloadTxt(content: string, filename: string) -> void:
 *     creates a Blob URL and triggers browser download; revokes URL after click.
 */

import { ATS_HEADERS } from '../shared/constants.js';
import { fuzzyApplyLine } from '../core/engine.js';
import { replaceBulletChars, removeTrailingWhitespace, buildTimestamp } from '../shared/utils.js';

/**
 * Main export function. Applies all diffs, runs ATS text-level cleanup,
 * optionally applies section reorder, and downloads as .txt.
 *
 * @param {string}  baseResume    - Original master resume plain text.
 * @param {object}  payload       - Parsed optimization JSON from LLM.
 * @param {boolean} acceptReorder - If true and reorder is suggested, applies it.
 */
export function exportResume(baseResume, payload, acceptReorder = false) {
  if (!baseResume || !payload) {
    console.error('[Job Fish] exportResume: missing baseResume or payload');
    return;
  }

  let text = baseResume;
  text = _applyAllDiffs(text, payload);
  text = _normalizeATSHeaders(text);
  text = _normalizeATSBullets(text);
  text = removeTrailingWhitespace(text);

  if (acceptReorder && payload.sectionReorderSuggestion?.suggested) {
    text = _applyReorder(text, payload.sectionReorderSuggestion);
  }

  const filename = `resume_optimized_${buildTimestamp()}.txt`;
  _downloadTxt(text, filename);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _applyAllDiffs(text, payload) {
  let result = text;

  for (const item of payload.modifiedBulletPoints || []) {
    if (!item.originalLine || !item.optimizedLine) continue;
    result = fuzzyApplyLine(result, item.originalLine, item.optimizedLine);
  }

  for (const item of payload.skillsSectionAdditions || []) {
    if (!item.existingSkillLine || !item.suggestedSkillLine) continue;
    result = fuzzyApplyLine(result, item.existingSkillLine, item.suggestedSkillLine);
  }

  return result;
}

function _normalizeATSHeaders(text) {
  // Pairs of [test regex, canonical ATS label].
  // Only rewrite a line if it is essentially just the header (< 60 chars, no
  // sentence structure), avoiding false positives on normal content lines.
  const HEADER_RULES = [
    [/^(professional\s+summary|summary|objective)\s*:?$/i,        ATS_HEADERS.summary],
    [/^(work\s+experience|experience|employment\s+history)\s*:?$/i, ATS_HEADERS.experience],
    [/^(technical\s+skills?|skills?\s*(?:&\s*tools?)?|core\s+skills?)\s*:?$/i, ATS_HEADERS.skills],
    [/^(projects?|selected\s+projects?|personal\s+projects?)\s*:?$/i, ATS_HEADERS.projects],
    [/^(education|academic\s+background)\s*:?$/i,                  ATS_HEADERS.education],
    [/^(certifications?|licenses?\s*(?:&\s*certifications?)?)\s*:?$/i, ATS_HEADERS.certifications],
    [/^(awards?\s*(?:&\s*recognition)?|honors?|achievements?)\s*:?$/i, ATS_HEADERS.awards],
  ];

  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 60) return line;
    for (const [regex, canonical] of HEADER_RULES) {
      if (regex.test(trimmed)) return canonical;
    }
    return line;
  }).join('\n');
}

function _normalizeATSBullets(text) {
  return replaceBulletChars(text);
}

/**
 * Splits the resume into named section blocks (identified by ATS_HEADERS values),
 * then reassembles them in the order given by recommendedOrder.
 * Any sections not present in recommendedOrder are appended at the end.
 *
 * @param {string} text
 * @param {{ currentOrder: string[], recommendedOrder: string[], reason: string }} reorderPayload
 * @returns {string}
 */
function _applyReorder(text, reorderPayload) {
  const { recommendedOrder } = reorderPayload;
  if (!Array.isArray(recommendedOrder) || recommendedOrder.length === 0) return text;

  const canonicalHeaders = new Set(Object.values(ATS_HEADERS));
  const lines = text.split('\n');

  // Build an ordered list of { header: string|null, lines: string[] } blocks.
  const blocks = [];
  let current = { header: null, lines: [] };

  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (canonicalHeaders.has(trimmed)) {
      // Flush existing block
      if (current.lines.length > 0 || current.header !== null) {
        blocks.push({ ...current });
      }
      current = { header: trimmed, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.header !== null) {
    blocks.push(current);
  }

  // Separate the contact/preamble block (no header) from named sections.
  const preamble = blocks.filter(b => b.header === null);
  const named    = blocks.filter(b => b.header !== null);

  // Map canonical header → block for lookup.
  const headerToBlock = new Map();
  for (const block of named) {
    headerToBlock.set(block.header, block);
  }

  const reordered = [];

  // Preamble first (contact info, name).
  for (const b of preamble) reordered.push(b.lines.join('\n'));

  // Then sections in recommended order.
  for (const sectionName of recommendedOrder) {
    const upper = sectionName.toUpperCase();
    // Try exact match first, then partial match.
    let block = headerToBlock.get(upper);
    if (!block) {
      for (const [key, val] of headerToBlock) {
        if (key.includes(upper) || upper.includes(key)) {
          block = val;
          break;
        }
      }
    }
    if (block) {
      reordered.push(block.lines.join('\n'));
      headerToBlock.delete(block.header);
    }
  }

  // Append any leftover sections not covered by recommendedOrder.
  for (const block of headerToBlock.values()) {
    reordered.push(block.lines.join('\n'));
  }

  return reordered.join('\n\n').replace(/\n{3,}/g, '\n\n');
}

function _downloadTxt(content, filename) {
  const blob   = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after a tick to ensure the download begins.
  setTimeout(() => URL.revokeObjectURL(url), 200);
}
