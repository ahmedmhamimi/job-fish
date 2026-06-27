# Job Fish 🎣

**AI-powered ATS resume optimizer as a Chrome Side Panel extension.**  
Surgically tailors your resume to any job description using LLaMA (via Groq), presenting changes as a git-diff view and exporting an ATS-clean `.txt` file.

---

## How It Works

1. You paste a job description into the panel.
2. Job Fish sends your **stored master resume** + the JD to LLaMA via Groq.
3. The model identifies the 3–5 primary tech-stack keywords missing from your resume and proposes **category-level substitutions only** (e.g. `MySQL → PostgreSQL`, never invented skills).
4. Changes appear as a **git-diff view** — red original / green optimized, with justification and a confidence badge per change.
5. Click **Download .txt** to get an ATS-clean plain-text resume with all accepted changes applied.

The target match score is set to **82% by default** (the strategic sweet spot: above ATS filter thresholds, below over-optimization detection). Adjustable from 70% to 95%.

---

## Installation

> Requires **Chrome 114+** (Chrome Side Panel API).

1. Download or clone this repository.
2. Open Chrome → navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle, top-right).
4. Click **Load unpacked**.
5. Select the **`src/`** folder inside this project — that is the extension root.
6. Click the Job Fish icon (🎣) in your Chrome toolbar to open the side panel.

---

## First-Time Setup

1. **Get a free Groq API key** at [console.groq.com](https://console.groq.com) — takes ~30 seconds.
2. Click the **⚙ gear icon** in Job Fish to open Settings.
3. Paste your API key → click **Save API Key**. The field clears after saving (the key is stored securely in `chrome.storage.local`, never in the UI layer).
4. Paste your **complete master resume** (plain text) in the **Master Base Resume** field → click **Save Resume**.
5. Optionally adjust the **ATS match target slider** (default 82%) and select a model.

---

## Usage

1. Navigate to any job listing in Chrome.
2. Open the side panel (click the toolbar icon, or via the Side Panel button in Chrome's address bar).
3. Paste the **full job description** into the text area.
4. Click **Analyze & Optimize** — analysis takes 10–25 seconds.
5. Review the diff cards:
   - 🔴 **Red line** = original text (strikethrough)
   - 🟢 **Green line** = optimized text
   - Click **Justification** to see the reasoning and confidence level
   - Review **Skills Suggestions** for additions to your skills section
6. If a **Section Reorder** suggestion appears, check the box to apply it to the exported file.
7. Click **Download .txt** to get `resume_optimized_[timestamp].txt`.

---

## What the Model Will and Won't Change

| ✅ Permitted | ❌ Strictly Forbidden |
|---|---|
| Swap same-category tools (MySQL → PostgreSQL) | Invent skills with no resume evidence |
| Add keywords to existing skill category lines | Inflate metrics, team sizes, or impact |
| Adjust bullet phrasing to incorporate target tech | Touch: name, contact info, URLs, company names, dates, GPA |
| Incorporate JD keywords into the summary line | Modify project names or their tech stack headers |

**The `originalLine` values in the JSON are copied verbatim** from your resume for exact-string diff application. The model is instructed to never paraphrase these.

---

## Architecture

```
src/                              ← Chrome extension root (load this)
├── manifest.json                 ← MV3 config: sidePanel, storage, groq host_permissions
│
├── background/
│   └── service-worker.js        ← Message router + LLM proxy (API key stays here)
│
├── sidebar/
│   ├── sidebar.html             ← Panel markup (zero inline styles)
│   ├── sidebar.css              ← All styles — dark GitHub dev aesthetic
│   └── sidebar.js               ← DOM logic, diff card rendering, export trigger
│
├── services/
│   ├── llm.js                   ← Groq API client (service-worker only)
│   └── exporter.js              ← ATS reconstructor + .txt download (sidebar only)
│
├── core/
│   └── engine.js                ← State, validation, fuzzy diff applicator
│
├── shared/
│   ├── constants.js             ← MSG types, storage keys, model list, error strings
│   └── utils.js                 ← cleanJSON, fuzzyLineMatch, replaceBulletChars, etc.
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Security Model

- The **raw API key never touches the sidebar**. It is sent once via `chrome.runtime.sendMessage` → stored in `chrome.storage.local` → read only by the service worker when making API calls.
- All external HTTP requests go through the **background service worker**, which holds the sole `host_permission` for `https://api.groq.com/*`. The sidebar has no network access.
- CORS is never an issue because `fetch` runs inside the service worker, not in the page context.

### Optimization History

The last 3 optimization results are cached in `chrome.storage.local` under the key `optimization_history`. Each entry includes a `_timestamp` field.

---

## Supported Models (Groq)

| Model | Best For |
|---|---|
| `llama3-70b-8192` | Best quality (default) |
| `llama-3.3-70b-versatile` | Strong quality, slightly faster |
| `llama3-8b-8192` | Fastest, good for simple resumes |
| `mixtral-8x7b-32768` | Long resumes (32K context) |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "No API key saved" | Open Settings ⚙, paste your Groq API key, click Save |
| "No base resume saved" | Open Settings ⚙, paste resume, click Save Resume |
| Request timed out | Check your connection; the 30s timeout is generous — retry |
| Parse failure | Transient model issue — retry; switch to a different model if persistent |
| Extension not appearing | Make sure you loaded the `src/` folder, not the repo root |
| Side panel not opening | Chrome 114+ required; check `chrome://extensions` for errors |

---

## Development Notes

- **No build step required.** All files are vanilla ES modules loaded natively by Chrome.
- **Manifest V3** — service worker, not a persistent background page.
- **No external CDN dependencies.** Zero `<script src="https://...">` tags anywhere.
- The `cleanJSON` utility in `utils.js` strips markdown fences before parsing, which guards against models wrapping their output in ` ```json ``` ` blocks.
- `fuzzyApplyLine` in `engine.js` uses a three-pass cascade: exact → trimmed-exact → Jaccard similarity. Threshold is 0.45 — conservative enough to avoid false positives on similar-looking bullets.

---

## License

MIT — use freely, contribute back.
