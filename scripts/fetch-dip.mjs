import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const API_BASE_URL = "https://search.dip.bundestag.de/api/v1";
const OUTPUT_PATH = resolve(projectRoot, "public/data/documents.json");
const FALLBACK_PATH = resolve(projectRoot, "public/data/documents.mock.json");

await loadDotEnv();

const apiKey = process.env.DIP_API_KEY;
const lookbackDays = Number(process.env.DIP_LOOKBACK_DAYS ?? 45);
const maxDocuments = Number(process.env.DIP_MAX_DOCUMENTS ?? 60);
const startDate = process.env.DIP_START_DATE ?? toDateOnly(daysAgo(lookbackDays));

const relevanceKeywords = [
  "erdgas",
  "gasversorgung",
  "lng",
  "gasnetz",
  "gasspeicher",
  "pipeline",
  "speicher",
  "terminal",
  "methan",
  "methanemission",
  "emissionen",
  "raffinerie",
  "mineraloel",
  "oel",
  "rohoel",
  "bergrecht",
  "bergbau",
  "bohrung",
  "foerderung",
  "betriebsplan",
  "genehmigung",
  "planfeststellung",
  "energieinfrastruktur",
  "energiewirtschaft",
  "wassergefaehrdend"
];

if (!apiKey) {
  console.error(
    [
      "DIP_API_KEY fehlt.",
      "Lege den DIP-API-Key lokal als Umgebungsvariable oder in GitHub als Secret an.",
      "PowerShell lokal:",
      "  $env:DIP_API_KEY='DEIN_API_KEY'",
      "  npm.cmd run fetch:dip",
      "GitHub: Repository > Settings > Secrets and variables > Actions > New repository secret."
    ].join("\n")
  );
  process.exit(1);
}

