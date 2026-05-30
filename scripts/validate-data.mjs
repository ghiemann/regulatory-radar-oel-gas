import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const DATA_PATH = resolve(projectRoot, "public/data/documents.json");

const requiredFields = [
  "id",
  "title",
  "source",
  "sourceType",
  "level",
  "documentType",
  "date",
  "lastActivityDate",
  "status",
  "url",
  "summaryShort",
  "summaryLong"
];

const blockedIdPrefixes = ["mock-", "ltnds-"];
const blockedUrlPatterns = [
  /^https:\/\/www\.landtag-niedersachsen\.de\/drucksachen\/?$/i,
  /^https:\/\/www\.landtag-niedersachsen\.de\/plenarprotokolle\/?$/i,
  /^https:\/\/dip\.bundestag\.de\/?$/i,
  /^https:\/\/www\.bundesrat\.de\/DE\/dokumente\/drucksachen\/drucksachen-node\.html$/i,
  /^https:\/\/www\.bmuv\.de\/presse\/?$/i,
  /^https:\/\/www\.bmukn\.de\/presse\/?$/i,
  /^https:\/\/www\.bundeswirtschaftsministerium\.de\/?$/i
];

const warnings = [];
const errors = [];

const documents = JSON.parse(await readFile(DATA_PATH, "utf8"));

if (!Array.isArray(documents)) {
  fail("ROOT", "documents.json muss ein JSON-Array sein.");
  reportAndExit();
}

const ids = new Map();
const urls = new Map();
const titleDateKeys = new Map();

for (const [index, document] of documents.entries()) {
  const label = getLabel(document, index);

  for (const field of requiredFields) {
    if (!hasText(document[field])) {
      fail(label, `Pflichtfeld fehlt oder ist leer: ${field}`);
    }
  }

  const id = String(document.id ?? "");
  if (blockedIdPrefixes.some((prefix) => id.startsWith(prefix))) {
    fail(label, `Legacy-/Mock-ID ist nicht erlaubt: ${id}`);
  }

  const url = String(document.url ?? "").trim();
  if (url && !url.startsWith("https://")) {
    fail(label, `URL muss mit https:// beginnen: ${url}`);
  }

  if (blockedUrlPatterns.some((pattern) => pattern.test(url))) {
    fail(label, `Generische Platzhalter-URL ist nicht erlaubt: ${url}`);
  }

  if (url.includes("/error_path/")) {
    fail(label, `Fehlerseiten-URL ist nicht erlaubt: ${url}`);
  }

  if (id) addDuplicateCheck(ids, id, label, "ID", fail);
  if (url) addDuplicateCheck(urls, normalizeUrl(url), label, "URL", warn);

  const titleDateKey = `${normalizeText(document.title)}|${document.date}`;
  if (hasText(document.title) && hasText(document.date)) {
    addDuplicateCheck(titleDateKeys, titleDateKey, label, "Titel+Datum", warn);
  }

  validateDate(label, "date", document.date, false);
  validateDate(label, "lastActivityDate", document.lastActivityDate, true);

  if (!Array.isArray(document.tags)) {
    fail(label, "tags muss ein Array sein.");
  }
}

reportAndExit();

function addDuplicateCheck(map, key, label, fieldName, addFinding) {
  const previous = map.get(key);
  if (previous) {
    addFinding(label, `Doppelter ${fieldName}; bereits vorhanden bei ${previous}.`);
  } else {
    map.set(key, label);
  }
}

function validateDate(label, field, value, allowDateTime) {
  if (!hasText(value)) return;
  const text = String(value);
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateTimePattern = /^\d{4}-\d{2}-\d{2}T/;
  const validShape = allowDateTime ? dateOnlyPattern.test(text) || dateTimePattern.test(text) : dateOnlyPattern.test(text);
  if (!validShape || Number.isNaN(new Date(text).getTime())) {
    fail(label, `${field} hat kein gueltiges Datumsformat: ${text}`);
  }
}

function getLabel(document, index) {
  return document?.id ? String(document.id) : `Eintrag #${index + 1}`;
}

function hasText(value) {
  return String(value ?? "").trim().length > 0;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/[?#].*$/, "").replace(/\/$/, "");
}

function fail(label, message) {
  errors.push({ label, message });
}

function warn(label, message) {
  warnings.push({ label, message });
}

function reportAndExit() {
  console.log(`Datenvalidierung: ${documents.length} Dokumente geprueft.`);

  if (warnings.length > 0) {
    console.log(`\nWarnungen (${warnings.length}):`);
    for (const finding of warnings) {
      console.log(`- ${finding.label}: ${finding.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nFehler (${errors.length}):`);
    for (const finding of errors) {
      console.error(`- ${finding.label}: ${finding.message}`);
    }
    process.exit(1);
  }

  console.log("OK: Keine blockierenden Datenprobleme gefunden.");
}
