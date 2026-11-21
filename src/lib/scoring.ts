import taxonomy from "../data/taxonomy.json";

import type {
  RegulatoryDocument,
  ScoreBucket,
  TaxonomyCategory
} from "../types";

const categories = taxonomy as TaxonomyCategory[];

/**
 * Neutral weighting of public regulatory document types.
 *
 * These values measure regulatory significance, not relevance
 * to Harbour Energy or any other company.
 */
const documentTypeWeights: Record<string, number> = {
  Gesetzentwurf: 20,
  Verordnung: 18,
  Bekanntmachung: 14,
  Drucksache: 12,
  "Kleine Anfrage": 9,
  Plenarprotokoll: 8,
  Antrag: 8,
  Pressemitteilung: 5,
  Presseinformation: 5,
  Neuigkeit: 4
};

/**
 * Neutral weighting of public-source authority.
 *
 * The weights reflect how directly a source represents
 * an official regulatory or legislative process.
 */
const sourceTypeWeights: Record<
  RegulatoryDocument["sourceType"],
  number
> = {
  Parlament: 10,
  Verkuendung: 14,
  Ministerium: 9,
  Behoerde: 9,
  EUInstitution: 10,
  Sonstige: 3
};

/**
 * Enriches a public regulatory record with:
 *
 * - neutral topic tags
 * - regulatory significance score
 * - neutral explanation of that score
 *
 * Legacy relevanceScore/relevanceReason are temporarily populated
 * as aliases so the existing UI can continue to function during
 * the v1 -> v2 migration.
 */
export function enrichDocument(
  document: RegulatoryDocument
): RegulatoryDocument {
  const matches = findTaxonomyMatches(document);

  const tags = matches.map(
    (match) => match.category.label
  );

  const recencyScore = getRecencyScore(
    document.lastActivityDate
  );

  const topicSpecificityScore = calculateTopicSpecificity(
    matches
  );

  const documentTypeScore =
    documentTypeWeights[document.documentType] ?? 6;

  const sourceAuthorityScore =
    sourceTypeWeights[document.sourceType] ?? 4;

  const verificationScore =
    getVerificationScore(document);

  const regulatorySignificanceScore = clamp(
    Math.round(
      topicSpecificityScore +
        documentTypeScore +
        sourceAuthorityScore +
        recencyScore +
        verificationScore
    ),
    10,
    98
  );

  const regulatorySignificanceReason =
    buildSignificanceReason(
      document,
      tags,
      recencyScore,
      verificationScore
    );

  return {
    ...document,
    tags,

    regulatorySignificanceScore,
    regulatorySignificanceReason,

    /**
     * Temporary backwards compatibility.
     *
     * App.tsx can continue to use the old fields until
     * the UI is migrated to the v2 terminology.
     */
    relevanceScore: regulatorySignificanceScore,
    relevanceReason: regulatorySignificanceReason
  };
}

/**
 * Maintains the current high / medium / low display buckets.
 *
 * These buckets now refer to PUBLIC REGULATORY SIGNIFICANCE,
 * not company relevance.
 */
export function getScoreBucket(
  score: number
): ScoreBucket {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

/**
 * Returns true when the record shows activity within the
 * previous 24 hours.
 */
export function isNewToday(
  lastActivityDate: string,
  now = new Date()
): boolean {
  const activity = new Date(lastActivityDate);

  if (Number.isNaN(activity.getTime())) {
    return false;
  }

  const diffMs =
    now.getTime() - activity.getTime();

  return (
    diffMs >= 0 &&
    diffMs <= 24 * 60 * 60 * 1000
  );
}

/**
 * Finds neutral subject-matter matches using taxonomy.json.
 */
function findTaxonomyMatches(
  document: RegulatoryDocument
) {
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

  return categories
    .map((category) => {
      const count = category.keywords.filter(
        (keyword) =>
          includesSearchTerm(haystack, keyword)
      ).length;

      return {
        category,
        count
      };
    })
    .filter((match) => match.count > 0)
    .sort(
      (a, b) =>
        b.category.weight +
        b.count -
        (a.category.weight + a.count)
    );
}

/**
 * Topic-match contribution.
 *
 * Taxonomy weights still help distinguish a precise regulatory
 * match from a generic energy-policy mention.
 *
 * A cap prevents a document containing many keywords from
 * dominating the entire score.
 */
function calculateTopicSpecificity(
  matches: Array<{
    category: TaxonomyCategory;
    count: number;
  }>
): number {
  if (matches.length === 0) {
    return 0;
  }

  const score = matches.reduce(
    (sum, match) =>
      sum +
      match.category.weight +
      Math.min(match.count * 2, 6),
    0
  );

  return Math.min(score, 42);
}

function includesSearchTerm(
  haystack: string,
  term: string
): boolean {
  const normalizedTerm =
    normalizeForSearch(term);

  const allowsCompoundMatch =
    normalizedTerm.length >= 7 &&
    !normalizedTerm.includes(" ");

  if (
    allowsCompoundMatch &&
    haystack.includes(normalizedTerm)
  ) {
    return true;
  }

  const escaped = normalizedTerm.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
    "i"
  );

  return pattern.test(haystack);
}

function normalizeForSearch(
  value: string
): string {
  return value
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

/**
 * Recency is useful for a morning radar but should not make
 * an otherwise weak item appear strategically important.
 */
function getRecencyScore(
  lastActivityDate: string
): number {
  if (isNewToday(lastActivityDate)) {
    return 10;
  }

  const activity =
    new Date(lastActivityDate);

  if (Number.isNaN(activity.getTime())) {
    return 0;
  }

  const daysOld = Math.max(
    0,
    Math.floor(
      (Date.now() - activity.getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );

  if (daysOld <= 3) return 6;
  if (daysOld <= 7) return 3;

  return 0;
}

/**
 * Small verification contribution.
 *
 * Verification cannot by itself turn a weak document
 * into a high-significance record.
 */
function getVerificationScore(
  document: RegulatoryDocument
): number {
  switch (document.verificationStatus) {
    case "primary-source":
      return 8;

    case "secondary-confirmed":
      return 4;

    case "unverified":
    default:
      return 0;
  }
}

function buildSignificanceReason(
  document: RegulatoryDocument,
  tags: string[],
  recencyScore: number,
  verificationScore: number
): string {
  const parts: string[] = [];

  if (tags.length > 0) {
    parts.push(
      `Taxonomie-Treffer: ${tags
        .slice(0, 3)
        .join(", ")}`
    );
  } else {
    parts.push(
      "kein direkter Taxonomie-Treffer"
    );
  }

  parts.push(
    `${document.documentType} aus ${document.source}`
  );

  if (recencyScore >= 10) {
    parts.push(
      "neue oder aktualisierte Aktivitaet innerhalb von 24 Stunden"
    );
  } else if (recencyScore > 0) {
    parts.push(
      "aktuelle regulatorische Aktivitaet"
    );
  }

  if (verificationScore >= 8) {
    parts.push(
      "durch Primaerquelle belegt"
    );
  } else if (verificationScore >= 4) {
    parts.push(
      "durch oeffentliche Sekundaerquelle bestaetigt"
    );
  }

  return `${parts.join("; ")}.`;
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(
    max,
    Math.max(min, value)
  );
}
