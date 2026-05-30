import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(projectRoot, "public/data/documents.json");

const LBEG_SOURCES = [
  {
    url: "https://www.lbeg.niedersachsen.de/aktuelles/neuigkeiten/",
    source: "LBEG Neuigkeiten",
    documentType: "Neuigkeit"
  },
  {
    url: "https://www.lbeg.niedersachsen.de/aktuelles/pressemitteilungen/",
    source: "LBEG Presseinformationen",
    documentType: "Presseinformation"
  }
];

const maxArticles = Number(process.env.LBEG_MAX_ARTICLES ?? 80);
const requestDelayMs = Number(process.env.LBEG_REQUEST_DELAY_MS ?? 150);
const startDate = process.env.LBEG_START_DATE ?? "2025-03-25";
const dryRun = process.argv.includes("--dry-run");

const relevanceTerms = {
  strong: [
    "erdgas",
    "erdgasfoerderung",
    "erdgasforderung",
    "erdgasbohrung",
    "erdgasleitung",
    "erdgasfeld",
    "erdgasspeicher",
    "untertage gasspeicher",
    "gasspeicher",
    "gasfoerderung",
    "gasforderung",
    "gasbohrung",
    "gasfeld",
    "gasleitung",
    "lng",
    "methan",
    "methanemission",
    "erdoel",
    "erdol",
    "erdoelfoerderung",
    "erdolforderung",
    "erdoelfoerderplatz",
    "erdolforderplatz",
    "erdoelplatz",
    "erdolplatz",
    "erdoellagerstaette",
    "erdollagerstatte",
    "oelfeld",
    "olfeld",
    "oelbohrung",
    "olbohrung",
    "oelschlamm",
    "olschlamm",
    "raffinerie",
    "kohlenwasserstoff",
    "kohlenwasserstoffe",
    "bohrung",
    "bohrungen",
    "richtbohrung",
    "offshore",
    "ccs",
    "carbon capture and storage",
    "co2 speicherung",
    "co2-speicherung",
    "co2 speicher",
    "co2-speicher",
    "kohlendioxid speicherung",
    "kohlendioxid-speicherung",
    "kohlendioxidspeicherung",
    "kohlenstoffspeicher",
    "kohlenstoffspeicherung",
    "kohlendioxid speichern",
    "ksptg",
    "energietransportleitung",
    "rohrleitung",
    "rohrleitungen",
    "gastransportleitung",
    "pipeline",
    "leitungskataster"
  ],
  medium: [
    "leitungsbau",
    "leitungstrasse",
    "leitungsvorhaben",
    "leitung",
    "leitungen",
    "planfeststellung",
    "planfeststellungsverfahren",
    "planfeststellungsbeschluss",
    "antragsunterlagen",
    "betriebsplan",
    "rahmenbetriebsplan",
    "genehmigung",
    "bergbauberechtigung",
    "bergrecht",
    "bergbau",
    "bergaufsicht",
    "untergrundspeicherung",
    "lagerstaette",
    "lagerstatte",
    "aufsuchung",
    "exploration",
    "geothermie",
    "tiefengeothermie",
    "tiefe geothermie",
    "erdwaerme",
    "erdwarme",
    "thermalwasser",
    "lithium"
  ],
  weak: [
    "energie",
    "rohstoff",
    "rohstoffe",
    "untergrund",
    "emission",
    "emissionen",
    "umwelt",
    "bodenprobe",
    "nordsee",
    "niedersachsen"
  ]
};

const exclusionTerms = [
  "tagung",
  "geothermietagung",
  "veranstaltung",
  "veranstaltungen",
  "veranstaltungsbericht",
  "kongress",
  "konferenz",
  "workshop",
  "messe",
  "forum",
  "symposium",
  "webinar",
  "jubiläum",
  "jubilaeum",
  "feiert",
  "auszeichnung",
  "preis",
  "delegation",
  "besuch",
  "exkursion",
  "tag des",
  "archiv",
  "karriere",
  "stellenangebot",
  "bibliothek"
];

if (process.argv.includes("--test-filters")) {
  const cases = [
    {
      title: "17. Norddeutsche Geothermietagung in Hannover: Von der Innovation zur Praxis",
      summaryShort: "Zukunftsperspektiven fuer die tiefe Erdwaermenutzung.",
      expected: false
    },
    {
      title: "LBEG feiert Jubiläum der geologischen Landesaufnahme",
      summaryShort: "Rueckblick auf die Geschichte der Behoerde.",
      expected: false
    },
    {
      title: "Planfeststellungsverfahren fuer Energietransportleitung ETL 186 Peine - Hallendorf eingeleitet",
      expected: true
    },
    {
      title: "Erschliessung des Oel- und Gasfeldes Kyla vor der schottischen Kueste",
      expected: true
    },
    {
      title: "CO2-Speicherung: Antrag auf Untersuchung des Untergrundes nach KSpTG",
      expected: true
    },
    {
      title: "Tiefe Geothermie in Niedersachsen: Neue Karten zeigen geeignete Regionen fuer Erdwaermeprojekte",
      expected: true
    },
    {
      title: "Lithium aus Thermalwasser: LBEG veroeffentlicht neue Datengrundlage",
      expected: true
    }
  ];

  let failures = 0;
  for (const testCase of cases) {
    const quality = evaluateImportQuality({
      title: testCase.title,
      summaryShort: testCase.summaryShort ?? testCase.title,
      summaryLong: "",
      documentType: "Test",
      source: "LBEG"
    });
    const ok = quality.isRelevant === testCase.expected;
    if (!ok) failures += 1;
    console.log(`${ok ? "OK" : "FAIL"} expected=${testCase.expected ? "KEEP" : "DROP"} actual=${quality.isRelevant ? "KEEP" : "DROP"} score=${quality.score}: ${testCase.title}`);
  }

  if (failures > 0) process.exit(1);
  process.exit(0);
}

