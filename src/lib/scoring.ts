import taxonomy from "../data/taxonomy.json";
import type { RegulatoryDocument, ScoreBucket, TaxonomyCategory } from "../types";

const categories = taxonomy as TaxonomyCategory[];

const documentTypeWeights: Record<string, number> = {
  Gesetzentwurf: 18,
  Verordnung: 16,
  Drucksache: 12,
  Bekanntmachung: 12,
  "Kleine Anfrage": 10,
  Plenarprotokoll: 8,
  Antrag: 8,
  Pressemitteilung: 5
};

const sourceTypeWeights: Record<RegulatoryDocument["sourceType"], number> = {
  Parlament: 10,
  Verkuendung: 12,
  Ministerium: 7,
  Behoerde: 8,
  Sonstige: 3
};

export function enrichDocument(document: RegulatoryDocument): RegulatoryDocument {
  const matches = findTaxonomyMatches(document);
  const tags = matches.map((match) => match.category.label);
  const recencyBoost = getRecencyBoost(document.lastActivityDate);
  const directHitScore = matches.reduce((sum, match) => sum + match.category.weight + Math.min(match.count * 2, 8), 0);
  const documentTypeScore = documentTypeWeights[document.documentType] ?? 6;
  const sourceScore = sourceTypeWeights[document.sourceType] ?? 4;
  const levelBoost = document.level === "Niedersachsen" && tags.some((tag) => ["Erdgas", "Foerderung", "Bergrecht"].includes(tag)) ? 8 : 0;

  const relevanceScore = clamp(Math.round(directHitScore + documentTypeScore + sourceScore + recencyBoost + levelBoost), 12, 98);

  return {
    ...document,
    tags,
    relevanceScore,
    relevanceReason: buildReason(document, tags, recencyBoost, levelBoost)
  };
}

export function getScoreBucket(score: number): ScoreBucket {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function isNewToday(lastActivityDate: string, now = new Date()): boolean {
  const activity = new Date(lastActivityDate);
  const diffMs = now.getTime() - activity.getTime();
  return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
}

function findTaxonomyMatches(document: RegulatoryDocument) {
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

  return categories
    .map((category) => {
      const count = category.keywords.filter((keyword) => haystack.includes(keyword.toLocaleLowerCase("de-DE"))).length;
      return { category, count };
    })
    .filter((match) => match.count > 0)
    .sort((a, b) => b.category.weight + b.count - (a.category.weight + a.count));
}

function getRecencyBoost(lastActivityDate: string): number {
  if (isNewToday(lastActivityDate)) return 12;

  const daysOld = Math.max(0, Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (24 * 60 * 60 * 1000)));
  if (daysOld <= 3) return 7;
  if (daysOld <= 7) return 4;
  return 0;
}

function buildReason(document: RegulatoryDocument, tags: string[], recencyBoost: number, levelBoost: number): string {
  const parts = [];

  if (tags.length > 0) {
    parts.push(`Taxonomie-Treffer: ${tags.slice(0, 3).join(", ")}`);
  } else {
    parts.push("Kein direkter Taxonomie-Treffer, aber regulatorischer Kontext");
  }

  parts.push(`${document.documentType} aus ${document.source}`);

  if (recencyBoost >= 12) {
    parts.push("neue oder aktualisierte Aktivitaet innerhalb von 24 Stunden");
  }

  if (levelBoost > 0) {
    parts.push("Niedersachsen-Bezug mit Foerderungs-/Bergrechtsnaehe");
  }

  return `${parts.join("; ")}.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
