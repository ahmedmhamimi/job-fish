/**
 * Export orchestrator for Job Fish. Thin wrapper around the resume template generators.
 * Builds the final resume data object and triggers browser downloads for DOCX and PDF.
 *
 * - downloadDocx(llmOutput: object) -> Promise<void>: builds and downloads optimized .docx
 * - downloadPdf(llmOutput: object) -> void: builds and downloads optimized .pdf
 * - _trigger(blob: Blob, filename: string) -> void: Blob-URL download helper
 */

import { buildResumeData, generateDocxBlob, generatePdfBlob } from '../template/resume-data.js';
import { buildTimestamp } from '../shared/utils.js';

export async function downloadDocx(llmOutput) {
  const resumeData = buildResumeData(llmOutput);
  const blob       = await generateDocxBlob(resumeData);
  _trigger(blob, `resume_optimized_${buildTimestamp()}.docx`);
}

export function downloadPdf(llmOutput) {
  const resumeData = buildResumeData(llmOutput);
  const blob       = generatePdfBlob(resumeData);
  _trigger(blob, `resume_optimized_${buildTimestamp()}.pdf`);
}

function _trigger(blob, filename) {
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
