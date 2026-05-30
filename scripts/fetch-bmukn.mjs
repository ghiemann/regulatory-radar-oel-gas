import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(projectRoot, "public/data/documents.json");

const BMUKN_FEEDS = [
  {
    url: "https://www.bundesumweltministerium.de/klimaschutz.rss",
    source: "BMUKN Klimaschutz",
    documentType: "Meldung"
  },
  {
    url: "https://www.bundesumweltministerium.de/umwelt.rss",
    source: "BMUKN Umwelt",
    documentType: "Meldung"
  },
  {
    url: "https://www.bundesumweltministerium.de/natur.rss",
    source: "BMUKN Natur",
    documentType: "Meldung"
  }
];

const maxItems = Number(process.env.BMUKN_MAX_ITEMS ?? 60);
const startDate = process.env.BMUKN_START_DATE ?? "2025-03-25";
const dryRun = process.argv.includes("--dry-run");

const relevanceTerms = {
  strong: [
    "ccs",
    "carbon capture and storage",
    "carbon management",
    "co2-speicherung",
    "co2 speicherung",
    "co2-transport",
    "co2 transport",
    "co2-pipeline",
    "co2 pipeline",
    "kohlendioxidspeicherung",
    "kohlenstoffspeicher",
    "kohlenstoffspeicherung",
    "co2-differenzvertrag",
    "co2-differenzvertraege",
    "co2-differenzverträge",
    "klimaschutzvertrag",
    "klimaschutzvertraege",
    "klimaschutzverträge",
    "methanemission",
    "methanemissionen",
    "methan",
    "industrieemission",
    "industrieemissionen",
    "ied",
    "meeresschutzgebiet",
    "meeresschutzgebiete",
    "kohlenwasserstoff",
    "kohlenwasserstoffe",
    "offshore-bohrung",
    "offshore bohrung",
    "erdgasfoerderung",
    "erdgasförderung",
    "gasfoerderung",
    "gasförderung",
    "erdoelfoerderung",
    "erdölförderung"
  ],
  medium: [
    "uvp",
    "umweltvertraeglichkeitspruefung",
    "umweltverträglichkeitsprüfung",
    "genehmigungsverfahren",
    "planfeststellung",
    "planfeststellungsverfahren",
    "umweltrechtsbehelfsgesetz",
    "umweltauflagen",
    "emissionshandel",
    "emissionsminderung",
    "emissionsminderungen",
    "industrieanlage",
    "industrieanlagen",
    "raffinerie",
    "pipeline",
    "pipelines",
    "rohrleitung",
    "offshore",
    "nordsee",
    "gas",
    "erdgas",
    "erdoel",
    "erdöl"
  ],
  weak: [
    "klimaschutz",
    "emissionen",
    "industrie",
    "foerderung",
    "förderung",
    "naturschutz",
    "umwelt"
  ]
};

const falsePositiveTerms = [
  "bioabfall",
  "biotonne",
  "boden",
  "boeden",
  "böden",
  "landwirtschaft",
  "duenger",
  "dünger",
  "biodiversitaet",
  "biodiversität",
  "artenvielfalt",
  "wald",
  "waelder",
  "wälder",
  "flussnatur",
  "bach",
  "moore",
  "e-auto",
  "elektroauto",
  "verbraucher",
  "schule",
  "forschung zu zwischenlager",
    "radioaktive abfaelle",
    "radioaktive abfälle",
    "strahlenschutz",
    "internationale umweltpolitik",
    "partnerschaft mit china",
    "partnerschaft mit mexiko",
    "g20",
    "weltgemeinschaft",
    "meeresverschmutzung",
    "geschlechtergerechtigkeit",
    "kohleausstieg"
];

if (process.argv.includes("--test-filters")) {
  const cases = [
    {
      title: "BMUKN legt Eckpunkte fuer Carbon Management und CO2-Speicherung vor",
      description: "CCS, CO2-Transport und Kohlendioxidspeicherung sollen fuer Industrieemissionen geregelt werden.",
      expected: true
    },
    {
      title: "Meeresschutzgebiete: Umweltministerium nimmt Offshore-Gasfoerderung in den Blick",
      description: "Kohlenwasserstoffe, Erdgasfoerderung und Meeresschutz in der Nordsee.",
      expected: true
    },
    {
      title: "Novelle des Umwelt-Rechtsbehelfsgesetzes soll Genehmigungsverfahren fuer Industrieanlagen beschleunigen",
      description: "UVP und Genehmigungsverfahren mit Bezug zu Pipeline- und Raffinerieanlagen.",
      expected: true
    },
    {
      title: "Fuer gesunde Boeden: Bundesumweltministerium foerdert bodenschonende Bewirtschaftung",
      description: "Landwirtschaftlich genutzte Boeden, Biodiversitaet und Duenger.",
      expected: false
    },
    {
      title: "Deutschland staerkt Partnerschaft mit Mexiko im Umwelt- und Klimaschutz",
      description: "Internationale Zusammenarbeit in Kreislaufwirtschaft und Wasserversorgung.",
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
      source: "BMUKN"
    });
    const ok = quality.isRelevant === testCase.expected;
    if (!ok) failures += 1;
    console.log(`${ok ? "OK" : "FAIL"} expected=${testCase.expected ? "KEEP" : "DROP"} actual=${quality.isRelevant ? "KEEP" : "DROP"} score=${quality.score}: ${testCase.title}`);
  }

  if (failures > 0) process.exit(1);
  process.exit(0);
}

