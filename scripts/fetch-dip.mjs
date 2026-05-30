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
const scanLimit = Number(process.env.DIP_SCAN_LIMIT ?? 1200);
const wahlperiode = process.env.DIP_WAHLPERIODE ?? "21";
const legacyStartDate = process.env.DIP_LEGACY_START_DATE ?? "2025-03-25";
const useLegacyMode = process.env.DIP_LEGACY_MODE !== "false";
const startDate = process.env.DIP_START_DATE ?? toDateOnly(daysAgo(lookbackDays));

const relevanceTerms = {
  strong: [
    "erdgas",
    "gasversorgung",
    "gasinfrastruktur",
    "gasnetz",
    "gasspeicher",
    "gasleitung",
    "lng",
    "gas und wasserstoff",
    "gas und wasserstoff binnenmarktpaket",
    "gasbinnenmarkt",
    "methan",
    "methanemission",
    "pipeline",
    "rohoel",
    "erdoel",
    "oelfoerderung",
    "oelversorgung",
    "oelpreis",
    "oelmarkt",
    "oelindustrie",
    "oelkonzern",
    "oelunternehmen",
    "oelleitung",
    "oelpipeline",
    "oelterminal",
    "heizoel",
    "mineraloel",
    "raffinerie",
    "oelraffinerie",
    "oel und gas",
    "ccs",
    "carbon capture and storage",
    "co2 speicher",
    "co2 speicherung",
    "co2-speicher",
    "co2-speicherung",
    "kohlenstoffspeicher",
    "kohlenstoffspeicherung",
    "kohlenstofftransport",
    "co2 transport",
    "co2 pipeline",
    "negativemission",
    "negativemissionen",
    "negative emission",
    "negative emissionen",
    "kohlenwasserstoff",
    "kohlenwasserstoffe",
    "meeresschutzgebiet",
    "meeresschutzgebiete",
    "unitarisierungsabkommen",
    "unitisierung",
    "niederlande"
  ],
  medium: [
    "bergrecht",
    "bergbau",
    "bohrung",
    "bohrloch",
    "erdgasfoerderung",
    "erdoelfoerderung",
    "gasfoerderung",
    "oelfoerderung",
    "rohstofffoerderung",
    "foerderstandort",
    "betriebsplan",
    "energieinfrastruktur",
    "energiewirtschaft",
    "speicheranlage",
    "speicher",
    "terminal",
    "wassergefaehrdend",
    "carbon management",
    "ccu",
    "co2 lagerstaette",
    "co2 leitung",
    "co2 transportnetz",
    "kohlendioxid",
    "kohlendioxidspeicherung",
    "kohlenstoffabscheidung",
    "kohlenstofftransport",
    "offshore foerderung",
    "meeresschutz",
    "grenzueberschreitende lagerstaette",
    "lagerstaettenabkommen",
    "kohlenwasserstoffvorkommen"
  ],
  weak: [
    "emission",
    "emissionen",
    "industrieemission",
    "genehmigung",
    "genehmigungsverfahren",
    "planfeststellung",
    "meldepflicht",
    "meldepflichten",
    "transportinfrastruktur",
    "netzanschluss"
  ]
};

const falsePositiveTerms = [
  "stromspeicher",
  "batteriespeicher",
  "waermespeicher",
  "datenspeicher",
  "flughafen",
  "containerterminal",
  "personennahverkehr",
  "schienenverkehr",
  "gesundheitswesen",
  "krankenhaus",
  "rentenversicherung",
  "kindertagesstaette",
  "schule",
  "hochschule",
  "wohnungslosigkeit",
  "wohnungsbau",
  "waermepumpe",
  "gebaeudesektor",
  "elektromobilitaet",
  "ladeinfrastruktur",
  "tourismus",
  "tourist",
  "anwalt",
  "anwaltsnotariat",
  "notariat",
  "notar",
  "schuldnerberatung",
  "verbraucher",
  "informationsfreiheit",
  "open data"
];

