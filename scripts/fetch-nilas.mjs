import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(projectRoot, "public/data/documents.json");

const wahlperiode = Number(process.env.NILAS_WAHLPERIODE ?? 19);
const maxNumber = Number(process.env.NILAS_MAX_NUMBER ?? 7000);
const scanLimit = Number(process.env.NILAS_SCAN_LIMIT ?? 250);
const maxDocuments = Number(process.env.NILAS_MAX_DOCUMENTS ?? 60);
const startNumber = Number(process.env.NILAS_SCAN_START ?? Math.max(1, maxNumber - scanLimit + 1));
const endNumber = Number(process.env.NILAS_SCAN_END ?? maxNumber);
const requestDelayMs = Number(process.env.NILAS_REQUEST_DELAY_MS ?? 80);
const requestTimeoutMs = Number(process.env.NILAS_REQUEST_TIMEOUT_MS ?? 10000);
const dryRun = process.argv.includes("--dry-run");
const debugNumber = Number(process.argv.find((arg) => arg.startsWith("--debug-number="))?.split("=")[1] ?? 0);

const relevanceTerms = {
  strong: [
    "erdgas",
    "erdgasfoerderung",
    "erdgasförderung",
    "erdgasgewinnung",
    "erdgasproduktion",
    "erdgasfeld",
    "erdgasbohrung",
    "erdgasspeicher",
    "gasfoerderung",
    "gasförderung",
    "gasfeld",
    "gasbohrung",
    "gasleitung",
    "gasnetz",
    "gasnetze",
    "lng",
    "erdoel",
    "erdöl",
    "erdoelfoerderung",
    "erdölförderung",
    "erdoelgewinnung",
    "erdölgewinnung",
    "oel und gas",
    "öl und gas",
    "oel- und gas",
    "öl- und gas",
    "foerderabgabe",
    "förderabgabe",
    "bohrung",
    "bohrungen",
    "fracking",
    "ccs",
    "carbon capture and storage",
    "co2-speicherung",
    "co2 speicherung",
    "co2-lagerung",
    "co2 lagerung",
    "co2-pipeline",
    "co2 pipeline",
    "kohlenstoffspeicher",
    "kohlendioxidspeicherung",
    "kohlendioxid-speicherung",
    "kohlenwasserstoffe",
    "meeresschutzgebiet",
    "meeresschutzgebiete",
    "pipeline",
    "pipelines",
    "rohrleitung",
    "rohrleitungen"
  ],
  medium: [
    "bergrecht",
    "bergbau",
    "bergbehörde",
    "bergbehoerde",
    "betriebsplan",
    "genehmigungsverfahren",
    "genehmigung",
    "planfeststellung",
    "planfeststellungsverfahren",
    "leitungsvorhaben",
    "leitungsbau",
    "energieinfrastruktur",
    "wasserstoffleitung",
    "wasserstoffleitungen",
    "geothermie",
    "tiefengeothermie",
    "tiefe geothermie",
    "erdwärme",
    "erdwaerme",
    "thermalwasser",
    "lithium"
  ],
  weak: [
    "energieversorgung",
    "energieträger",
    "energietraeger",
    "untergrund",
    "nordsee",
    "emissionen",
    "klimaschutz",
    "wasserstoff"
  ]
};

const falsePositiveTerms = [
  "fuhrpark",
  "dienstwagen",
  "benzin",
  "diesel",
  "hochschule",
  "universität",
  "universitaet",
  "wärmeplanung",
  "waermeplanung",
  "heizung",
  "wärmepumpe",
  "waermepumpe",
  "tourismus",
  "krankenhaus",
  "schule"
];

