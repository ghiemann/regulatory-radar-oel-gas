/**
 * Shared document utilities for Regulatory Radar v2.
 *
 * PUBLIC DATA ONLY.
 *
 * This module must not contain:
 * - Harbour Energy positions
 * - internal assessments
 * - confidential information
 * - internal relevance scoring
 * - information from internal emails, Teams or SharePoint
 */

/**
 * Normalises text for matching and deduplication.
 *
 * Examples:
 * "CO₂-Speicherung" -> "co2 speicherung"
 * "Erdgasförderung" -> "erdgasfoerderung"
 */
export function normalizeText(value = "") {
  return String(value)
    .toLocaleLowerCase("de-DE")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replaceAll("₂", "2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes common HTML and formatting artefacts from text
 * retrieved from public websites.
 */
export function cleanText(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns a YYYY-MM-DD date where possible.
 *
 * Invalid or missing values return an empty string rather
 * than creating a false date.
 */
export function toIsoDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Creates the timestamp used when Regulatory Radar first
 * detects or checks a record.
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Creates a stable, URL-friendly identifier.
 *
 * This will later help with policyFileId generation.
 */
export function createSlug(value = "") {
  return normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Checks whether a value contains a search term after
 * German-language normalisation.
 */
export function containsTerm(value, term) {
  const haystack = normalizeText(value);
  const needle = normalizeText(term);

  if (!haystack || !needle) {
    return false;
  }

  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Returns all matching terms from a supplied list.
 */
export function findMatchingTerms(value, terms = []) {
  return terms.filter((term) =>
    containsTerm(value, term)
  );
}

/**
 * Removes obvious duplicate records.
 *
 * Priority:
 * 1. identical IDs
 * 2. identical canonical URLs
 *
 * More sophisticated policy-level deduplication will be
 * introduced later.
 */
export function deduplicateDocuments(documents = []) {
  const seenIds = new Set();
  const seenUrls = new Set();

  return documents.filter((document) => {
    const id = String(document?.id ?? "").trim();

    const url = canonicalizeUrl(
      document?.url ?? ""
    );

    if (id && seenIds.has(id)) {
      return false;
    }

    if (url && seenUrls.has(url)) {
      return false;
    }

    if (id) {
      seenIds.add(id);
    }

    if (url) {
      seenUrls.add(url);
    }

    return true;
  });
}

/**
 * Removes fragments and common tracking parameters so the
 * same official document does not appear as several URLs.
 */
export function canonicalizeUrl(value = "") {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);

    url.hash = "";

    const trackingParameters = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content"
    ];

    for (const parameter of trackingParameters) {
      url.searchParams.delete(parameter);
    }

    return url.toString();
  } catch {
    return String(value).trim();
  }
}

/**
 * Creates the initial public verification status.
 *
 * For the current Regulatory Radar importers the source
 * websites are official public institutions, so records
 * retrieved directly from those sources can be marked as
 * primary-source.
 *
 * Future secondary sources should explicitly supply a
 * different status.
 */
export function getVerificationStatus(
  isPrimarySource = true
) {
  return isPrimarySource
    ? "primary-source"
    : "unverified";
}

/**
 * Basic quality check for imported public records.
 *
 * It does not reject records. It identifies records that
 * should receive additional review.
 */
export function assessImportQuality(document) {
  const issues = [];

  if (!document?.id) {
    issues.push("missing-id");
  }

  if (!document?.title) {
    issues.push("missing-title");
  }

  if (!document?.url) {
    issues.push("missing-url");
  }

  if (
    document?.url &&
    !/^https?:\/\//i.test(document.url)
  ) {
    issues.push("invalid-url");
  }

  if (
    !document?.summaryShort &&
    !document?.summaryLong
  ) {
    issues.push("missing-summary");
  }

  if (issues.length === 0) {
    return {
      status: "clean",
      issues: []
    };
  }

  const seriousIssues = new Set([
    "missing-id",
    "missing-title",
    "missing-url",
    "invalid-url"
  ]);

  const needsManualReview = issues.some(
    (issue) => seriousIssues.has(issue)
  );

  return {
    status: needsManualReview
      ? "manual-review"
      : "warning",
    issues
  };
}

/** Keep the last item for each key, retaining the key's first position.
 * Unlike deduplicateDocuments, this intentionally also groups missing keys.
 */
export function dedupeById(items, getId) {
  const result = new Map();
  for (const item of items) result.set(getId(item), item);
  return [...result.values()];
}

/** Comparator matching the importers' existing activity-date ordering. */
export function sortByActivityDesc(a, b) {
  return new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime();
}
