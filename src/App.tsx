import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Filter,
  Gauge,
  Newspaper,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import taxonomy from "./data/taxonomy.json";
import { enrichDocument, getScoreBucket, isNewToday } from "./lib/scoring";
import type { Level, RegulatoryDocument, TaxonomyCategory } from "./types";

type View = "briefing" | "today" | "high" | "review";
type SortKey = "score" | "date";
type SignalKind = "Gesetz" | "Vorgang" | "Meldung";
const defaultSortKey: SortKey = "date";

type Filters = {
  query: string;
  level: "Alle" | Level;
  source: string;
  signalKind: "Alle" | SignalKind;
  status: string;
  tag: string;
  minScore: number;
};

type FilterChip = {
  label: string;
  onRemove: () => void;
};

const taxonomyCategories = taxonomy as TaxonomyCategory[];

const initialFilters: Filters = {
  query: "",
  level: "Alle",
  source: "Alle",
  signalKind: "Alle",
  status: "Alle",
  tag: "Alle",
  minScore: 0
};

export function App() {
  const [view, setView] = useState<View>("briefing");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [rawDocuments, setRawDocuments] = useState<RegulatoryDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/documents.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<RegulatoryDocument[]>;
      })
      .then((nextDocuments) => {
        setRawDocuments(nextDocuments);
        setLoadError("");
      })
      .catch(() => {
        setLoadError("Die Dokumentdaten konnten nicht geladen werden.");
      });
  }, []);

  const documents = useMemo(
    () =>
      rawDocuments
        .map(enrichDocument)
        .filter((document) => document.tags.length > 0)
        .sort((a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime()),
    [rawDocuments]
  );

  useEffect(() => {
    if (documents.length === 0) return;
    if (!selectedId || !documents.some((document) => document.id === selectedId)) {
      setSelectedId(documents[0].id);
    }
  }, [documents, selectedId]);

  const todayCount = useMemo(() => documents.filter((document) => isNewToday(document.lastActivityDate)).length, [documents]);
  const highCount = useMemo(() => documents.filter((document) => document.relevanceScore >= 75).length, [documents]);
  const actionCount = useMemo(() => documents.filter(needsAction).length, [documents]);
  const reviewCount = useMemo(() => documents.filter(needsReview).length, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((document) => (view === "today" ? isNewToday(document.lastActivityDate) : true))
      .filter((document) => (view === "high" ? document.relevanceScore >= 75 : true))
      .filter((document) => (view === "review" ? needsReview(document) : true))
      .filter((document) => matchesFilters(document, filters))
      .sort((a, b) => {
        if (sortKey === "date") {
          return new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime();
        }
        return b.relevanceScore - a.relevanceScore;
      });
  }, [documents, filters, sortKey, view]);

  const selectedDocument = filteredDocuments.find((document) => document.id === selectedId) ?? filteredDocuments[0] ?? documents[0];
  const briefingItems = documents
    .filter(needsAction)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);
  const activeFilterChips = getActiveFilterChips(filters, sortKey, updateFilters, resetSort);

  function updateFilters(nextFilters: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...nextFilters }));
  }

  function resetSort() {
    setSortKey(defaultSortKey);
  }

  function resetFilters() {
    setFilters(initialFilters);
    setSortKey(defaultSortKey);
  }

  function applyTopicFilter(nextFilters: Partial<Filters>) {
    setView("briefing");
    updateFilters(nextFilters);
  }

  if (loadError) {
    return (
      <main className="app-shell">
        <section className="workspace full-width-state">
          <EmptyDetail title="Daten nicht geladen" copy={loadError} />
        </section>
      </main>
    );
  }

  if (rawDocuments.length === 0) {
    return (
      <main className="app-shell">
        <section className="workspace full-width-state">
          <EmptyDetail title="Daten werden geladen" copy="Die regulatorischen Vorgänge werden aus der JSON-Datei geladen." />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navigation">
        <div className="brand">
          <div className="brand-mark">
            <FileSearch size={22} />
          </div>
          <div>
            <strong>Regulatory Radar</strong>
            <span>Öl & Gas Public Affairs</span>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Hauptansichten">
          <span className="sidebar-section-title">Ansichten</span>
          <button className={view === "briefing" ? "nav-button active" : "nav-button"} onClick={() => setView("briefing")}>
            <Newspaper size={18} />
            Briefing
          </button>
          <button className={view === "today" ? "nav-button active" : "nav-button"} onClick={() => setView("today")}>
            <CalendarClock size={18} />
            Heute neu
            <span className="count">{todayCount}</span>
          </button>
          <button className={view === "high" ? "nav-button active" : "nav-button"} onClick={() => setView("high")}>
            <Gauge size={18} />
            Hohe Relevanz
            <span className="count">{highCount}</span>
          </button>
          <button className={view === "review" ? "nav-button active" : "nav-button"} onClick={() => setView("review")}>
            <FileSearch size={18} />
            Zur Prüfung
            <span className="count">{reviewCount}</span>
          </button>
        </nav>

        <section className="quick-filter-section" aria-labelledby="quick-filter-title">
          <h2 id="quick-filter-title" className="sidebar-section-title">Schnellfilter</h2>
          <div className="quick-filter-grid">
            <button
              className={filters.tag === "CCS / CO2-Speicherung" ? "quick-filter active" : "quick-filter"}
              type="button"
              onClick={() => applyTopicFilter({ tag: filters.tag === "CCS / CO2-Speicherung" ? "Alle" : "CCS / CO2-Speicherung" })}
            >
              CCS / CO₂
            </button>
            <button
              className={filters.tag === "Bergrecht" ? "quick-filter active" : "quick-filter"}
              type="button"
              onClick={() => applyTopicFilter({ tag: filters.tag === "Bergrecht" ? "Alle" : "Bergrecht" })}
            >
              Bergrecht
            </button>
            <button
              className={filters.tag === "Genehmigung / Planfeststellung" ? "quick-filter active" : "quick-filter"}
              type="button"
              onClick={() => applyTopicFilter({ tag: filters.tag === "Genehmigung / Planfeststellung" ? "Alle" : "Genehmigung / Planfeststellung" })}
            >
              Genehmigung
            </button>
            <button
              className={filters.tag === "Umwelt/Klima" ? "quick-filter active" : "quick-filter"}
              type="button"
              onClick={() => applyTopicFilter({ tag: filters.tag === "Umwelt/Klima" ? "Alle" : "Umwelt/Klima" })}
            >
              Umwelt
            </button>
            <button
              className={filters.level === "Niedersachsen" ? "quick-filter active" : "quick-filter"}
              type="button"
              onClick={() => applyTopicFilter({ level: filters.level === "Niedersachsen" ? "Alle" : "Niedersachsen" })}
            >
              Niedersachsen
            </button>
          </div>
        </section>

        <section className="briefing" aria-labelledby="briefing-title">
          <div className="briefing-head">
            <div className="section-label">
              <AlertTriangle size={16} />
              <h2 id="briefing-title">Heute wichtig</h2>
            </div>
            <p>Neue Signale mit hoher politischer oder regulatorischer Relevanz.</p>
          </div>
          {briefingItems.length > 0 ? (
            <ul>
              {briefingItems.map((document) => (
                <li key={document.id}>
                  <button onClick={() => setSelectedId(document.id)}>
                    <span className="briefing-score">{document.relevanceScore}</span>
                    <span className="briefing-copy">
                      <strong>{document.title}</strong>
                      <span>
                        {getSourceLabel(document)} · {getSignalKind(document)}
                      </span>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Keine neuen Signale mit erhöhtem Handlungsbedarf.</p>
          )}
        </section>
      </aside>

      <section className="workspace">
        <header className="briefing-top">
          <div className="briefing-title-block">
            <p className="context-line">Bund + Niedersachsen · Policy Intelligence für Öl & Gas</p>
            <h1>{getViewTitle(view)}</h1>
            <p className="header-copy">Schnelle Priorisierung: Was ist neu, warum ist es relevant und was sollte als Nächstes geprüft werden?</p>
          </div>
          <div className="briefing-cards" aria-label="Briefing-Kennzahlen">
            <Metric icon={<CalendarClock size={17} />} label="Heute neu" value={todayCount.toString()} helper="neue oder aktualisierte Signale" />
            <Metric icon={<Gauge size={17} />} label="Hohe Relevanz" value={highCount.toString()} helper="Score ab 75" />
            <Metric icon={<AlertTriangle size={17} />} label="Handlungsbedarf" value={actionCount.toString()} helper="heute relevant oder sehr hoher Score" />
            <Metric icon={<FileSearch size={17} />} label="Zur Prüfung" value={reviewCount.toString()} helper="fachlich prüfen oder beobachten" />
          </div>
        </header>

        <section className="filters-panel" aria-label="Filter">
          <div className="primary-filters">
            <label className="search-field">
              <span className="visually-hidden">Suche</span>
              <Search size={17} />
              <input
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
                placeholder="Titel, Quelle oder Zusammenfassung suchen"
              />
            </label>

            <Select label="Ebene" value={filters.level} onChange={(value) => updateFilters({ level: value as Filters["level"] })}>
              <option>Alle</option>
              <option>Bund</option>
              <option>Niedersachsen</option>
            </Select>

            <Select label="Status" value={filters.status} onChange={(value) => updateFilters({ status: value })}>
              <option>Alle</option>
              {[...new Set(documents.map((document) => document.status))].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </Select>

            <label className="score-filter">
              <span>Mindest-Relevanz</span>
              <input
                type="range"
                min="0"
                max="90"
                step="15"
                value={filters.minScore}
                onChange={(event) => updateFilters({ minScore: Number(event.target.value) })}
              />
              <strong>{filters.minScore}</strong>
            </label>
          </div>

          <div className="filter-actions">
            <button
              className="text-button"
              type="button"
              aria-expanded={showAdvancedFilters}
              onClick={() => setShowAdvancedFilters((current) => !current)}
            >
              <SlidersHorizontal size={17} />
              Weitere Filter
            </button>
            <button className="text-button secondary" type="button" onClick={resetFilters}>
              <RotateCcw size={17} />
              Alle Filter zurücksetzen
            </button>
          </div>

          {showAdvancedFilters && (
            <div className="advanced-filters">
              <Select label="Quelle" value={filters.source} onChange={(value) => updateFilters({ source: value })}>
                <option>Alle</option>
                {[...new Set(documents.map((document) => getSourceLabel(document)))].sort().map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </Select>

              <Select label="Signalart" value={filters.signalKind} onChange={(value) => updateFilters({ signalKind: value as Filters["signalKind"] })}>
                <option>Alle</option>
                <option>Gesetz</option>
                <option>Vorgang</option>
                <option>Meldung</option>
              </Select>

              <Select label="Tag" value={filters.tag} onChange={(value) => updateFilters({ tag: value })}>
                <option>Alle</option>
                {taxonomyCategories.map((category) => (
                  <option key={category.id}>{category.label}</option>
                ))}
              </Select>

              <button className="text-button sort-button" type="button" onClick={() => setSortKey(sortKey === "score" ? "date" : "score")}>
                <Gauge size={17} />
                Sortierung: {sortKey === "score" ? "Score" : "Aktualität"}
              </button>
            </div>
          )}

          {activeFilterChips.length > 0 && (
            <div className="active-filters" aria-label="Aktive Filter">
              {activeFilterChips.map((chip) => (
                <button key={chip.label} type="button" onClick={chip.onRemove}>
                  {chip.label}
                  <X size={14} />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="content-grid">
          <DocumentList documents={filteredDocuments} selectedId={selectedDocument?.id} onSelect={setSelectedId} />
          {selectedDocument ? <DetailPanel document={selectedDocument} /> : <EmptyDetail />}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function DocumentList({
  documents,
  selectedId,
  onSelect
}: {
  documents: RegulatoryDocument[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <section className="document-list empty-state">
        <Filter size={28} />
        <h2>Keine Treffer</h2>
        <p>Die aktuellen Filter liefern keine Vorgänge. Mindest-Relevanz oder Themenfilter reduzieren, um mehr Signale einzuschließen.</p>
      </section>
    );
  }

  return (
    <section className="document-list" aria-label="Regulatorische Vorgänge">
      <div className="list-header">
        <span>Signale und Vorgänge</span>
        <span>Relevanz</span>
      </div>
      {documents.map((document) => {
        const hiddenTagCount = Math.max(0, document.tags.length - 3);
        const isNew = isNewToday(document.lastActivityDate);
        const scoreBucket = getScoreBucket(document.relevanceScore);

        return (
          <button
            key={document.id}
            className={document.id === selectedId ? "document-row selected" : "document-row"}
            onClick={() => onSelect(document.id)}
          >
            <div className="row-main">
              <div className="row-meta compact">
                {isNew && <span className="new-badge">Neu</span>}
                <span>{formatDate(document.lastActivityDate)}</span>
                <span>{getSourceLabel(document)}</span>
                <span>{document.level}</span>
                <span>{getSignalKind(document)}</span>
              </div>
              <h2>{document.title}</h2>
              <p className="summary-line">{document.summaryShort}</p>
              <div className="tag-row">
                {document.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
                {hiddenTagCount > 0 && <span>+{hiddenTagCount}</span>}
              </div>
              {scoreBucket === "high" && <p className="reason-line">{document.relevanceReason}</p>}
            </div>
            <ScoreBadge score={document.relevanceScore} />
          </button>
        );
      })}
    </section>
  );
}

function DetailPanel({ document }: { document: RegulatoryDocument }) {
  return (
    <aside className="detail-panel" aria-label="Detailansicht">
      <div className="detail-header">
        <div>
          <span className="detail-kicker">{getSignalKind(document)} · {getSourceLabel(document)}</span>
          <h2>{document.title}</h2>
        </div>
        <ScoreBadge score={document.relevanceScore} large />
      </div>

      <section className="decision-section">
        <h3>Kurzfazit</h3>
        <p>{document.summaryLong}</p>
      </section>

      <section className="decision-section">
        <h3>Warum relevant</h3>
        <p>{document.relevanceReason}</p>
      </section>

      <section className="decision-section">
        <h3>Mögliche Auswirkung</h3>
        <p>{deriveImpact(document)}</p>
      </section>

      <section className="decision-section">
        <h3>Empfohlener nächster Schritt</h3>
        <p>{deriveNextStep(document)}</p>
      </section>

      <section className="decision-section">
        <h3>Status & Quelle</h3>
        <div className="detail-meta">
          <span>{document.level}</span>
          <span>{getSignalKind(document)}</span>
          <span>{getSourceLabel(document)}</span>
          <span>{document.sourceType}</span>
          <span>{formatDate(document.date)}</span>
          <span>{document.status}</span>
        </div>
      </section>

      <section className="decision-section">
        <h3>Tags</h3>
        <div className="detail-tags">
          {document.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>

      <a className="source-link" href={document.url} target="_blank" rel="noreferrer">
        Originalquelle öffnen
        <ExternalLink size={16} />
      </a>
    </aside>
  );
}

function EmptyDetail({
  title = "Kein Vorgang ausgewählt",
  copy = "Wähle einen Eintrag, um Kurzfazit, Begründung, mögliche Auswirkung und Originalquelle zu sehen."
}: {
  title?: string;
  copy?: string;
}) {
  return (
    <aside className="detail-panel empty-state">
      <FileSearch size={28} />
      <h2>{title}</h2>
      <p>{copy}</p>
    </aside>
  );
}

function ScoreBadge({ score, large = false }: { score: number; large?: boolean }) {
  const bucket = getScoreBucket(score);
  const label = bucket === "high" ? "hoch" : bucket === "medium" ? "mittel" : "niedrig";

  return (
    <div className={`score-badge ${bucket} ${large ? "large" : ""}`} aria-label={`Relevanz ${score}, ${label}`}>
      <strong>{score}</strong>
      <span>{label}</span>
    </div>
  );
}

function getActiveFilterChips(
  filters: Filters,
  sortKey: SortKey,
  updateFilters: (nextFilters: Partial<Filters>) => void,
  resetSort: () => void
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.query.trim()) chips.push({ label: `Suche: ${filters.query.trim()}`, onRemove: () => updateFilters({ query: "" }) });
  if (filters.level !== "Alle") chips.push({ label: `Ebene: ${filters.level}`, onRemove: () => updateFilters({ level: "Alle" }) });
  if (filters.status !== "Alle") chips.push({ label: `Status: ${filters.status}`, onRemove: () => updateFilters({ status: "Alle" }) });
  if (filters.minScore > 0) chips.push({ label: `Mindest-Relevanz: ${filters.minScore}`, onRemove: () => updateFilters({ minScore: 0 }) });
  if (filters.source !== "Alle") chips.push({ label: `Quelle: ${filters.source}`, onRemove: () => updateFilters({ source: "Alle" }) });
  if (filters.signalKind !== "Alle") chips.push({ label: `Signalart: ${filters.signalKind}`, onRemove: () => updateFilters({ signalKind: "Alle" }) });
  if (filters.tag !== "Alle") chips.push({ label: `Tag: ${filters.tag}`, onRemove: () => updateFilters({ tag: "Alle" }) });
  if (sortKey !== defaultSortKey) chips.push({ label: "Sortierung: Score", onRemove: resetSort });
  return chips;
}

function getViewTitle(view: View): string {
  if (view === "today") return "Heute neu";
  if (view === "high") return "Hohe Relevanz";
  if (view === "review") return "Zur Prüfung";
  return "Morning Briefing";
}

function matchesFilters(document: RegulatoryDocument, filters: Filters): boolean {
  const query = filters.query.trim().toLocaleLowerCase("de-DE");
  const queryHit =
    query.length === 0 ||
    [document.title, document.source, document.summaryShort, document.summaryLong, document.relevanceReason, document.status]
      .join(" ")
      .toLocaleLowerCase("de-DE")
      .includes(query);

  return (
    queryHit &&
    (filters.level === "Alle" || document.level === filters.level) &&
    (filters.source === "Alle" || getSourceLabel(document) === filters.source) &&
    (filters.signalKind === "Alle" || getSignalKind(document) === filters.signalKind) &&
    (filters.status === "Alle" || document.status === filters.status) &&
    (filters.tag === "Alle" || document.tags.includes(filters.tag)) &&
    document.relevanceScore >= filters.minScore
  );
}

function getSignalKind(document: RegulatoryDocument): SignalKind {
  if (document.sourceType === "Verkuendung") return "Gesetz";

  const type = document.documentType.toLocaleLowerCase("de-DE");
  const status = document.status.toLocaleLowerCase("de-DE");
  const title = document.title.toLocaleLowerCase("de-DE");
  const lawSignals = ["gesetz", "verordnung", "bekanntmachung", "verkündung", "verkuendung"];
  if (lawSignals.some((signal) => type.includes(signal) || status.includes(signal) || title.includes(signal))) return "Gesetz";

  if (document.sourceType === "Parlament") return "Vorgang";
  return "Meldung";
}

function getSourceLabel(document: RegulatoryDocument): string {
  const source = document.source.toLocaleLowerCase("de-DE");
  if (source.includes("dip")) return "DIP";
  if (source.includes("nilas") || source.includes("landtag niedersachsen")) return "NILAS";
  if (source.includes("lbeg")) return "LBEG";
  if (source.includes("bmwe")) return "BMWE";
  if (source.includes("bmukn")) return "BMUKN";
  if (source.includes("bundesgesetzblatt")) return "BGBl";
  if (source.includes("verkuendungsplattform")) return "Verkündung NI";
  return document.source;
}

function needsAction(document: RegulatoryDocument): boolean {
  return document.relevanceScore >= 75 || (isNewToday(document.lastActivityDate) && document.relevanceScore >= 45);
}

function needsReview(document: RegulatoryDocument): boolean {
  if (document.relevanceScore >= 45 && document.relevanceScore < 75) return true;
  const status = document.status.toLocaleLowerCase("de-DE");
  return ["laufend", "anhörung", "anhoerung", "entwurf", "verfahren", "beratung", "konsultation"].some((term) => status.includes(term));
}

function deriveImpact(document: RegulatoryDocument): string {
  const tags = document.tags.join(" ").toLocaleLowerCase("de-DE");
  const kind = getSignalKind(document);

  if (document.relevanceScore >= 75) {
    return "Hohe Relevanz: Der Vorgang sollte kurzfristig fachlich bewertet werden, weil ein direkter regulatorischer oder politischer Bezug zur Branche erkennbar ist.";
  }

  if (tags.includes("ccs") || tags.includes("co2") || tags.includes("methan")) {
    return "Mögliche Relevanz für CO2-, Methan- oder Dekarbonisierungsanforderungen. Die konkrete Wirkung hängt vom weiteren Verfahren und der Ausgestaltung ab.";
  }

  if (kind === "Meldung") {
    return "Frühes politisches oder behördliches Signal. Noch keine gesicherte Rechtswirkung, aber sinnvoll für Monitoring und Einordnung der politischen Richtung.";
  }

  return "Potenzielle Auswirkung auf regulatorische Rahmenbedingungen. Eine belastbare Bewertung erfordert die Prüfung der Originalquelle und des weiteren Verfahrensstands.";
}

function deriveNextStep(document: RegulatoryDocument): string {
  if (document.relevanceScore >= 75) {
    return "Originalquelle prüfen, interne Zuständigkeit klären und kurzfristig bewerten, ob Positionierung, Stakeholder-Ansprache oder vertieftes Monitoring nötig ist.";
  }

  if (isNewToday(document.lastActivityDate)) {
    return "Heute kurz prüfen und entscheiden, ob der Eintrag in das aktive Monitoring aufgenommen oder zunächst beobachtet werden soll.";
  }

  if (getSignalKind(document) === "Meldung") {
    return "Als Kontextsignal beobachten und bei Folgevorgängen, Referentenentwürfen oder parlamentarischen Aktivitäten erneut priorisieren.";
  }

  return "Bei nächster Aktualisierung erneut bewerten und die Originalquelle bei Bedarf fachlich gegenlesen.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}