if (process.argv.includes("--test-filters")) {
  const cases = [
    {
      title: "Energieversorgung in Niedersachsen mit einheimischem Erdgas",
      text: "Niedersachsen ist Erdgasförderland Nummer 1. Förderabgaben bei der Gewinnung von Gas und Öl.",
      expected: true
    },
    {
      title: "CO2-Speicherung in der Nordsee und Schutz von Meeresschutzgebieten",
      text: "CO2-Pipelines, Kohlenstoffspeicher und geologische Speicherung im Untergrund.",
      expected: true
    },
    {
      title: "Planfeststellung fuer eine neue Pipeline und Wasserstoffleitung",
      text: "Leitungsvorhaben mit Planfeststellungsverfahren in Niedersachsen.",
      expected: true
    },
    {
      title: "Fahrzeuge der Hochschulen nach Kraftstofftyp",
      text: "Benzin, Diesel, Elektro, Erdgas und Hybrid im Fuhrpark verschiedener Universitaeten.",
      expected: false
    },
    {
      title: "Touristische Infrastruktur an der Nordsee",
      text: "Foerderung touristischer Angebote und Veranstaltungen.",
      expected: false
    }
  ];

  let failures = 0;
  for (const testCase of cases) {
    const quality = evaluateImportQuality({
      title: testCase.title,
      summaryShort: testCase.text,
      summaryLong: testCase.text,
      documentType: "Test",
      source: "NILAS Landtag Niedersachsen"
    });
    const ok = quality.isRelevant === testCase.expected;
    if (!ok) failures += 1;
    console.log(`${ok ? "OK" : "FAIL"} expected=${testCase.expected ? "KEEP" : "DROP"} actual=${quality.isRelevant ? "KEEP" : "DROP"} score=${quality.score}: ${testCase.title}`);
  }

  if (failures > 0) process.exit(1);
  process.exit(0);
}

if (debugNumber > 0) {
  const url = buildDrucksacheUrl(debugNumber);
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fuer ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = repairPdfSpacing(extractPdfText(buffer));
  const title = extractTitle(text, debugNumber);
  console.log(`URL: ${url}`);
  console.log(`Datum: ${extractDate(text)}`);
  console.log(`Typ: ${extractDocumentType(text, title)}`);
  console.log(`Titel: ${title}`);
  console.log("\nTextanfang:");
  console.log(cleanText(text).slice(0, 1800));
  process.exit(0);
}

const importedDocuments = [];

