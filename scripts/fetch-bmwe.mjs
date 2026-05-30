import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(projectRoot, "public/data/documents.json");

const BMWE_FEEDS = [
  {
    url: "https://www.bundeswirtschaftsministerium.de/SiteGlobals/BMWI/Functions/RSSFeed/DE/RSSFeed-Pressemitteilung.xml",
    source: "BMWE Pressemitteilungen",
    documentType: "Pressemitteilung"
  },
  {
    url: "https://www.bundeswirtschaftsministerium.de/SiteGlobals/BMWI/Functions/RSSFeed/DE/RSSFeed-Energie.xml",
    source: "BMWE Energie",
    documentType: "Meldung"
  }
];

const maxItems = Number(process.env.BMWE_MAX_ITEMS ?? 60);
const startDate = process.env.BMWE_START_DATE ?? "2025-03-25";
const dryRun = process.argv.includes("--dry-run");

const relevanceTerms = {
  strong: [
    "erdgas",
    "gasmarkt",
    "gasversorgung",
    "gasspeicher",
    "gaskraftwerk",
    "gaskraftwerke",
    "kraftwerksstrategie",
    "lng",
    "methan",
    "methanemission",
    "erdoel",
    "erdoelversorgung",
    "mineralöl",
    "mineraloel",
    "raffinerie",
    "pipeline",
    "pipelines",
    "gasleitung",
    "wasserstoffleitung",
    "wasserstoffnetz",
    "wasserstoff-infrastruktur",
    "wasserstoffkernnetz",
    "ccs",
    "carbon capture and storage",
    "carbon management",
    "co2-speicherung",
    "co2 speicherung",
    "co2-transport",
    "co2 transport",
    "kohlenstoffspeicher",
    "kohlendioxidspeicherung"
  ],
  medium: [
    "energieinfrastruktur",
    "versorgungssicherheit",
    "speicher",
    "netzausbau",
    "planungsbeschleunigung",
    "genehmigungsverfahren",
    "beschleunigungsgesetz",
    "wasserstoff",
    "energiewirtschaftsgesetz",
    "enwg",
    "energietransport",
    "infrastruktur"
  ],
  weak: [
    "energie",
    "strommarkt",
    "strompreis",
    "industrie",
    "dekarbonisierung",
    "klimaschutz"
  ]
};

const falsePositiveTerms = [
  "tourismus",
  "ausbildung",
  "beruf",
  "digitalisierung",
  "startup",
  "gründung",
  "gruendung",
  "mittelstand",
  "fachkräfte",
  "fachkraefte",
  "ökodesign",
  "oekodesign",
  "energieverbrauchskennzeichnung",
  "konjunktur"
];

if (process.argv.includes("--test-filters")) {
  const cases = [
    {
      title: "Bundeskabinett beschliesst Wasserstoff-Beschleunigungsgesetz",
      description: "Genehmigungsverfahren fuer Wasserstoffleitungen und Energieinfrastruktur werden beschleunigt.",
      expected: true
    },
    {
      title: "Carbon Management: Bundesregierung legt Eckpunkte fuer CO2-Transport und CCS vor",
      description: "Carbon Capture and Storage, CO2-Speicherung und Kohlenstoffspeicher werden adressiert.",
      expected: true
    },
    {
      title: "Versorgungssicherheit: Ausschreibung fuer neue Gaskraftwerke startet",
      description: "Gaskraftwerke sollen die Stromversorgung absichern.",
      expected: true
    },
    {
      title: "Bundestag ebnet Weg fuer moderne Regelungen zu Oekodesign und Energieverbrauchskennzeichnung",
      description: "Neue Produktkennzeichnungen fuer Verbraucherinnen und Verbraucher.",
      expected: false
    },
    {
      title: "Konjunkturschlaglicht",
      description: "Energiepreisanstieg bremst wirtschaftliche Erholung.",
      expected: false
    }
  ];

  let failures = 0;
  for (const testCase of cases) {
    const quality = evaluateImportQuality({
      title: testCase.title,
      summaryShort: testCase.description,
      summaryLong: testCase.description,
      documentType: "Test",
      source: "BMWE"
    });
    const ok = quality.isRelevant === testCase.expected;
    if (!ok) failures += 1;
    console.log(`${ok ? "OK" : "FAIL"} expected=${testCase.expected ? "KEEP" : "DROP"} actual=${quality.isRelevant ? "KEEP" : "DROP"} score=${quality.score}: ${testCase.title}`);
  }

  if (failures > 0) process.exit(1);
  process.exit(0);
}

const candidates = [];

for (const feed of BMWE_FEEDS) {
  const response = await fetch(feed.url);
  if (!response.ok) throw new Error(`BMWE RSS request failed with HTTP ${response.status}: ${feed.url}`);
  const xml = await response.text();
  candidates.push(...parseRssItems(xml).map((item) => ({ ...item, feed })));
}

const importedDocuments = dedupeById(candidates, (candidate) => candidate.link)
  .map(normalizeItem)
  .filter((document) => document.date >= startDate)
  .map((document) => ({ ...document, importQuality: evaluateImportQuality(document) }))
  .filter((document) => document.importQuality.isRelevant)
  .sort(sortByActivityDesc)
  .slice(0, maxItems);

