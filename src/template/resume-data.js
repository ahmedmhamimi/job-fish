/**
 * Hardcoded resume template for Ahmed Mohamed Hamimi.
 * Contains all immutable structural data, default mutable field values, and
 * generator functions for both DOCX (raw OOXML via JSZip) and PDF (via jsPDF).
 *
 * Exported constants & functions:
 * - IMMUTABLE: object of protected resume fields (name, contact, dates, URLs, etc.)
 * - MUTABLE_DEFAULTS: object of default swappable resume content (summary, skills, bullets)
 * - EXPERIENCE_LABELS: map of role_id -> "Title at Company" display string
 * - PROJECT_LABELS: map of project_id -> project name display string
 * - SKILL_LABELS: map of skill_key -> display label string
 * - buildResumeData(llmOutput: object) -> object: merges immutable + defaults + LLM changes
 * - generateDocxBlob(resumeData: object) -> Promise<Blob>: builds DOCX via JSZip + raw OOXML
 * - generatePdfBlob(resumeData: object) -> Blob: builds PDF via jsPDF
 */

// ─── Immutable Fields ────────────────────────────────────────────────────────
export const IMMUTABLE = Object.freeze({
  name:    'Ahmed Mohamed Hamimi',
  contact: Object.freeze({
    location:    'Alexandria, Egypt',
    phone:       '+20 101 370 6124',
    email:       'a.mhamimi@outlook.com',
    linkedinUrl: 'https://linkedin.com/in/ahmed-mohamed-hamimi',
    linkedinLabel: 'linkedin.com/in/ahmed-mohamed-hamimi',
    githubUrl:   'https://github.com/ahmedmhamimi',
    githubLabel: 'github.com/ahmedmhamimi',
  }),
  experience: Object.freeze([
    { id: 'vt',  title: 'HPC and AI Research Intern',       company: 'Virginia Polytechnic Institute and State University (Virginia Tech)', location: 'Remote, USA',      period: 'Jul 2025 \u2013 Sep 2025' },
    { id: 'iti', title: 'Machine Learning Research Intern',  company: 'Information Technology Institute (ITI)',                              location: 'Cairo, Egypt',     period: 'Aug 2024 \u2013 Sep 2024' },
    { id: 'te',  title: 'Data Analytics Intern',             company: 'Telecom Egypt',                                                       location: 'Alexandria, Egypt', period: 'Jul 2024 \u2013 Aug 2024' },
  ]),
  projects: Object.freeze([
    { id: 'autocare',  name: 'AutoCare Pro \u2013 Vehicle Damage Detection App',   techStack: 'YOLOv11m, Flutter, Google Play',                               urlLabel: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.ahamimi.car_maintainda' },
    { id: 'autism',    name: 'AI Autism Support Application',                       techStack: 'TensorFlow Lite, Flutter',                                     urlLabel: null, url: null },
    { id: 'listify',   name: 'ListifyAI \u2013 AI-Powered Etsy Listing Optimizer', techStack: 'FastAPI, Groq (Llama 3.3 70B), Supabase, Vercel',              urlLabel: 'GitHub', url: 'https://github.com/ahmedmhamimi/OccupancyOS' },
    { id: 'verbatim',  name: 'Verbatim \u2013 AI Debate Arena',                    techStack: 'FastAPI, Groq, Vanilla JS',                                    urlLabel: 'GitHub', url: 'https://github.com/ahmedmhamimi/verbatim' },
    { id: 'profanity', name: 'Advanced Profanity Filter & Censor API',             techStack: 'Python, Flask',                                                urlLabel: 'RapidAPI', url: 'https://rapidapi.com/ahmedmhamimi/api/advanced-profanity-filter' },
    { id: 'vamimi',    name: 'VamimiML \u2013 Automated Machine Learning Library', techStack: 'Python, Scikit-Learn',                                         urlLabel: null, url: null },
    { id: 'asl',       name: 'Arabic Sign Language Recognition Research',           techStack: 'VGG16, CNN, RNN',                                              urlLabel: null, url: null },
  ]),
  education: Object.freeze({
    degree:      'B.Sc. in Artificial Intelligence \u2013 Data Science Major',
    institution: 'Arab Academy for Science, Technology and Maritime Transport',
    location:    'New Alamein, Egypt',
    period:      'Sep 2022 \u2013 Jul 2026',
    gpa:         '3.82 / 4.0',
    rank:        '2nd',
    scholarship: 'Full Merit Scholarship',
  }),
  certifications: Object.freeze([
    'IBM Machine Learning Professional Certificate',
    'IBM AI Enterprise Workflow Specialization',
    'Google Data Analytics Professional Certificate (L1 & L2)',
  ]),
  awards: Object.freeze([
    'Invited International Speaker \u2013 Knowledge Summit 2024, Dubai, UAE',
    '1st Place \u2013 Code Challenge Championship, Cairo, Egypt',
    'Top 5% Finalist \u2013 AASTMT Rally Entrepreneurship Competition',
  ]),
});

// ─── Mutable Defaults ────────────────────────────────────────────────────────
export const MUTABLE_DEFAULTS = Object.freeze({
  summary: 'AI Engineer and Machine Learning specialist with hands-on experience in deep learning, distributed LLM training, computer vision, and end-to-end application development. Demonstrated impact across HPC, healthcare analytics, and mobile AI deployment. Proficient in Python, TensorFlow, PyTorch, and cloud-ready MLOps workflows. Seeking a full-time role where I can build and ship production-grade AI systems.',
  skills: Object.freeze({
    programmingLanguages: 'Python, C++, SQL, NoSQL',
    mlAI:                 'Deep Learning (CNN, RNN, Transformers), LLM Fine-Tuning, Distributed Training, Computer Vision (YOLO, OpenCV), Ensemble Methods',
    frameworksTools:      'TensorFlow, PyTorch, Scikit-Learn, TensorFlow Lite, Docker, Git',
    dataAnalytics:        'Feature Engineering, Statistical Modeling, Power BI, Pandas, NumPy',
    deploymentMobile:     'Flutter, AWS, Vercel, Google Play deployment',
    languagesSpoken:      'Arabic (native), English \u2013 TOEFL iBT 104/120',
  }),
  experienceBullets: Object.freeze({
    vt: Object.freeze([
      'Optimized LLM training pipelines across 35+ distributed computing nodes, reducing end-to-end runtime by 40% through data, model, and pipeline parallelism.',
      'Collaborated within an 80 member research team to analyze and improve scalability of distributed computing algorithms for large language models.',
      'Designed and implemented scalable AI infrastructure for fine-tuning large language models in a high-performance computing environment.',
    ]),
    iti: Object.freeze([
      'Built a cardiovascular risk prediction model achieving 92% accuracy by engineering and optimizing features from over 8,000 patient records, including data cleaning, transformation, and selection to enhance predictive performance.',
      'Evaluated and deployed ensemble models (Random Forest, XGBoost, SVM), managing the complete model development lifecycle from data preprocessing and feature engineering through training, validation, and final deployment.',
    ]),
    te: Object.freeze([
      'Developed and optimized customer churn prediction models reaching 92% classification accuracy, contributing to an estimated 6\u201310% reduction in churn risk.',
      'Automated data cleaning and Power BI reporting pipelines, cutting manual reporting time by 50% in comparison to older methods.',
    ]),
  }),
  projectBullets: Object.freeze({
    autocare:  Object.freeze(['Shipped a mobile app on Google Play that uses fine-tuned YOLOv11m to detect and annotate vehicle damage in real time.']),
    autism:    Object.freeze(['Built an end-to-end mobile app achieving 95% behavioral recognition accuracy, integrating 12 evidence-based therapeutic tools, and optimized for diverse devices via TensorFlow Lite.']),
    listify:   Object.freeze(['Built a production-ready SaaS app with AI-powered listing analysis, generating SEO-optimized titles, rewritten descriptions, and amenity recommendations; integrated credit-based monetization via Gumroad and Supabase Auth.']),
    verbatim:  Object.freeze(['Live AI-vs-AI debate platform where two LLMs argue opposing sides of topics of the users choice in real time via SSE streaming; built with MVVM architecture and featuring a live audience voting system.']),
    profanity: Object.freeze(['Production-ready REST API deployed on RapidAPI that detects profanity with evasion detection (l33t speak, dotted words), supports dynamic whitelisting/blacklisting, and delivers smart censoring.']),
    vamimi:    Object.freeze(['Developed an open-source AutoML library supporting 12+ algorithms with automated model selection and hyperparameter tuning, reducing experimentation time by 20%.']),
    asl:       Object.freeze([
      'Benchmarked 8 deep learning architectures for dual-hand Arabic sign language recognition; annotated 1,300+ images; achieved 95%+ accuracy with fine-tuned VGG16 (paper submitted for review).',
      'Built hybrid CNN-RNN model reaching 99% accuracy across the full 28-letter Arabic alphabet (paper in preparation).',
    ]),
  }),
});

// ─── Display Label Maps ───────────────────────────────────────────────────────
export const EXPERIENCE_LABELS = Object.freeze({
  vt:  'HPC and AI Research Intern at Virginia Tech',
  iti: 'ML Research Intern at ITI',
  te:  'Data Analytics Intern at Telecom Egypt',
});

export const PROJECT_LABELS = Object.freeze({
  autocare:  'AutoCare Pro',
  autism:    'AI Autism Support App',
  listify:   'ListifyAI',
  verbatim:  'Verbatim',
  profanity: 'Profanity Filter API',
  vamimi:    'VamimiML',
  asl:       'Arabic Sign Language Research',
});

export const SKILL_LABELS = Object.freeze({
  programmingLanguages: 'Programming Languages',
  mlAI:                 'ML / AI',
  frameworksTools:      'Frameworks & Tools',
  dataAnalytics:        'Data & Analytics',
  deploymentMobile:     'Deployment & Mobile',
});

// ─── Data Merger ──────────────────────────────────────────────────────────────
/**
 * Deep-merges MUTABLE_DEFAULTS with llmOutput, returning the final resume data
 * object that contains both IMMUTABLE fields and the merged mutable content.
 * Missing LLM fields fall back to defaults.
 */
export function buildResumeData(llmOutput = {}) {
  const def = MUTABLE_DEFAULTS;
  const llm = llmOutput || {};

  const skills = { ...def.skills, ...(llm.skills || {}) };
  // languagesSpoken is immutable
  skills.languagesSpoken = def.skills.languagesSpoken;

  const experienceBullets = {};
  for (const id of Object.keys(def.experienceBullets)) {
    experienceBullets[id] = (llm.experienceBullets?.[id]?.length)
      ? llm.experienceBullets[id]
      : [...def.experienceBullets[id]];
  }

  const projectBullets = {};
  for (const id of Object.keys(def.projectBullets)) {
    projectBullets[id] = (llm.projectBullets?.[id]?.length)
      ? llm.projectBullets[id]
      : [...def.projectBullets[id]];
  }

  return {
    ...IMMUTABLE,
    summary:            llm.summary || def.summary,
    skills,
    experienceBullets,
    projectBullets,
    _meta: {
      extractedPrimaryKeywords: llm.extractedPrimaryKeywords || [],
      estimatedTargetMatchScore: llm.estimatedTargetMatchScore || '',
      optimizerNotes: llm.optimizerNotes || '',
    },
  };
}

// ─── OOXML Helpers ─────────────────────────────────────────────────────────────
function xe(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rpr({ b, sz, color, i } = {}) {
  let x = '<w:rPr>';
  if (b)     x += '<w:b/><w:bCs/>';
  if (i)     x += '<w:i/><w:iCs/>';
  if (sz)    x += `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  if (color) x += `<w:color w:val="${color}"/>`;
  x += '</w:rPr>';
  return x;
}

function run(text, opts = {}) {
  const t = text === '\t'
    ? '<w:tab/>'
    : `<w:t xml:space="preserve">${xe(text)}</w:t>`;
  return `<w:r>${rpr(opts)}${t}</w:r>`;
}

function ppr({ jc, before, after, border, tabs, indL, indH } = {}) {
  let x = '<w:pPr>';
  if (jc)     x += `<w:jc w:val="${jc}"/>`;
  if (before !== undefined || after !== undefined) {
    x += `<w:spacing${before !== undefined ? ` w:before="${before}"` : ''}${after !== undefined ? ` w:after="${after}"` : ''}/>`;
  }
  if (border) x += `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>`;
  if (tabs)   x += `<w:tabs>${tabs.map(t => `<w:tab w:val="${t.align}" w:pos="${t.pos}"/>`).join('')}</w:tabs>`;
  if (indL !== undefined) x += `<w:ind w:left="${indL}"${indH !== undefined ? ` w:hanging="${indH}"` : ''}/>`;
  x += '</w:pPr>';
  return x;
}

function para(runs, opts = {}) {
  return `<w:p>${ppr(opts)}${runs.join('')}</w:p>`;
}
function empty(after = 60) {
  return `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr></w:p>`;
}
function secHead(title) {
  return para([run(title, { b: true, sz: 22 })], { before: 160, after: 60, border: true });
}
function roleRow(title, period) {
  return para([
    run(title, { b: true, sz: 21 }),
    run('\t', { sz: 21 }),
    run(period, { sz: 21 }),
  ], { tabs: [{ align: 'right', pos: 9360 }], before: 120, after: 30 });
}
function companyRow(company, location) {
  return para([
    run(company, { i: true, sz: 20 }),
    run('\t', { sz: 20 }),
    run(location, { sz: 20 }),
  ], { tabs: [{ align: 'right', pos: 9360 }], after: 40 });
}
function bullet(text) {
  return para([run('\u2022 ' + text, { sz: 20 })], { indL: 360, indH: 360, after: 40 });
}
function skillLine(label, value) {
  return para([
    run(label + ': ', { b: true, sz: 20 }),
    run(value, { sz: 20 }),
  ], { after: 40 });
}
function projHead(name, techStack) {
  return para([
    run(name, { b: true, sz: 21 }),
    run('  |  ' + techStack, { sz: 20 }),
  ], { before: 100, after: 30 });
}
function bodyPara(text) {
  return para([run(text, { sz: 20 })], { after: 60 });
}
function contactLine(text) {
  return para([run(text, { sz: 19 })], { jc: 'center', after: 30 });
}

function buildDocumentXML(d) {
  const NS = [
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"',
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
    'mc:Ignorable="w14 wpc"',
  ].join(' ');

  const parts = [];

  // Name
  parts.push(para([run(d.name, { b: true, sz: 36 })], { jc: 'center', before: 0, after: 60 }));
  // Contact
  parts.push(contactLine(`${d.contact.location}  \u2022  ${d.contact.phone}  \u2022  ${d.contact.email}`));
  parts.push(contactLine(`${d.contact.linkedinLabel}  \u2022  ${d.contact.githubLabel}`));
  parts.push(empty(80));

  // Summary
  parts.push(secHead('PROFESSIONAL SUMMARY'));
  parts.push(bodyPara(d.summary));
  parts.push(empty(60));

  // Skills
  parts.push(secHead('TECHNICAL SKILLS'));
  parts.push(skillLine('Programming Languages', d.skills.programmingLanguages));
  parts.push(skillLine('ML / AI',               d.skills.mlAI));
  parts.push(skillLine('Frameworks and Tools',   d.skills.frameworksTools));
  parts.push(skillLine('Data and Analytics',     d.skills.dataAnalytics));
  parts.push(skillLine('Deployment and Mobile',  d.skills.deploymentMobile));
  parts.push(skillLine('Languages Spoken',       d.skills.languagesSpoken));
  parts.push(empty(60));

  // Experience
  parts.push(secHead('PROFESSIONAL EXPERIENCE'));
  for (const role of d.experience) {
    parts.push(roleRow(role.title, role.period));
    parts.push(companyRow(role.company, role.location));
    for (const b of (d.experienceBullets[role.id] || [])) {
      parts.push(bullet(b));
    }
    parts.push(empty(60));
  }

  // Projects
  parts.push(secHead('PROJECTS'));
  for (const proj of d.projects) {
    parts.push(projHead(proj.name, proj.techStack));
    for (const b of (d.projectBullets[proj.id] || [])) {
      parts.push(bullet(b));
    }
    parts.push(empty(40));
  }

  // Education
  parts.push(secHead('EDUCATION'));
  parts.push(roleRow(d.education.degree, d.education.period));
  parts.push(companyRow(d.education.institution, d.education.location));
  parts.push(bodyPara(`GPA: ${d.education.gpa}  |  Class Rank: ${d.education.rank}  |  ${d.education.scholarship}`));
  parts.push(empty(60));

  // Certifications
  parts.push(secHead('CERTIFICATIONS'));
  for (const c of d.certifications) parts.push(bullet(c));
  parts.push(empty(60));

  // Awards
  parts.push(secHead('AWARDS & RECOGNITION'));
  for (const a of d.awards) parts.push(bullet(a));

  // Section props
  const sectPr = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${parts.join('')}${sectPr}</w:body></w:document>`;
}

// ─── DOCX Generator ───────────────────────────────────────────────────────────
export async function generateDocxBlob(resumeData) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip not loaded');

  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`);

  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/>
      <w:sz w:val="20"/><w:szCs w:val="20"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`);

  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`);

  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Job Fish</dc:creator>
  <cp:lastModifiedBy>Job Fish</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
</cp:coreProperties>`);

  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Job Fish</Application>
