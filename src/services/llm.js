/**
 * Google Gemini API client for Job Fish. Runs EXCLUSIVELY in the background service worker.
 * Uses a structured-output system prompt: instead of returning a text diff,
 * the model returns a complete JSON object of all mutable resume fields with
 * optimizations applied directly. The template layer handles DOCX/PDF generation.
 *
 * Gemini-specific notes:
 * - Auth: API key passed as query param (?key=...), not a Bearer header.
 * - responseMimeType: 'application/json' forces clean JSON output — no markdown fences.
 * - system_instruction is a top-level field, separate from contents[].
 * - Response text is at candidates[0].content.parts[0].text.
 *
 * - callLLM(jobDescription: string, matchTarget: number) -> object: full pipeline.
 * - _buildSystemPrompt(matchTarget: number) -> string: injects match range into template.
 * - _fetchWithTimeout(url: string, options: object, ms: number) -> Promise<Response>.
 */

import { DEFAULTS, GROQ_MODELS, STORAGE_KEYS, ERROR_TYPES } from '../shared/constants.js';
import { cleanJSON } from '../shared/utils.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ---------------------------------------------------------------------------
// Mutable defaults injected into the system prompt so the model knows
// exactly which fields it can edit and what their current values are.
// These mirror MUTABLE_DEFAULTS in template/resume-data.js but are embedded
// here as plain strings to avoid importing DOM-context modules into the SW.
// ---------------------------------------------------------------------------
const MUTABLE_DEFAULTS_JSON = JSON.stringify({
  summary: "AI Engineer and Machine Learning specialist with hands-on experience in deep learning, distributed LLM training, computer vision, and end-to-end application development. Demonstrated impact across HPC, healthcare analytics, and mobile AI deployment. Proficient in Python, TensorFlow, PyTorch, and cloud-ready MLOps workflows. Seeking a full-time role where I can build and ship production-grade AI systems.",
  skills: {
    programmingLanguages: "Python, C++, SQL, NoSQL",
    mlAI:                 "Deep Learning (CNN, RNN, Transformers), LLM Fine-Tuning, Distributed Training, Computer Vision (YOLO, OpenCV), Ensemble Methods",
    frameworksTools:      "TensorFlow, PyTorch, Scikit-Learn, TensorFlow Lite, Docker, Git",
    dataAnalytics:        "Feature Engineering, Statistical Modeling, Power BI, Pandas, NumPy",
    deploymentMobile:     "Flutter, AWS, Vercel, Google Play deployment"
  },
  experienceBullets: {
    vt: [
      "Optimized LLM training pipelines across 35+ distributed computing nodes, reducing end-to-end runtime by 40% through data, model, and pipeline parallelism.",
      "Collaborated within an 80 member research team to analyze and improve scalability of distributed computing algorithms for large language models.",
      "Designed and implemented scalable AI infrastructure for fine-tuning large language models in a high-performance computing environment."
    ],
    iti: [
      "Built a cardiovascular risk prediction model achieving 92% accuracy by engineering and optimizing features from over 8,000 patient records, including data cleaning, transformation, and selection to enhance predictive performance.",
      "Evaluated and deployed ensemble models (Random Forest, XGBoost, SVM), managing the complete model development lifecycle from data preprocessing and feature engineering through training, validation, and final deployment."
    ],
    te: [
      "Developed and optimized customer churn prediction models reaching 92% classification accuracy, contributing to an estimated 6\u201310% reduction in churn risk.",
      "Automated data cleaning and Power BI reporting pipelines, cutting manual reporting time by 50% in comparison to older methods."
    ]
  },
  projectBullets: {
    autocare:  ["Shipped a mobile app on Google Play that uses fine-tuned YOLOv11m to detect and annotate vehicle damage in real time."],
    autism:    ["Built an end-to-end mobile app achieving 95% behavioral recognition accuracy, integrating 12 evidence-based therapeutic tools, and optimized for diverse devices via TensorFlow Lite."],
    listify:   ["Built a production-ready SaaS app with AI-powered listing analysis, generating SEO-optimized titles, rewritten descriptions, and amenity recommendations; integrated credit-based monetization via Gumroad and Supabase Auth."],
    verbatim:  ["Live AI-vs-AI debate platform where two LLMs argue opposing sides of topics of the users choice in real time via SSE streaming; built with MVVM architecture and featuring a live audience voting system."],
    profanity: ["Production-ready REST API deployed on RapidAPI that detects profanity with evasion detection (l33t speak, dotted words), supports dynamic whitelisting/blacklisting, and delivers smart censoring."],
    vamimi:    ["Developed an open-source AutoML library supporting 12+ algorithms with automated model selection and hyperparameter tuning, reducing experimentation time by 20%."],
    asl: [
      "Benchmarked 8 deep learning architectures for dual-hand Arabic sign language recognition; annotated 1,300+ images; achieved 95%+ accuracy with fine-tuned VGG16 (paper submitted for review).",
      "Built hybrid CNN-RNN model reaching 99% accuracy across the full 28-letter Arabic alphabet (paper in preparation)."
    ]
  }
}, null, 2);