const dipDocuments = await fetchDipDocuments();
const normalizedDocuments = dipDocuments
  .map(normalizeDipDocument)
  .filter(Boolean)
  .filter(isRelevantDocument)
  .sort((a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime())
  .slice(0, maxDocuments);

if (normalizedDocuments.length === 0) {
  console.warn("Keine relevanten DIP-Dokumente gefunden. Die bestehende documents.json wird nicht ueberschrieben.");
  process.exit(0);
}

await ensureFallbackExists();
await writeJson(OUTPUT_PATH, normalizedDocuments);

console.log(`DIP-Import abgeschlossen: ${normalizedDocuments.length} Dokumente nach ${relativeToProject(OUTPUT_PATH)} geschrieben.`);

async function fetchDipDocuments() {
  const [vorgaenge, drucksachen] = await Promise.all([
    fetchAllPages("vorgang", {
      "f.aktualisiert.start": `${startDate}T00:00:00+02:00`
    }),
    fetchAllPages("drucksache", {
      "f.aktualisiert.start": `${startDate}T00:00:00+02:00`
    })
  ]);

  return dedupeById([...vorgaenge, ...drucksachen], (document) => `${document.typ ?? "dip"}-${document.id}`);
}

async function fetchAllPages(resource, params) {
  const documents = [];
  let cursor = "";
  let previousCursor = null;

  do {
    const page = await fetchDipPage(resource, { ...params, ...(cursor ? { cursor } : {}) });
    documents.push(...(Array.isArray(page.documents) ? page.documents : []));
    previousCursor = cursor;
    cursor = page.cursor ?? "";
  } while (cursor && cursor !== previousCursor && documents.length < maxDocuments * 4);

  return documents;
}

async function fetchDipPage(resource, params) {
  const url = new URL(`${API_BASE_URL}/${resource}`);
  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `ApiKey ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`DIP ${resource} request failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function normalizeDipDocument(document) {
  const typ = stringValue(document.typ);
  const title = cleanText(document.titel);
  const abstract = cleanText(document.abstract);

  if (!document.id || !title) return null;

  const documentType = getDocumentType(document);
  const date = toDateOnly(firstString(document.datum, document.aktualisiert, new Date().toISOString()));
  const lastActivityDate = firstString(document.aktualisiert, document.datum, new Date().toISOString());
  const source = getSource(document);
  const status = cleanText(firstString(document.beratungsstand, document.vorgangsposition, document.drucksachetyp, "Aktualisiert"));

  const summaryShort = summarize(
    abstract ||
      [
        documentType,
        source,
        Array.isArray(document.sachgebiet) ? document.sachgebiet.join(", ") : "",
        Array.isArray(document.initiative) ? document.initiative.join(", ") : ""
      ]
        .filter(Boolean)
        .join(": "),
    180
  );

  const summaryLong = summarize(
    [
      abstract,
      Array.isArray(document.initiative) && document.initiative.length > 0 ? `Initiative: ${document.initiative.join(", ")}.` : "",
      Array.isArray(document.sachgebiet) && document.sachgebiet.length > 0 ? `Sachgebiet: ${document.sachgebiet.join(", ")}.` : "",
      Array.isArray(document.deskriptor) && document.deskriptor.length > 0 ? `Deskriptoren: ${document.deskriptor.map(getDescriptorText).filter(Boolean).join(", ")}.` : ""
    ]
      .filter(Boolean)
      .join(" "),
    700
  );

  return {
    id: `dip-${typ.toLowerCase() || "document"}-${document.id}`,
    title,
    source,
    sourceType: "Parlament",
    level: "Bund",
    documentType,
    date,
    lastActivityDate,
    status,
    url: getDipUrl(document),
    summaryShort,
    summaryLong,
    relevanceScore: 0,
    relevanceReason: "",
    tags: []
  };
}

function isRelevantDocument(document) {
  const haystack = [
    document.title,
    document.documentType,
    document.status,
    document.summaryShort,
    document.summaryLong,
    document.source
  ]
    .join(" ")
    .toLocaleLowerCase("de-DE");

  return relevanceKeywords.some((keyword) => haystack.includes(keyword));
}

function getDocumentType(document) {
  const candidates = [
    document.vorgangstyp,
    document.drucksachetyp,
    document.dokumentart,
    document.vorgangsposition,
    document.typ
  ].map(cleanText);

  const label = candidates.find(Boolean) || "DIP-Dokument";
  const normalized = label.toLocaleLowerCase("de-DE");

  if (normalized.includes("gesetzentwurf")) return "Gesetzentwurf";
  if (normalized.includes("verordnung")) return "Verordnung";
  if (normalized.includes("drucksache")) return "Drucksache";
  if (normalized.includes("kleine anfrage")) return "Kleine Anfrage";
  if (normalized.includes("antrag")) return "Antrag";
  if (normalized.includes("plenar")) return "Plenarprotokoll";

  return label;
}

function getSource(document) {
  const publisher = cleanText(document.herausgeber);
  const assignment = cleanText(document.zuordnung);

  if (publisher) return `${publisher} DIP`;
  if (assignment) return `${assignment} DIP`;
  return "Bundestag/Bundesrat DIP";
}

function getDipUrl(document) {
  if (document.fundstelle?.pdf_url) return document.fundstelle.pdf_url;
  if (document.pdf_url) return document.pdf_url;
  if (document.vorgangsbezug?.[0]?.id) return `https://dip.bundestag.de/vorgang/${document.vorgangsbezug[0].id}`;
  if (document.typ === "Vorgang") return `https://dip.bundestag.de/vorgang/${document.id}`;
  return "https://dip.bundestag.de/";
}

function getDescriptorText(descriptor) {
  if (typeof descriptor === "string") return descriptor;
  return cleanText(descriptor?.begriff ?? descriptor?.name ?? descriptor?.titel);
}

function summarize(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "DIP-Dokument mit moeglicher Relevanz fuer Oel- und Gas-Monitoring.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function cleanText(value) {
  return stringValue(value).replace(/\s+/g, " ").trim();
}

function firstString(...values) {
  return values.map(stringValue).find(Boolean) ?? "";
}

function stringValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(", ");
  if (typeof value === "object") return stringValue(value.name ?? value.bezeichnung ?? value.titel ?? value.id);
  return String(value);
}

function dedupeById(items, getId) {
  const result = new Map();
  for (const item of items) {
    result.set(getId(item), item);
  }
  return [...result.values()];
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function ensureFallbackExists() {
  try {
    await readFile(FALLBACK_PATH, "utf8");
  } catch {
    const current = await readFile(OUTPUT_PATH, "utf8");
    await writeFile(FALLBACK_PATH, current, "utf8");
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function relativeToProject(path) {
  return path.replace(`${projectRoot}\\`, "").replaceAll("\\", "/");
}

async function loadDotEnv() {
  try {
    const file = await readFile(resolve(projectRoot, ".env"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional; GitHub Actions uses repository secrets instead.
  }
}
