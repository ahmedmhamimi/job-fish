/**
 * Domain logic layer for Job Fish.
 * Manages the sidebar's in-memory optimization state and provides
 * input validation and diff application with cascading exact/fuzzy matching.
 *
 * - Engine: class holding current optimization payload state.
 *   - .validate(resume: string, jobDesc: string) -> {valid: boolean, error: string|null}.
 *   - .setState(payload: object) -> void: stores the current optimization JSON.
 *   - .getState() -> object | null: returns the stored optimization JSON.
 *   - .clearState() -> void: resets state to null.
 *   - .applyDiff(baseResume: string, payload: object) -> string: applies all diff substitutions.
 * - fuzzyApplyLine(text: string, originalLine: string, optimizedLine: string) -> string:
 *     replaces a line in text using exact → trim-exact → Jaccard-fuzzy cascade.
 */

import { DEFAULTS, ERROR_TYPES } from '../shared/constants.js';
import { fuzzyLineMatch } from '../shared/utils.js';

export class Engine {
  #state = null;

  /**
   * Validates that both the base resume and job description contain meaningful content.
   * @param {string} resume
   * @param {string} jobDesc
   * @returns {{ valid: boolean, error: string|null }}
   */
  validate(resume, jobDesc) {
    if (!resume || resume.trim().length < 50) {
      return { valid: false, error: ERROR_TYPES.NO_RESUME };
    }
    if (!jobDesc || jobDesc.trim().length < 20) {
      return { valid: false, error: ERROR_TYPES.VALIDATION };
    }
    return { valid: true, error: null };
  }

  setState(payload) {
    if (!payload || typeof payload !== 'object') return;
    this.#state = payload;
  }

  getState() {
    return this.#state;
  }

  clearState() {
    this.#state = null;
  }

  /**
   * Applies modifiedBulletPoints and skillsSectionAdditions from the payload
   * onto the base resume plain text.
   * @param {string} baseResume
   * @param {object} payload
   * @returns {string}
   */
  applyDiff(baseResume, payload) {
    if (!baseResume || !payload) return baseResume;
    let result = baseResume;

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
}

/**
 * Applies a single line substitution using a three-pass cascade:
 *   Pass 1: Exact substring match.
 *   Pass 2: Per-line trimmed exact match.
 *   Pass 3: Jaccard-similarity fuzzy match (threshold 0.45).
 * Returns unchanged text if no match is found.
 *
 * @param {string} text         - Full resume plain text.
 * @param {string} originalLine - The line to find and replace.
 * @param {string} optimizedLine - The replacement line.
 * @returns {string}
 */
export function fuzzyApplyLine(text, originalLine, optimizedLine) {
  if (!text || !originalLine || !optimizedLine) return text;

  // Pass 1: exact substring match
  if (text.includes(originalLine)) {
    return text.replace(originalLine, optimizedLine);
  }

  const lines = text.split('\n');

  // Pass 2: trimmed exact match (handles leading/trailing whitespace differences)
  const trimmedTarget = originalLine.trim();
  const exactTrimIdx = lines.findIndex(l => l.trim() === trimmedTarget);
  if (exactTrimIdx !== -1) {
    // Preserve leading whitespace of the original line
    const leadingWS = lines[exactTrimIdx].match(/^(\s*)/)?.[1] || '';
    lines[exactTrimIdx] = leadingWS + optimizedLine.trim();
    return lines.join('\n');
  }

  // Pass 3: fuzzy Jaccard similarity
  const bestMatch = fuzzyLineMatch(lines, originalLine);
  if (bestMatch !== null) {
    const idx = lines.indexOf(bestMatch);
    if (idx !== -1) {
      const leadingWS = lines[idx].match(/^(\s*)/)?.[1] || '';
      lines[idx] = leadingWS + optimizedLine.trim();
      return lines.join('\n');
    }
  }

  // No match found — return text unchanged
  return text;
}