if (dryRun) {
  console.log(`BMWE-Dry-Run: ${importedDocuments.length} relevante Dokumente gefunden.`);
  console.log(`Startdatum: ${startDate || "nicht begrenzt"}`);
  for (const document of importedDocuments) {
    const terms = [
      ...document.importQuality.matchedTerms.strong,
      ...document.importQuality.matchedTerms.medium
    ].slice(0, 6).join(", ");
    console.log(`${document.date} ${document.documentType}: ${document.title} (${terms})`);
  }
} else if (importedDocuments.length === 0) {
  console.warn("Keine relevanten BMWE-Dokumente gefunden. Die bestehende documents.json wird nicht veraendert.");
} else {
  const currentDocuments = await readCurrentDocuments();
  const mergedDocuments = dedupeById(
    [...importedDocuments, ...currentDocuments.filter((document) => !String(document.id).startsWith("bmwe-"))],
    (document) => document.id
  ).sort(sortByActivityDesc);

  await writeJson(OUTPUT_PATH, mergedDocuments);
  console.log(`BMWE-Import abgeschlossen: ${importedDocuments.length} Dokumente in ${relativeToProject(OUTPUT_PATH)} gemergt.`);
}

function parseRssItems(xml) {
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(xml))) {
    items.push({
      title: readXmlTag(match[1], "title"),
      link: readXmlTag(match[1], "link"),
      pubDate: readXmlTag(match[1], "pubDate"),
      description: readXmlTag(match[1], "description"),
      guid: readXmlTag(match[1], "guid")
    });
  }
  return items.filter((item) => item.title && item.link);
}

function readXmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeEntities(stripCdata(match?.[1] ?? "")).trim();
}

function normalizeItem(item) {
  const date = toDateOnly(item.pubDate);
  const title = cleanText(item.title);
  const summaryShort = summarize(cleanText(stripHtml(item.description)) || `${title}: ${item.feed.source}`, 260);

  return {
    id: `bmwe-${hashId(item.guid || item.link)}`,
    title,
    source: item.feed.source,
    sourceType: "Ministerium",
    level: "Bund",
    documentType: item.feed.documentType,
    date,
    lastActivityDate: `${date}T12:00:00+02:00`,
    status: "Veroeffentlicht",
    url: item.link,
    summaryShort,
    summaryLong: summaryShort,
    relevanceScore: 0,
    relevanceReason: "",
    tags: []
  };
}

function evaluateImportQuality(document) {
  const haystack = normalizeForSearch([document.title, document.documentType, document.summaryShort, document.summaryLong, document.source].join(" "));
  const compactHaystack = haystack.replace(/\s+/g, "");
  const strongMatches = findTermMatches(haystack, compactHaystack, relevanceTerms.strong);
  const mediumMatches = findTermMatches(haystack, compactHaystack, relevanceTerms.medium);
  const weakMatches = findTermMatches(haystack, compactHaystack, relevanceTerms.weak);
  const exclusionMatches = findTermMatches(haystack, compactHaystack, falsePositiveTerms);

  const score = strongMatches.length * 6 + mediumMatches.length * 2 + Math.min(weakMatches.length, 2) - exclusionMatches.length * 5;
  const hasCoreSignal = strongMatches.length > 0;
  const hasInfrastructureSignal = mediumMatches.some((term) => ["energieinfrastruktur", "genehmigungsverfahren", "beschleunigungsgesetz", "wasserstoff", "energiewirtschaftsgesetz", "enwg"].includes(normalizeForSearch(term)));

  return {
    isRelevant: score >= 10 || (hasCoreSignal && score >= 6) || (hasInfrastructureSignal && score >= 8),
    score,
    matchedTerms: {
      strong: strongMatches,
      medium: mediumMatches,
      weak: weakMatches,
      exclusions: exclusionMatches
    }
  };
}

function findTermMatches(haystack, compactHaystack, terms) {
  return terms.filter((term) => includesSearchTerm(haystack, compactHaystack, term));
}

function includesSearchTerm(haystack, compactHaystack, term) {
  const normalizedTerm = normalizeForSearch(term);
  const compactTerm = normalizedTerm.replace(/\s+/g, "");
  if (compactTerm.length >= 6 && compactHaystack.includes(compactTerm)) return true;

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
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

function dedupeById(items, getId) {
  const result = new Map();
  for (const item of items) result.set(getId(item), item);
  return [...result.values()];
}

function sortByActivityDesc(a, b) {
  return new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime();
}

function toDateOnly(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return new Date().toISOString().slice(0, 10);
  return new Date(time).toISOString().slice(0, 10);
}

function hashId(value) {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
}

function normalizeForSearch(value) {
  return cleanText(value)
    .toLocaleLowerCase("de-DE")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripCdata(value) {
  return String(value ?? "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function summarize(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "Keine Kurzbeschreibung in der Quelle verfuegbar.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function relativeToProject(path) {
  return path.replace(`${projectRoot}\\`, "").replaceAll("\\", "/");
}
