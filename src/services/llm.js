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
  summary: "AI and machine learning engineer with professional experience in deep learning, computer vision, LLM training and data science. Showcased competence in deep learning frameworks, high performance computing and producing production-ready AI systems.",
  skills: {
    programmingLanguages: "Python, C++, C, SQL",
    mlDeepLearning:       "PyTorch, TensorFlow, TensorFlow Lite, Scikit-Learn, XGBoost, Computer Vision (YOLOv11), CNN/RNN Architectures, Model Fine-Tuning, Feature Engineering, Hyperparameter Tuning, AutoML",
    nlpLLMs:              "Large Language Models (LLMs), NLP, Prompt Engineering, Model Fine-Tuning, Distributed Training",
    dataScienceAnalytics: "Pandas, NumPy, Data Analysis, Data Cleaning, Power BI, Statistical Modeling",
    mlopsCloud:           "Docker, Git, AWS, Vercel, REST APIs, Model Deployment, CI/CD"
  },
  experienceBullets: {
    vt: [
      "Improved the large language training flow for the 35+ node computational cluster leading to a 40% decrease in the overall time.",
      "Worked with the 80+ team to improve scalability, efficiency and system performance.",
      "Implemented improvements in the AI infrastructure to improve the fine-tuning process for large language models and ensure scalability."
    ],
    iti: [
      "Built a cardiovascular risk prediction model achieving 92% accuracy by engineering and optimizing features from over 8,000 patient records, including data cleaning, transformation, and selection to enhance predictive performance.",
      "Evaluated multiple ensemble techniques from support vector machines to random forests and XGBoost in addition to the complete model development lifecycle pipeline starting from data preprocessing and feature engineering through training, validation, and the final deployment."
    ],
    te: [
      "Optimized customer churn predictions models to the 92% classification accuracy that led to an estimated decrease of 6-10% in the customer churn risk.",
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
1. Target {{MATCH_LOWER}}–{{MATCH_UPPER}}% exact keyword match (no paraphrasing for keywords, I want exact matching, if a keyword is not in the resume, like a technology stack, etc look for where it is closest to be mentioned and mention it, it probably was used anyway in real life, but don't change the bio data, the company names, etc). Do not over-optimize or under-optimize, the keywords are any word of technical or strategic or technological meaning no matter how small it is except the obvious (stop words, names, dates, etc).
2. Never copy JD phrases verbatim. Paraphrase context while keeping exact tech nouns except for the keywords where you have to make sure that the exact required match percentages are met for exact match.
3. MANDATORY: at least 20–30% of the 15 total bullets (3 vt + 2 iti + 2 te + 1 autocare + 1 autism + 1 listify + 1 verbatim + 1 profanity + 1 vamimi + 2 asl) must be returned byte-for-byte IDENTICAL to their input value — no rewording, no added clauses, nothing. This is a hard minimum, not a target to approach: with 15 bullets, that means at least 3 must be untouched. Before returning your output, count how many bullets you left unchanged; if fewer than 3, revert your least keyword-critical edits back to the original text until the minimum is met.
4. Forbidden words — these must NEVER appear anywhere in your output, including inside gerund clauses or in service of keyword-matching: spearheaded, streamlined, leveraged, robust, dynamic, seamless, synergized, revolutionized, utilized, cutting-edge, transformative, impactful, orchestrate, harness, empower. Before returning your output, scan every field for these words; if any appear, rewrite that instance.
5. Preferred verbs: Refactored, Implemented, Deployed, Benchmarked, Integrated, Configured, Profiled, Abstracted, Decoupled, Audited, Scaffolded, Instrumented, Maintained, Migrated, Patched.
6. No first-person pronouns (I, me, my, we, our).
7. The summary must open with the exact JD job title as its first characters, verbatim including punctuation/hyphenation as written in the JD (e.g. if the JD says "AI-Engineer", the summary starts with "AI-Engineer", not "AI Engineer"). If the JD gives no single clean title, use the closest explicit title mentioned in the JD's first paragraph.
8. ANTI-STUFFING RULE: do not append a trailing clause to a bullet or the summary solely to inject a keyword (e.g. do not end a sentence with "...demonstrating X", "...showcasing Y", "...addressing Z", "...contributing to W" where X/Y/Z/W is a keyword bolted on after the sentence's real content already ended). If a keyword doesn't fit naturally into the grammar and substance of an existing sentence, either work it in by genuinely rewriting the sentence's content around it, or leave it out of that bullet and place it elsewhere (e.g. skills). A bullet edited only to graft a keyword-bearing clause onto its end is worse than leaving it unedited — prefer leaving it unedited in that case.

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
  const modelConfig    = GROQ_MODELS.find(m => m.value === model);
  const maxTokens      = modelConfig?.maxTokens      ?? DEFAULTS.MAX_TOKENS;
  const jdLimit        = modelConfig?.jdLimit        ?? 8000;
  const thinkingBudget = modelConfig?.thinkingBudget ?? DEFAULTS.THINKING_BUDGET;

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
        thinkingConfig:   { thinkingBudget }, // 2.5-series models draw "thinking" tokens
                                               // from maxOutputTokens; without this, thinking
                                               // was eating the budget meant for the JSON output.
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
  const candidate   = data?.candidates?.[0];
  const raw         = candidate?.content?.parts?.[0]?.text;
  const finishReason = candidate?.finishReason;

  // Distinguish "the model got cut off" (finishReason: MAX_TOKENS) from a
  // genuinely malformed response. The old code lumped both into
  // PARSE_FAILURE and blamed a "transient" glitch, which was misleading —
  // MAX_TOKENS truncation is deterministic given the current token budget
  // and prompt size, not a one-off fluke.
  if (finishReason === 'MAX_TOKENS') {
    throw { error: ERROR_TYPES.TRUNCATED, raw: raw || JSON.stringify(data) };
  }

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