</Properties>`);

  zip.file('word/document.xml', buildDocumentXML(resumeData));

  return zip.generateAsync({
    type:               'blob',
    mimeType:           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression:        'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// ─── PDF Generator ─────────────────────────────────────────────────────────────
export function generatePdfBlob(resumeData) {
  const jspdf = window.jspdf;
  if (!jspdf) throw new Error('jsPDF not loaded');
  const { jsPDF } = jspdf;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const ml = 19.05, mr = 19.05, mt = 19.05, mb = 19.05;
  const pw = 215.9, ph = 279.4;
  const cw = pw - ml - mr;
  const re = pw - mr;
  let y = mt;

  function guard(need = 12) {
    if (y + need > ph - mb) { doc.addPage(); y = mt; }
  }
  function lh(fs) { return fs * 0.38; }

  function name(text) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(text, pw / 2, y, { align: 'center' });
    y += lh(18) + 2;
  }
  function contact(text) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(text, pw / 2, y, { align: 'center' });
    y += lh(9) + 1.5;
  }
  function sectionHdr(title) {
    guard(14);
    y += 3;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(title, ml, y);
    doc.setLineWidth(0.3);
    doc.line(ml, y + 1.2, re, y + 1.2);
    y += lh(10.5) + 3;
  }
  function roleHdr(title, period) {
    guard(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(title, ml, y);
    doc.setFont('helvetica', 'normal');
    doc.text(period, re, y, { align: 'right' });
    y += lh(10) + 1.5;
  }
  function companyHdr(company, location) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5);
    doc.text(company, ml, y);
    doc.setFont('helvetica', 'normal');
    doc.text(location, re, y, { align: 'right' });
    y += lh(9.5) + 2;
  }
  function blt(text) {
    guard(8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const bx = ml + 3, tx = ml + 6.5, mw = cw - 6.5;
    const lines = doc.splitTextToSize(text, mw);
    doc.text('\u2022', bx, y);
    doc.text(lines, tx, y);
    y += lines.length * (lh(9.5) + 0.5) + 1.5;
  }
  function bodyText(text) {
    guard(8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(text, cw);
    doc.text(lines, ml, y);
    y += lines.length * (lh(9.5) + 0.5) + 2;
  }
  function skillRow(label, value) {
    guard(6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const labelW = doc.getStringUnitWidth(label + ': ') * 9.5 / doc.internal.scaleFactor;
    doc.text(label + ': ', ml, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value, cw - labelW);
    doc.text(lines, ml + labelW, y);
    y += Math.max(lines.length, 1) * (lh(9.5) + 0.5) + 1.5;
  }
  function projHdr(pname, techStack) {
    guard(10);
    y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(pname, ml, y);
    y += lh(10) + 1;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(techStack, ml, y);
    y += lh(9) + 2;
  }

  const d = resumeData;
  // Header
  name(d.name);
  contact(`${d.contact.location}  \u2022  ${d.contact.phone}  \u2022  ${d.contact.email}`);
  contact(`${d.contact.linkedinLabel}  \u2022  ${d.contact.githubLabel}`);
  y += 3;

  // Summary
  sectionHdr('PROFESSIONAL SUMMARY');
  bodyText(d.summary);

  // Skills
  sectionHdr('TECHNICAL SKILLS');
  skillRow('Programming Languages', d.skills.programmingLanguages);
  skillRow('ML / AI',               d.skills.mlAI);
  skillRow('Frameworks and Tools',  d.skills.frameworksTools);
  skillRow('Data and Analytics',    d.skills.dataAnalytics);
  skillRow('Deployment and Mobile', d.skills.deploymentMobile);
  skillRow('Languages Spoken',      d.skills.languagesSpoken);

  // Experience
  sectionHdr('PROFESSIONAL EXPERIENCE');
  for (const role of d.experience) {
    roleHdr(role.title, role.period);
    companyHdr(role.company, role.location);
    for (const b of (d.experienceBullets[role.id] || [])) blt(b);
    y += 2;
  }

  // Projects
  sectionHdr('PROJECTS');
  for (const proj of d.projects) {
    projHdr(proj.name, proj.techStack);
    for (const b of (d.projectBullets[proj.id] || [])) blt(b);
  }

  // Education
  sectionHdr('EDUCATION');
  roleHdr(d.education.degree, d.education.period);
  companyHdr(d.education.institution, d.education.location);
  bodyText(`GPA: ${d.education.gpa}  |  Class Rank: ${d.education.rank}  |  ${d.education.scholarship}`);

  // Certifications
  sectionHdr('CERTIFICATIONS');
  for (const c of d.certifications) blt(c);

  // Awards
  sectionHdr('AWARDS & RECOGNITION');
  for (const a of d.awards) blt(a);

  return doc.output('blob');
}
