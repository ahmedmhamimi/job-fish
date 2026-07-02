/**
 * Export orchestrator for Job Fish. Thin wrapper around the resume template generators.
 * Builds the final resume data object and produces DOCX/PDF blobs for download,
 * drag-out, and in-panel preview — all sharing one filename derived from the
 * originally uploaded resume file.
 *
 * - buildExportBlobs(llmOutput, filenameBase) -> Promise<{docx, pdf}>: builds both
 *   blobs once, with object URLs and a resolved filename per format. Because
 *   drag-and-drop's `dragstart` handler must call `setData` synchronously, the
 *   blobs/URLs are prepared ahead of time and reused for downloading, dragging,
 *   and previewing. Each item also carries a `dragUrl` (base64 data: URI) —
 *   Chrome's "DownloadURL" drag format silently fails to materialize a real
 *   file when given a blob: URL, so the object URL is used for downloads/
 *   previews while the data: URI is used specifically for drag-out.
 * - triggerDownload(blob: Blob, filename: string) -> void: Blob-URL download helper.
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

  // Used only for the DownloadURL drag format — see note above on why
  // blob: URLs don't work for that.
  const [docxDragUrl, pdfDragUrl] = await Promise.all([
    _blobToDataURL(docx.blob),
    _blobToDataURL(pdf.blob),
  ]);
  docx.dragUrl = docxDragUrl;
  pdf.dragUrl  = pdfDragUrl;

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

/** Triggers a browser download of a pre-built blob. */
export function triggerDownload(blob, filename) {
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

// ── Legacy one-shot helpers (kept for callers that don't need drag/preview) ──
export async function downloadDocx(llmOutput, filenameBase) {
  const resumeData = buildResumeData(llmOutput);
  const blob       = await generateDocxBlob(resumeData);
  triggerDownload(blob, `${_sanitizeBase(filenameBase)}.docx`);
}

export function downloadPdf(llmOutput, filenameBase) {
  const resumeData = buildResumeData(llmOutput);
  const blob       = generatePdfBlob(resumeData);
  triggerDownload(blob, `${_sanitizeBase(filenameBase)}.pdf`);
}

// ── Blob -> data: URI ─────────────────────────────────────────────────────
/**
 * Converts a Blob to a base64 "data:" URI. Required specifically for the
 * DataTransfer "DownloadURL" drag format: Chrome accepts a blob: URL there
 * without error, but silently fails to materialize a real file on drop —
 * both onto the desktop and onto another webpage's dropzone. A data: URI
 * works reliably in both cases.
 */
async function _blobToDataURL(blob) {
  const buf   = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary  = '';
  const CHUNK = 0x8000; // avoid call-stack blowups on large files
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
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