const candidates = [];

for (const source of LBEG_SOURCES) {
  const html = await fetchText(source.url);
  candidates.push(...extractArticleCandidates(html, source));
}

const uniqueCandidates = dedupeById(candidates, (candidate) => candidate.url).slice(0, maxArticles);
const importedDocuments = [];

for (const candidate of uniqueCandidates) {
  await delay(requestDelayMs);
  try {
    const html = await fetchText(candidate.url);
    const document = normalizeLbegArticle(html, candidate);
    if (!document) continue;
    if (startDate && document.date < startDate) continue;

    const quality = evaluateImportQuality(document);
    if (!quality.isRelevant) continue;

    importedDocuments.push({
      ...document,
      importQuality: quality
    });
  } catch (error) {
    console.warn(`LBEG-Artikel uebersprungen (${candidate.url}): ${error.message}`);
  }
}

const sortedImportedDocuments = importedDocuments.sort(sortByActivityDesc);

if (dryRun) {
  console.log(`LBEG-Dry-Run: ${sortedImportedDocuments.length} relevante Dokumente gefunden.`);
  console.log(`Startdatum: ${startDate || "nicht begrenzt"}`);
  for (const document of sortedImportedDocuments) {
    console.log(`${document.date} ${document.documentType}: ${document.title} (${document.importQuality.matchedTerms.strong.concat(document.importQuality.matchedTerms.medium).slice(0, 5).join(", ")})`);
  }
  process.exit(0);
}

if (sortedImportedDocuments.length === 0) {
  console.warn("Keine relevanten LBEG-Dokumente gefunden. Die bestehende documents.json wird nicht veraendert.");
  process.exit(0);
}

const currentDocuments = await readCurrentDocuments();
const mergedDocuments = dedupeById(
  [...sortedImportedDocuments, ...currentDocuments.filter((document) => !String(document.id).startsWith("lbeg-"))],
  (document) => document.id
).sort(sortByActivityDesc);

await writeJson(OUTPUT_PATH, mergedDocuments);
console.log(`LBEG-Import abgeschlossen: ${sortedImportedDocuments.length} LBEG-Dokumente in ${relativeToProject(OUTPUT_PATH)} gemergt.`);

function extractArticleCandidates(html, source) {
  const candidates = [];
  const sourcePath = new URL(source.url).pathname.replace(/\/$/, "");
  const linkPattern = /<a\b[^>]*href=["']([^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    const url = normalizeUrl(match[1], source.url);
    if (!url) continue;

    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== "www.lbeg.niedersachsen.de") continue;
    if (!parsedUrl.pathname.startsWith(sourcePath)) continue;

    const title = cleanText(stripHtml(match[2]).replace(/\bmehr$/i, ""));
    if (!title || title.toLocaleLowerCase("de-DE") === "übersicht") continue;

    candidates.push({ ...source, url, listTitle: title });
  }

  return candidates;
}

function normalizeLbegArticle(html, candidate) {
  const canonicalUrl = extractAttribute(html, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, "href") ?? candidate.url;
  const title = cleanTitle(
    extractMeta(html, "title") ??
      extractTagText(html, "h1") ??
      candidate.listTitle
  );
  if (!title) return null;

  const date = extractDate(html, canonicalUrl);
  const body = extractMainText(html, title);
  const summaryShort = summarize(body || candidate.listTitle, 220);
  const summaryLong = summarize(body || candidate.listTitle, 900);

  return {
    id: `lbeg-${extractNumericId(canonicalUrl) ?? slugify(title)}`,
    title,
    source: candidate.source,
    sourceType: "Behoerde",
    level: "Niedersachsen",
    documentType: candidate.documentType,
    date,
    lastActivityDate: `${date}T12:00:00+02:00`,
    status: "Veroeffentlicht",
    url: canonicalUrl,
    summaryShort,
    summaryLong,
    relevanceScore: 0,
    relevanceReason: "",
    tags: []
  };
}