const SYSTEM_PROMPT_TEMPLATE = `# ROLE
You are a precise ATS Resume Optimizer. Your task: given a candidate's mutable resume fields and a target job description, return an updated version of those mutable fields — with keyword-matched modifications applied — calibrated for an ATS match score between {{MATCH_LOWER}}% and {{MATCH_UPPER}}%.

# CANDIDATE CONTEXT (IMMUTABLE — DO NOT INCLUDE IN OUTPUT)
Name: Ahmed Mohamed Hamimi
Roles: HPC & AI Research Intern at Virginia Tech (2025), ML Research Intern at ITI (2024), Data Analytics Intern at Telecom Egypt (2024)
Projects: AutoCare Pro (YOLOv11m), AI Autism Support App (TFLite), ListifyAI (FastAPI/Groq), Verbatim (AI debate), Profanity API (Flask), VamimiML (AutoML), Arabic Sign Language Research (VGG16/CNN/RNN)
Education: B.Sc. AI – Data Science, AASTMT, GPA 3.82, Class Rank 2nd
All company names, dates, GPA, URLs, certifications, awards, and project names are IMMUTABLE. Do not mention or change them.

# WHAT YOU MAY CHANGE (THE MUTABLE FIELDS BELOW)
Only modify the JSON fields listed under CURRENT MUTABLE FIELDS. Return ALL fields even if unchanged.

# RULES
1. Only substitute same-category technology terms (e.g. MySQL→PostgreSQL, Vue→React, Jenkins→GitHub Actions). Never add a technology with zero evidence in the resume.
2. Never invent or inflate metrics, percentages, team sizes, or durations.
3. Never copy JD phrases verbatim. Paraphrase context while keeping exact tech nouns.
4. Target {{MATCH_LOWER}}–{{MATCH_UPPER}}% keyword match. Do not over-optimize.
5. Leave 20–30% of eligible bullets untouched (human-signal patching).
6. Forbidden words: spearheaded, streamlined, leveraged, robust, dynamic, seamless, synergized, revolutionized, utilized, cutting-edge, transformative, impactful, orchestrate, harness, empower.
7. Preferred verbs: Refactored, Implemented, Deployed, Benchmarked, Integrated, Configured, Profiled, Abstracted, Decoupled, Audited, Scaffolded, Instrumented, Maintained, Migrated, Patched.
8. No first-person pronouns (I, me, my, we, our).
9. The "languagesSpoken" skill field is IMMUTABLE — do not include it in the output skills object.

# CURRENT MUTABLE FIELDS
${MUTABLE_DEFAULTS_JSON}

# MANDATORY OUTPUT FORMAT
Return exactly one raw JSON object — no markdown fences, no preamble, no commentary.
{
  "extractedPrimaryKeywords": ["keyword1", "keyword2", "keyword3"],
  "estimatedTargetMatchScore": "83%",
  "optimizerNotes": "Brief note on what was changed and why, or confirmation that no changes were needed.",
  "summary": "full updated summary string",
  "skills": {
    "programmingLanguages": "...",
    "mlAI": "...",
    "frameworksTools": "...",
    "dataAnalytics": "...",
    "deploymentMobile": "..."
  },
  "experienceBullets": {
    "vt":  ["bullet1", "bullet2", "bullet3"],
    "iti": ["bullet1", "bullet2"],
    "te":  ["bullet1", "bullet2"]
  },
  "projectBullets": {
    "autocare":  ["bullet"],
    "autism":    ["bullet"],
    "listify":   ["bullet"],
    "verbatim":  ["bullet"],
    "profanity": ["bullet"],
    "vamimi":    ["bullet"],
    "asl":       ["bullet1", "bullet2"]
  }
}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function callLLM(jobDescription, matchTarget) {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.GROQ_API_KEY,
    STORAGE_KEYS.BASE_RESUME,
    STORAGE_KEYS.API_ENDPOINT,
  ]);

  const apiKey  = stored[STORAGE_KEYS.GROQ_API_KEY];
  const model   = stored[STORAGE_KEYS.API_ENDPOINT] || DEFAULTS.MODEL;
  const context = stored[STORAGE_KEYS.BASE_RESUME] || '';

  if (!apiKey?.trim()) throw { error: ERROR_TYPES.NO_API_KEY };

  // Resolve per-model limits.
  const modelConfig = GROQ_MODELS.find(m => m.value === model);
  const maxTokens   = modelConfig?.maxTokens ?? DEFAULTS.MAX_TOKENS;
  const jdLimit     = modelConfig?.jdLimit   ?? 8000;

  const sysPrompt = _buildSystemPrompt(matchTarget);
  const userMsg   = [
    context ? `[UPLOADED RESUME CONTEXT (for background reference)]:\n${context.slice(0, 4000)}` : '',
    `[JOB DESCRIPTION]:\n${jobDescription.slice(0, jdLimit)}`,
    `[ATS TARGET SCORE]: ${matchTarget}`,
  ].filter(Boolean).join('\n\n---\n\n');

  // Gemini: API key is a query param, not a Bearer header.
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey.trim()}`;

  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sysPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: {
        temperature:      DEFAULTS.TEMPERATURE,
        maxOutputTokens:  maxTokens,
        responseMimeType: 'application/json', // forces clean JSON — no markdown fences
      },
    }),
  };

  let response;
  try {
    response = await _fetchWithTimeout(url, options, DEFAULTS.FETCH_TIMEOUT_MS);
  } catch (err) {
    if (err.name === 'AbortError') throw { error: ERROR_TYPES.FETCH_TIMEOUT };
    throw { error: ERROR_TYPES.API_ERROR, detail: String(err.message) };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw { error: ERROR_TYPES.API_ERROR, status: response.status, detail: body };
  }

  const data = await response.json();
  // Gemini response shape: candidates[0].content.parts[0].text
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw { error: ERROR_TYPES.PARSE_FAILURE, raw: JSON.stringify(data) };

  try {
    return cleanJSON(raw);
  } catch (_) {
    throw { error: ERROR_TYPES.PARSE_FAILURE, raw };
  }
}

function _buildSystemPrompt(matchTarget) {
  const lower = matchTarget - 3;
  const upper = matchTarget + 3;
  return SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{MATCH_LOWER\}\}/g, String(lower))
    .replace(/\{\{MATCH_UPPER\}\}/g, String(upper));
}

async function _fetchWithTimeout(url, options, ms) {
  const ctrl    = new AbortController();
  const timerId = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timerId);
  }
}