const candidates = [];

for (const feed of BMUKN_FEEDS) {
  const response = await fetch(feed.url);
  if (!response.ok) throw new Error(`BMUKN RSS request failed with HTTP ${response.status}: ${feed.url}`);
  const xml = await response.text();
  candidates.push(...parseRssItems(xml).map((item) => ({ ...item, feed })));
}

const importedDocuments = dedupeById(candidates, (candidate) => candidate.link || candidate.guid)
  .map(normalizeItem)
  .filter((document) => document.date >= startDate)
  .map((document) => ({ ...document, importQuality: evaluateImportQuality(document) }))
  .filter((document) => document.importQuality.isRelevant)
  .sort(sortByActivityDesc)
  .slice(0, maxItems);

if (dryRun) {
  console.log(`BMUKN-Dry-Run: ${importedDocuments.length} relevante Dokumente gefunden.`);
  console.log(`Startdatum: ${startDate || "nicht begrenzt"}`);
  for (const document of importedDocuments) {
    const terms = [
      ...document.importQuality.matchedTerms.strong,
      ...document.importQuality.matchedTerms.medium
    ].slice(0, 6).join(", ");
    console.log(`${document.date} ${document.source}: ${document.title} (${terms})`);
  }
} else if (importedDocuments.length === 0) {
  console.warn("Keine relevanten BMUKN-Dokumente gefunden. Die bestehende documents.json wird nicht veraendert.");
} else {
  const currentDocuments = await readCurrentDocuments();
  const mergedDocuments = dedupeById(
    [...importedDocuments, ...currentDocuments.filter((document) => !String(document.id).startsWith("bmukn-"))],
    (document) => document.id
  ).sort(sortByActivityDesc);

  await writeJson(OUTPUT_PATH, mergedDocuments);
  console.log(`BMUKN-Import abgeschlossen: ${importedDocuments.length} Dokumente in ${relativeToProject(OUTPUT_PATH)} gemergt.`);
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
      category: readXmlTag(match[1], "category"),
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
  const summaryShort = summarize(cleanText(stripHtml(item.description)) || `${title}: ${item.feed.source}`, 280);
  const category = cleanText(item.category);

  return {
    id: `bmukn-${hashId(item.guid || item.link)}`,
    title,
    source: item.feed.source,
    sourceType: "Ministerium",
    level: "Bund",
    documentType: item.feed.documentType,
    date,
    lastActivityDate: `${date}T12:00:00+02:00`,
    status: category || "Veroeffentlicht",
    url: item.link,
    summaryShort,
    summaryLong: category ? `${summaryShort} Kategorie: ${category}` : summaryShort,
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

  const score = strongMatches.length * 7 + mediumMatches.length * 2 + Math.min(weakMatches.length, 2) - exclusionMatches.length * 6;
  const hasCoreSignal = strongMatches.length > 0;
  const matchedSignals = [...strongMatches, ...mediumMatches].map((term) => normalizeForSearch(term));
  const hasOilGasOrCcsSignal = matchedSignals.some((term) => {
    return term.includes("ccs") || term.includes("co2") || term.includes("methan") || term.includes("kohlenwasserstoff") || term.includes("gasfoerderung") || term.includes("erdoel") || term.includes("erdgasfoerderung");
  });
  const hasIndustryEmissionSignal = matchedSignals.some((term) => ["industrieemission", "industrieemissionen", "ied"].includes(term));
  const hasMarineHydrocarbonSignal =
    (haystack.includes("meeresschutz") || haystack.includes("meeresschutzgebiet") || haystack.includes("nordsee") || haystack.includes("ostsee")) &&
    (haystack.includes("kohlenwasserstoff") || haystack.includes("gasfoerderung") || haystack.includes("erdoelfoerderung") || haystack.includes("erdgasfoerderung") || haystack.includes("offshore bohrung"));
  const hasProcessWithIndustrySignal = mediumMatches.some((term) => ["uvp", "genehmigungsverfahren", "planfeststellung", "umweltrechtsbehelfsgesetz"].includes(normalizeForSearch(term))) &&
    mediumMatches.some((term) => ["pipeline", "raffinerie", "industrieanlage", "gas", "erdgas", "erdoel", "offshore", "nordsee"].includes(normalizeForSearch(term)));
  const blockedAsFalsePositive = exclusionMatches.length >= 1 && !(hasOilGasOrCcsSignal || hasIndustryEmissionSignal || hasMarineHydrocarbonSignal);

  return {
    isRelevant: !blockedAsFalsePositive && (
      (hasOilGasOrCcsSignal && (score >= 7 || hasCoreSignal)) ||
      (hasIndustryEmissionSignal && score >= 7) ||
      (hasMarineHydrocarbonSignal && score >= 7) ||
      (hasProcessWithIndustrySignal && score >= 8)
    ),
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