function evaluateImportQuality(document) {
  const haystack = normalizeForSearch(
    [
      document.title,
      document.documentType,
      document.summaryShort,
      document.summaryLong,
      document.source
    ].join(" ")
  );

  const strongMatches = findTermMatches(haystack, relevanceTerms.strong);
  const mediumMatches = findTermMatches(haystack, relevanceTerms.medium);
  const weakMatches = findTermMatches(haystack, relevanceTerms.weak);
  const exclusionMatches = findTermMatches(haystack, exclusionTerms);

  const score = strongMatches.length * 5 + mediumMatches.length * 2 + Math.min(weakMatches.length, 4) - exclusionMatches.length * 8;
  const hasCoreSignal = strongMatches.length > 0;
  const hasLowerPrioritySignal = mediumMatches.some((term) => ["geothermie", "tiefengeothermie", "tiefe geothermie", "erdwaerme", "erdwarme", "thermalwasser", "lithium"].includes(term));
  const hasProcessSignal = mediumMatches.some((term) => ["planfeststellung", "planfeststellungsverfahren", "planfeststellungsbeschluss", "genehmigung", "betriebsplan", "rahmenbetriebsplan", "bergrecht", "bergbau", "bergaufsicht"].includes(term));
  const blockedAsEvent = exclusionMatches.length > 0;

  return {
    isRelevant: !blockedAsEvent && (score >= 8 || (hasCoreSignal && score >= 5) || (hasLowerPrioritySignal && (hasProcessSignal || score >= 4))),
    score,
    matchedTerms: {
      strong: strongMatches,
      medium: mediumMatches,
      weak: weakMatches,
      exclusions: exclusionMatches
    }
  };
}

function findTermMatches(haystack, terms) {
  return terms.filter((term) => includesSearchTerm(haystack, term));
}

function includesSearchTerm(haystack, term) {
  const normalizedTerm = normalizeForSearch(term);
  const allowsCompoundMatch = normalizedTerm.length >= 7 && !normalizedTerm.includes(" ");
  if (allowsCompoundMatch && haystack.includes(normalizedTerm)) return true;

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return pattern.test(haystack);
}

function extractMainText(html, title) {
  const text = stripHtml(
    html
      .replace(/[\s\S]*?<h1[^>]*>[\s\S]*?<\/h1>/i, "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
      .replace(/Drucken[\s\S]*$/i, " ")
  );

  const markerIndex = text.indexOf(title);
  const articleText = markerIndex >= 0 ? text.slice(markerIndex + title.length) : text;
  return cleanText(articleText)
    .replace(/^Bildrechte:[^.]+\.?\s*/i, "")
    .replace(/^Artikel-Informationen.*$/i, "");
}

function extractDate(html, url) {
  const metaDate = extractMeta(html, "date") ?? extractMeta(html, "DC.date");
  if (metaDate && !Number.isNaN(new Date(metaDate).getTime())) {
    return new Date(metaDate).toISOString().slice(0, 10);
  }

  const dateMatch = html.match(/(?:erstellt am|Datum)\s*:?\s*(\d{2})\.(\d{2})\.(\d{4})/i) ?? html.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dateMatch) return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  const idDateMatch = url.match(/-(20\d{2})(\d{2})(\d{2})\.html$/);
  if (idDateMatch) return `${idDateMatch[1]}-${idDateMatch[2]}-${idDateMatch[3]}`;

  return new Date().toISOString().slice(0, 10);
}

function extractMeta(html, name) {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escapeRegExp(name)}["'])[^>]*>`, "i"))?.[0];
  if (!tag) return null;
  return cleanText(decodeHtml(extractAttributeFromTag(tag, "content") ?? ""));
}

function extractAttribute(html, tagPattern, attribute) {
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return null;
  return extractAttributeFromTag(tag, attribute);
}

function extractAttributeFromTag(tag, attribute) {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]) : null;
}

function extractTagText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? cleanText(stripHtml(match[1])) : null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "regulatory-radar-oel-gas/0.1 (+https://ghiemann.github.io/regulatory-radar-oel-gas/)"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fuer ${url}`);
  }

  return response.text();
}

async function readCurrentDocuments() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeUrl(value, baseUrl) {
  try {
    return new URL(decodeHtml(value), baseUrl).href;
  } catch {
    return null;
  }
}

function cleanTitle(value) {
  return cleanText(value)
    .replace(/\s*\|\s*Landesamt für Bergbau, Energie und Geologie\s*$/i, "")
    .replace(/\s+mehr$/i, "");
}

function summarize(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "Keine Kurzbeschreibung in der Quelle verfuegbar.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function cleanText(value) {
  return decodeHtml(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeForSearch(value) {
  return cleanText(value)
    .toLocaleLowerCase("de-DE")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replaceAll("Ã¤", "ae")
    .replaceAll("Ã¶", "oe")
    .replaceAll("Ã¼", "ue")
    .replaceAll("ÃŸ", "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumericId(url) {
  return url.match(/-(\d+)\.html(?:$|\?)/)?.[1] ?? null;
}

function slugify(value) {
  return normalizeForSearch(value).replace(/\s+/g, "-").slice(0, 80);
}

function dedupeById(items, getId) {
  const result = new Map();
  for (const item of items) result.set(getId(item), item);
  return [...result.values()];
}

function sortByActivityDesc(a, b) {
  return new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime();
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relativeToProject(path) {
  return path.replace(`${projectRoot}\\`, "").replaceAll("\\", "/");
}
