/**
 * Export orchestrator for Job Fish. Thin wrapper around the resume template generators.
 * Builds the final resume data object and produces DOCX/PDF blobs for download
 * and in-panel preview — all sharing one filename derived from the originally
 * uploaded resume file.
 *
 * - buildExportBlobs(llmOutput, filenameBase) -> Promise<{docx, pdf}>: builds both
 *   blobs once, with object URLs and a resolved filename per format, reused
 *   for downloading and previewing.
 * - triggerDownload(blob: Blob, filename: string, folder?: string) -> Promise<void>: saves a
 *   blob via chrome.downloads, optionally into a subfolder under the browser's
 *   default Downloads directory. Falls back to a plain anchor-click download
 *   (always lands in the default Downloads location, ignoring `folder`) if
 *   the downloads API is unavailable or rejects the call.
 * - revokeExportBlobs(blobs: object) -> void: releases object URLs when no longer needed.
 * - downloadDocx(llmOutput, filenameBase?) -> Promise<void>: legacy one-shot helper.
 * - downloadPdf(llmOutput, filenameBase?) -> Promise<void>: legacy one-shot helper.
 */

import { buildResumeData, generateDocxBlob, generatePdfBlob } from '../template/resume-data.js';
import { buildTimestamp } from '../shared/utils.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME  = 'application/pdf';

/**
 * Builds both DOCX and PDF blobs for the given LLM output, named to match
 * `filenameBase` (the original uploaded resume's filename, sans extension).
 * Falls back to a timestamped name if no base was ever captured (e.g. the
 * user pasted resume text instead of uploading a file).
 */
export async function buildExportBlobs(llmOutput, filenameBase) {
  const resumeData = buildResumeData(llmOutput);
  const base = _sanitizeBase(filenameBase);

  const [docxBlob, pdfBlob] = await Promise.all([
    generateDocxBlob(resumeData),
    Promise.resolve(generatePdfBlob(resumeData)),
  ]);

  const docx = { blob: docxBlob, mime: DOCX_MIME, filename: `${base}.docx` };
  const pdf  = { blob: pdfBlob,  mime: PDF_MIME,  filename: `${base}.pdf`  };

  docx.url = URL.createObjectURL(docx.blob);
  pdf.url  = URL.createObjectURL(pdf.blob);

  return { docx, pdf };
}

/** Revokes the object URLs on a previously built export set. */
export function revokeExportBlobs(blobs) {
  if (!blobs) return;
  for (const item of [blobs.docx, blobs.pdf]) {
    if (item?.url) {
      try { URL.revokeObjectURL(item.url); } catch (_) { /* already revoked */ }
    }
  }
}

/**
 * Saves a blob to disk, optionally into `folder` (a subfolder path relative
 * to the browser's default Downloads directory — e.g. "JobFish/Resumes").
 * Chrome's downloads API cannot write outside that directory; there is no
 * way for an extension to target an arbitrary absolute path on the user's
 * filesystem. `folder` may be empty/undefined, in which case the file lands
 * directly in Downloads, same as before.
 */
export async function triggerDownload(blob, filename, folder) {
  const url = URL.createObjectURL(blob);
  const revoke = () => { try { URL.revokeObjectURL(url); } catch (_) { /* already revoked */ } };

  const safeFolder = _sanitizeFolderPath(folder);
  const path = safeFolder ? `${safeFolder}/${filename}` : filename;

  if (chrome?.downloads?.download) {
    try {
      const downloadId = await chrome.downloads.download({
        url,
        filename: path,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      // Chrome reads the blob asynchronously after download() resolves, so
      // wait for it to finish (or fail) before revoking the object URL.
      const onChanged = delta => {
        if (delta.id !== downloadId) return;
        if (delta.state && ['complete', 'interrupted'].includes(delta.state.current)) {
          chrome.downloads.onChanged.removeListener(onChanged);
          revoke();
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
      setTimeout(() => { // safety net if onChanged never fires
        chrome.downloads.onChanged.removeListener(onChanged);
        revoke();
      }, 60000);
      return;
    } catch (_) {
      // Falls through to the anchor method below — e.g. the "downloads"
      // permission is missing, or Chrome rejected the resolved path.
    }
  }

  // Fallback: plain anchor download. Always lands in the default Downloads
  // location; the folder setting has no effect on this path.
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(revoke, 300);
}

/**
 * Cleans a user-supplied subfolder path down to safe path segments: no
 * absolute-path leading slash, no ".." traversal, no filesystem-illegal
 * characters, and backslashes normalized to forward slashes.
 */
function _sanitizeFolderPath(folder) {
  if (!folder || typeof folder !== 'string') return '';
  return folder
    .replace(/\\/g, '/')
    .split('/')
    .map(seg => seg.trim().replace(/[\\/:*?"<>|]+/g, ''))
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/');
}

// ── Legacy one-shot helpers (kept for callers that don't need preview) ──────
export async function downloadDocx(llmOutput, filenameBase, folder) {
  const resumeData = buildResumeData(llmOutput);
  const blob       = await generateDocxBlob(resumeData);
  await triggerDownload(blob, `${_sanitizeBase(filenameBase)}.docx`, folder);
}

export async function downloadPdf(llmOutput, filenameBase, folder) {
  const resumeData = buildResumeData(llmOutput);
  const blob       = generatePdfBlob(resumeData);
  await triggerDownload(blob, `${_sanitizeBase(filenameBase)}.pdf`, folder);
}

// ── Filename resolution ──────────────────────────────────────────────────
/**
 * Turns the original uploaded filename into a safe base name (no extension,
 * no path separators or characters illegal on Windows/macOS filesystems).
 * Falls back to a timestamped default when no base is available.
 */
function _sanitizeBase(filenameBase) {
  if (filenameBase && typeof filenameBase === 'string' && filenameBase.trim()) {
    const cleaned = filenameBase
      .trim()
      .replace(/\.[^./\\]+$/, '')        // drop trailing extension, if any
      .replace(/[\\/:*?"<>|]+/g, '')     // strip filesystem-illegal characters
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '')             // no trailing dot/space (Windows)
      .trim();
    if (cleaned) return cleaned;
  }
  return `resume_optimized_${buildTimestamp()}`;
}