if (process.argv.includes("--analyze-current")) {
  const currentDocuments = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  const evaluatedDocuments = currentDocuments.map(addImportQuality);
  const kept = evaluatedDocuments.filter((document) => document.importQuality.isRelevant);
  const dropped = evaluatedDocuments.filter((document) => !document.importQuality.isRelevant);

  console.log(`Importanalyse fuer ${relativeToProject(OUTPUT_PATH)}`);
  console.log(`Behalten: ${kept.length}`);
  console.log(`Herausfiltern: ${dropped.length}`);

  for (const document of evaluatedDocuments) {
    const quality = document.importQuality;
    const decision = quality.isRelevant ? "KEEP" : "DROP";
    const matches = [
      quality.matchedTerms.strong.length > 0 ? `strong=${quality.matchedTerms.strong.join(",")}` : "",
      quality.matchedTerms.medium.length > 0 ? `medium=${quality.matchedTerms.medium.join(",")}` : "",
      quality.matchedTerms.weak.length > 0 ? `weak=${quality.matchedTerms.weak.join(",")}` : "",
      quality.matchedTerms.exclusions.length > 0 ? `exclusions=${quality.matchedTerms.exclusions.join(",")}` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    console.log(`${decision} score=${quality.score} ${document.id}: ${document.title}${matches ? ` (${matches})` : ""}`);
  }

  process.exit(0);
}

if (process.argv.includes("--test-filters")) {
  const cases = [
    {
      title: "Gesetz ueber den Zugang zu Schuldnerberatungsdiensten fuer Verbraucher",
      expected: false
    },
    {
      title: "Moegliche finanzielle Risiken fuer Deutschland durch die Verschuldung Frankreichs und moegliche Belastungen fuer die Eurozone",
      expected: false
    },
    {
      title: "Zustaendigkeiten und Reformvorhaben der Bundesregierung im Bereich Informationsfreiheit und Open Data",
      expected: false
    },
    {
      title: "Finanzierungsformen der rechtsextremen Szene seit 2024",
      expected: false
    },
    {
      title: "Foerderung touristischer Infrastruktur in Mecklenburg-Vorpommern",
      expected: false
    },
    {
      title: "Entwurf eines Gesetzes zur Foerderung und Modernisierung des Anwaltsnotariats",
      expected: false
    },
    {
      title: "Speicherungsanlaesse in der Datei Gewalttaeter Sport und Datenuebermittlung in die USA, Kanada und Mexiko anlaesslich der Fussball-Weltmeisterschaft 2026",
      expected: false
    },
    {
      title: "Entwurf eines Gesetzes zur Einfuehrung einer IP-Adressspeicherung und Weiterentwicklung der Befugnisse zur Datenerhebung im Strafverfahren",
      expected: false
    },
    {
      title: "Gesetz zur Aenderung des Energiewirtschaftsgesetzes und weiterer energierechtlicher Vorschriften zur Umsetzung des Europaeischen Gas- und Wasserstoff-Binnenmarktpakets",
      expected: true
    },
    {
      title: "Bundesratsinitiative zur Umsetzung der EU-Methanverordnung im Energiesektor",
      summaryShort: "Neue Berichtspflichten und Messvorgaben fuer Methanemissionen in Gasinfrastruktur.",
      expected: true
    },
    {
      title: "Carbon Capture and Storage: Aufbau einer CO2-Transportinfrastruktur und Kohlenstoffspeicher",
      expected: true
    },
    {
      title: "Negativemissionen durch CCS und CO2-Speicherung rechtssicher ermoeglichen",
      expected: true
    },
    {
      title: "Verbot der Foerderung von Kohlenwasserstoffen in Meeresschutzgebieten",
      expected: true
    },
    {
      title: "Unitarisierungsabkommen mit den Niederlanden ueber grenzueberschreitende Kohlenwasserstoffvorkommen",
      expected: true
    }
  ];

  let failures = 0;

  for (const testCase of cases) {
    const document = {
      id: "test",
      title: testCase.title,
      source: "BT DIP",
      sourceType: "Parlament",
      level: "Bund",
      documentType: "Test",
      date: "2026-05-16",
      lastActivityDate: "2026-05-16T00:00:00+02:00",
      status: "Test",
      url: "https://dip.bundestag.de/",
      summaryShort: testCase.summaryShort ?? `${testCase.title}: BT DIP`,
      summaryLong: testCase.summaryLong ?? "",
      relevanceScore: 0,
      relevanceReason: "",
      tags: []
    };
    const quality = evaluateImportQuality(document);
    const ok = quality.isRelevant === testCase.expected;
    if (!ok) failures += 1;

    console.log(`${ok ? "OK" : "FAIL"} expected=${testCase.expected ? "KEEP" : "DROP"} actual=${quality.isRelevant ? "KEEP" : "DROP"} score=${quality.score}: ${testCase.title}`);
  }

  if (failures > 0) process.exit(1);
  process.exit(0);
}

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
  .map(addImportQuality)
  .filter((document) => document.importQuality.isRelevant)
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
  const params = useLegacyMode
    ? {
        "f.wahlperiode": wahlperiode,
        "f.datum.start": legacyStartDate
      }
    : {
        "f.aktualisiert.start": `${startDate}T00:00:00+02:00`
      };

  const [vorgaenge, drucksachen] = await Promise.all([
    fetchAllPages("vorgang", params),
    fetchAllPages("drucksache", params)
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
  } while (cursor && cursor !== previousCursor && documents.length < scanLimit);

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
  return evaluateImportQuality(document).isRelevant;
}

function addImportQuality(document) {
  return {
    ...document,
    importQuality: evaluateImportQuality(document)
  };
}

function evaluateImportQuality(document) {
  const haystack = normalizeForSearch(
    [
      document.title,
      document.documentType,
      document.status,
      document.summaryShort,
      document.summaryLong,
      document.source
    ].join(" ")
  );

  const strongMatches = findTermMatches(haystack, relevanceTerms.strong);
  const mediumMatches = findTermMatches(haystack, relevanceTerms.medium);
  const weakMatches = findTermMatches(haystack, relevanceTerms.weak);
  const exclusionMatches = findTermMatches(haystack, falsePositiveTerms);

  const strongScore = strongMatches.length * 4;
  const mediumScore = mediumMatches.length * 2;
  const weakScore = Math.min(weakMatches.length, 3);
  const penalty = exclusionMatches.length * 3;
  const score = strongScore + mediumScore + weakScore - penalty;

  const hasCoreSignal = strongMatches.length > 0;
  const hasCompoundMediumSignal = mediumMatches.length >= 2;
  const hasOnlyWeakSignal = strongMatches.length === 0 && mediumMatches.length === 0 && weakMatches.length > 0;
  const blockedAsFalsePositive = exclusionMatches.length > 0 && !hasCoreSignal;
  const hasEnoughEvidence = score >= 8 || (strongMatches.length >= 2 && score >= 6) || (strongMatches.length >= 1 && mediumMatches.length >= 1 && score >= 6);

  return {
    isRelevant: !blockedAsFalsePositive && !hasOnlyWeakSignal && hasEnoughEvidence && (hasCoreSignal || hasCompoundMediumSignal),
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
  if (document.vorgangsbezug?.[0]?.id) return buildDipVorgangUrl(document.vorgangsbezug[0].id, document.titel);
  if (document.typ === "Vorgang") return buildDipVorgangUrl(document.id, document.titel);
  return "https://dip.bundestag.de/";
}

function buildDipVorgangUrl(id, title) {
  const slug = slugifyForDip(title);
  if (!slug) return `https://dip.bundestag.de/suche?term=${encodeURIComponent(id)}`;
  return `https://dip.bundestag.de/vorgang/${slug}/${encodeURIComponent(id)}`;
}

function slugifyForDip(value) {
  return cleanText(value)
    .toLocaleLowerCase("de-DE")
    .replace(/["'„“”‚‘’]/g, "")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function getDescriptorText(descriptor) {
  if (typeof descriptor === "string") return descriptor;
  return cleanText(descriptor?.begriff ?? descriptor?.name ?? descriptor?.titel);
}

function summarize(value, maxLength) {
  const text = cleanText(value);
  if (!text) return "Keine Kurzbeschreibung in der Quelle verfuegbar.";
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