for (let number = endNumber; number >= startNumber && importedDocuments.length < maxDocuments; number -= 1) {
  const url = buildDrucksacheUrl(number);
  await delay(requestDelayMs);

  try {
    const response = await fetchWithTimeout(url);
    if (response.status === 404 || response.status === 403) continue;
    if (!response.ok) {
      console.warn(`NILAS-Drucksache uebersprungen (${number}): HTTP ${response.status}`);
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const text = repairPdfSpacing(extractPdfText(buffer));
    if (!text || text.length < 100) continue;

    const document = normalizeDrucksache(number, url, text);
    const quality = evaluateImportQuality(document);
    if (!quality.isRelevant) continue;

    importedDocuments.push({
      ...document,
      importQuality: quality
    });
  } catch (error) {
    console.warn(`NILAS-Drucksache uebersprungen (${number}): ${error.message}`);
  }
}

const sortedImportedDocuments = importedDocuments.sort(sortByActivityDesc);

if (dryRun) {
  console.log(`NILAS-Dry-Run: ${sortedImportedDocuments.length} relevante Drucksachen gefunden.`);
  console.log(`Scan: WP ${wahlperiode}, Drucksachen ${startNumber}-${endNumber}`);
  for (const document of sortedImportedDocuments) {
    const terms = document.importQuality.matchedTerms.strong.concat(document.importQuality.matchedTerms.medium).slice(0, 6).join(", ");
    console.log(`${document.date} ${document.documentType}: ${document.title} (${terms})`);
  }
  process.exit(0);
}

if (sortedImportedDocuments.length === 0) {
  console.warn("Keine relevanten NILAS-Drucksachen gefunden. Die bestehende documents.json wird nicht veraendert.");
  process.exit(0);
}

const currentDocuments = await readCurrentDocuments();
const mergedDocuments = dedupeById(
  [...sortedImportedDocuments, ...currentDocuments.filter((document) => !String(document.id).startsWith("nilas-"))],
  (document) => document.id
).sort(sortByActivityDesc);

await writeJson(OUTPUT_PATH, mergedDocuments);
console.log(`NILAS-Import abgeschlossen: ${sortedImportedDocuments.length} Drucksachen in ${relativeToProject(OUTPUT_PATH)} gemergt.`);

function buildDrucksacheUrl(number) {
  const outerEnd = Math.ceil(number / 2500) * 2500;
  const innerStart = Math.floor((number - 1) / 500) * 500 + 1;
  const innerEnd = innerStart + 499;
  return `https://www.landtag-niedersachsen.de/drucksachen/drucksachen_${wahlperiode}_${pad5(outerEnd)}/${pad5(innerStart)}-${pad5(innerEnd)}/${wahlperiode}-${pad5(number)}.pdf`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDrucksache(number, url, text) {
  const title = extractTitle(text, number);
  const date = extractDate(text);
  const documentType = extractDocumentType(text, title);
  const summaryShort = summarize(extractSummary(text, title), 240);
  const summaryLong = summarize(text, 900);

  return {
    id: `nilas-${wahlperiode}-${pad5(number)}`,
    title,
    source: "NILAS Landtag Niedersachsen",
    sourceType: "Parlament",
    level: "Niedersachsen",
    documentType,
    date,
    lastActivityDate: `${date}T12:00:00+02:00`,
    status: "Drucksache",
    url,
    summaryShort,
    summaryLong,
    relevanceScore: 0,
    relevanceReason: "",
    tags: []
  };
}

function extractTitle(text, number) {
  const normalized = cleanText(text);
  const governmentTitleMatches = [...normalized.matchAll(/(?:namens|na-mens) der Landesregierung(?: vom \d{2}\.\d{2}\.\d{4})?\.?\s+(.+?)\s+Anfrage (?:der|des)/gi)];
  for (const match of governmentTitleMatches) {
    const title = cleanTitle(match[1]);
    if (isUsableTitle(title)) return summarize(title, 180);
  }

  const answerMatch = normalized.match(/(?:namens|na-mens) der Landesregierung(?: vom \d{2}\.\d{2}\.\d{4})?\s+(.+?)\s+(?:Anfrage der|Anfrage des|Vorbemerkung|1\.)/i);
  if (answerMatch) {
    const title = cleanTitle(answerMatch[1]);
    if (isUsableTitle(title)) return summarize(title, 180);
  }

  const requestMatch = normalized.match(/(?:Kleine Anfrage|Antrag|Gesetzentwurf|Unterrichtung)[^.]{0,260}?\s+(.+?)\s+(?:Anfrage der|Anfrage des|Der Landtag|Begründung|Begruendung|Vorbemerkung|1\.)/i);
  if (requestMatch) {
    const title = cleanTitle(requestMatch[1]);
    if (isUsableTitle(title)) return summarize(title, 180);
  }

  const inquiryMatch = normalized.match(/(?:Anfrage der|Anfrage des)\s+.+?,\s+eingegangen am \d{2}\.\d{2}\.\d{4}\s+(.+?)\s+(?:und Antwort|Antwort|Vorbemerkung|1\.)/i);
  if (inquiryMatch) {
    const title = cleanTitle(inquiryMatch[1]);
    if (isUsableTitle(title)) return summarize(title, 180);
  }

  const relevantSentence = normalized
    .split(/(?<=[.!?])\s+/)
    .map(cleanTitle)
    .find((sentence) => isUsableTitle(sentence) && evaluateImportQuality({ title: sentence, summaryShort: "", summaryLong: "", documentType: "", source: "" }).score >= 5);

  return summarize(cleanTitle(relevantSentence ?? `Niedersaechsische Landtagsdrucksache ${wahlperiode}/${number}`), 180);
}

function extractDate(text) {
  const match = cleanText(text).match(/(?:vom|eingegangen am|Verteilt am)\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return new Date().toISOString().slice(0, 10);
}

function extractDocumentType(text, title) {
  const value = `${text} ${title}`.toLocaleLowerCase("de-DE");
  if (value.includes("gesetzentwurf") || value.includes("entwurf eines gesetzes")) return "Gesetzentwurf";
  if (value.includes("kleine anfrage")) return value.includes("antwort der landesregierung") ? "Antwort" : "Kleine Anfrage";
  if (value.includes("antrag")) return "Antrag";
  if (value.includes("unterrichtung")) return "Unterrichtung";
  return "Drucksache";
}

function extractSummary(text, title) {
  const normalized = cleanText(text);
  const titleIndex = normalized.indexOf(title);
  if (titleIndex >= 0) return normalized.slice(titleIndex, titleIndex + 700);
  return normalized.slice(0, 700);
}

function evaluateImportQuality(document) {
  const haystack = normalizeForSearch([document.title, document.documentType, document.summaryShort, document.summaryLong, document.source].join(" "));
  const compactHaystack = haystack.replace(/\s+/g, "");

  const strongMatches = findTermMatches(haystack, compactHaystack, relevanceTerms.strong);
  const mediumMatches = findTermMatches(haystack, compactHaystack, relevanceTerms.medium);
  const weakMatches = findTermMatches(haystack, compactHaystack, relevanceTerms.weak);
  const exclusionMatches = findTermMatches(haystack, compactHaystack, falsePositiveTerms);

  const score = strongMatches.length * 5 + mediumMatches.length * 2 + Math.min(weakMatches.length, 4) - exclusionMatches.length * 5;
  const hasCoreSignal = strongMatches.length > 0;
  const hasProcessSignal = mediumMatches.some((term) => ["bergrecht", "bergbau", "betriebsplan", "genehmigungsverfahren", "genehmigung", "planfeststellung", "planfeststellungsverfahren", "leitungsbau"].includes(normalizeForSearch(term)));
  const blockedAsFalsePositive = exclusionMatches.length >= 2 && strongMatches.length < 2;

  return {
    isRelevant: !blockedAsFalsePositive && (score >= 8 || (hasCoreSignal && score >= 5) || (hasProcessSignal && score >= 6)),
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
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return pattern.test(haystack);
}

function extractPdfText(buffer) {
  const source = buffer.toString("latin1");
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const chunks = [];
  let match;

  while ((match = streamPattern.exec(source))) {
    let stream = Buffer.from(match[1], "latin1");
    try {
      stream = inflateSync(stream);
    } catch {
      // Some PDF streams are uncompressed or use filters this lightweight extractor does not support.
    }

    const textStream = stream.toString("latin1");
    if (/(Tj|TJ|Tf)/.test(textStream)) {
      chunks.push(extractPdfStrings(textStream));
    }
  }

  return chunks.join(" ");
}

function extractPdfStrings(value) {
  const texts = [];
  const textCommandPattern = /\((?:\\.|[^\\()])*\)\s*Tj|\[((?:\s*\((?:\\.|[^\\()])*\)\s*[-\d.]*\s*)+)\]\s*TJ/g;
  let commandMatch;

  while ((commandMatch = textCommandPattern.exec(value))) {
    const literalPattern = /\((?:\\.|[^\\()])*\)/g;
    let literalMatch;
    while ((literalMatch = literalPattern.exec(commandMatch[0]))) {
      texts.push(decodePdfLiteral(literalMatch[0].slice(1, -1)));
    }
  }

  return texts.join(" ");
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, char) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" })[char] ?? char)
    .replace(/\\(\d{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function repairPdfSpacing(value) {
  return cleanText(
    value
      .split(/ {2,}/)
      .map((part) => part.replace(/ (?=\S)/g, ""))
      .join(" ")
  );
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

function cleanTitle(value) {
  return cleanText(value)
    .replace(/^[-–:]+/, "")
    .replace(/^zur (?:kurzfristigen )?schriftlichen Beantwortung.*?Landesregierung\s*/i, "")
    .replace(/^zur (?:kurzfristigen )?schriftlichen Beantwortung.*?GO LT\s+Abgeordnete?r?\s+.+?\)\s+/i, "")
    .replace(/^mit Antwort der Landesregierung\s*/i, "")
    .replace(/^Antwort der Landesregierung\s*/i, "")
    .replace(/\s+-\s+Drs\.\s+\d+\/\d+.*$/i, "")
    .replace(/\s+/g, " ");
}

function isUsableTitle(value) {
  const title = cleanText(value);
  const normalized = normalizeForSearch(title);
  if (title.length < 12) return false;
  if (normalized.includes("schriftlichen beantwortung") && normalized.includes("landesregierung")) return false;
  if (normalized.startsWith("drucksache")) return false;
  if (normalized.startsWith("kleine anfrage")) return false;
  if (normalized.startsWith("antwort namens der landesregierung")) return false;
  return true;
}

function summarize(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "Keine Kurzbeschreibung in der Quelle verfuegbar.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function pad5(value) {
  return String(value).padStart(5, "0");
}

function relativeToProject(path) {
  return path.replace(`${projectRoot}\\`, "").replaceAll("\\", "/");
}
