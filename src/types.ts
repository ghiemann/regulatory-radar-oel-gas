export type Level = "Bund" | "Niedersachsen";

export type SourceType =
  | "Parlament"
  | "Ministerium"
  | "Behoerde"
  | "Verkuendung"
  | "Sonstige";

export type RegulatoryDocument = {
  id: string;
  title: string;
  source: string;
  sourceType: SourceType;
  level: Level;
  documentType: string;
  date: string;
  lastActivityDate: string;
  status: string;
  url: string;
  summaryShort: string;
  summaryLong: string;
  relevanceScore: number;
  relevanceReason: string;
  tags: string[];
};

export type TaxonomyCategory = {
  id: string;
  label: string;
  weight: number;
  keywords: string[];
};

export type ScoreBucket = "high" | "medium" | "low";
