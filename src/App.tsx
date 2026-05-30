import {
  ArrowDownUp,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Filter,
  Gauge,
  LayoutDashboard,
  Newspaper,
  RotateCcw,
  Search,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import taxonomy from "./data/taxonomy.json";
import { enrichDocument, getScoreBucket, isNewToday } from "./lib/scoring";
import type { Level, RegulatoryDocument, TaxonomyCategory } from "./types";

type View = "dashboard" | "today";
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
  const [view, setView] = useState<View>("dashboard");
  const [filters, setFilters] = useState<Filters>(initialFilters);
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
  const lawCount = useMemo(() => documents.filter((document) => getSignalKind(document) === "Gesetz").length, [documents]);
  const proceedingCount = useMemo(() => documents.filter((document) => getSignalKind(document) === "Vorgang").length, [documents]);
  const noticeCount = useMemo(() => documents.filter((document) => getSignalKind(document) === "Meldung").length, [documents]);
  const sourceCount = useMemo(() => new Set(documents.map((document) => getSourceLabel(document))).size, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((document) => (view === "today" ? isNewToday(document.lastActivityDate) : true))
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
    .filter((document) => isNewToday(document.lastActivityDate) && document.relevanceScore >= 45)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 4);

  function updateFilters(nextFilters: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...nextFilters }));
  }

  function resetFilters() {
    setFilters(initialFilters);
    setSortKey(defaultSortKey);
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
          <EmptyDetail title="Daten werden geladen" copy="Die regulatorischen Vorgaenge werden aus der JSON-Datei geladen." />
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
            <span>Oel & Gas DE</span>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Hauptansichten">
          <button className={view === "dashboard" ? "nav-button active" : "nav-button"} onClick={() => setView("dashboard")}>
            <LayoutDashboard size={18} />
            Dashboard
          </button>
          <button className={view === "today" ? "nav-button active" : "nav-button"} onClick={() => setView("today")}>
            <CalendarClock size={18} />
            Heute neu
            <span className="count">{todayCount}</span>
          </button>
        </nav>

        <section className="briefing" aria-labelledby="briefing-title">
          <div className="briefing-head">
            <div className="section-label">
              <Newspaper size={16} />
              <h2 id="briefing-title">Heute wichtig</h2>
            </div>
            <p>Automatische Kurzliste der neuen, relevanten Signale.</p>
          </div>
          {briefingItems.length > 0 ? (
            <ul>
              {briefingItems.map((document) => (
                <li key={document.id}>
                  <button onClick={() => setSelectedId(document.id)}>
                    <span className="briefing-score">{document.relevanceScore}</span>
                    <span className="briefing-copy">
                      <strong>{document.title}</strong>
                      <span>{document.level} - {document.status}</span>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Keine neuen relevanten Vorgaenge.</p>
          )}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="context-line">Bund + Niedersachsen - Public Affairs Monitoring</p>
            <h1>{view === "today" ? "Heute neu" : "Dashboard"}</h1>
          </div>
          <div className="stat-strip" aria-label="Kennzahlen">
            <Metric icon={<Gauge size={17} />} label="Hohe Relevanz" value={highCount.toString()} />
            <Metric icon={<FileSearch size={17} />} label="Gesetze" value={lawCount.toString()} />
            <Metric icon={<ShieldCheck size={17} />} label="Vorgaenge" value={proceedingCount.toString()} />
            <Metric icon={<Newspaper size={17} />} label="Meldungen" value={noticeCount.toString()} />
            <Metric icon={<CalendarClock size={17} />} label="24h Updates" value={todayCount.toString()} />
            <Metric icon={<ShieldCheck size={17} />} label="Quellen" value={sourceCount.toString()} />
          </div>
        </header>

        <section className="filters" aria-label="Filter">
          <label className="search-field">
            <Search size={17} />
            <input
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Titel, Quelle, Zusammenfassung suchen"
            />
          </label>

          <Select label="Ebene" value={filters.level} onChange={(value) => updateFilters({ level: value as Filters["level"] })}>
            <option>Alle</option>
            <option>Bund</option>
            <option>Niedersachsen</option>
          </Select>

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

          <Select label="Status" value={filters.status} onChange={(value) => updateFilters({ status: value })}>
            <option>Alle</option>
            {[...new Set(documents.map((document) => document.status))].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </Select>

          <Select label="Tag" value={filters.tag} onChange={(value) => updateFilters({ tag: value })}>
            <option>Alle</option>
            {taxonomyCategories.map((category) => (
              <option key={category.id}>{category.label}</option>
            ))}
          </Select>

          <label className="score-filter">
            <span>Min. Score</span>
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

          <button className="icon-button" onClick={() => setSortKey(sortKey === "score" ? "date" : "score")} title="Sortierung wechseln">
            <ArrowDownUp size={18} />
            {sortKey === "score" ? "Score" : "Aktualitaet"}
          </button>

          <button className="icon-button secondary" onClick={resetFilters} title="Filter zuruecksetzen">
            <RotateCcw size={17} />
          </button>
        </section>

        <div className="content-grid">
          <DocumentList documents={filteredDocuments} selectedId={selectedDocument?.id} onSelect={setSelectedId} />
          {selectedDocument ? <DetailPanel document={selectedDocument} /> : <EmptyDetail />}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
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
        <p>Die aktuellen Filter liefern keine Vorgaenge. Score oder Tag reduzieren, um mehr Signale einzuschliessen.</p>
      </section>
    );
  }

  return (
    <section className="document-list" aria-label="Regulatorische Vorgaenge">
      <div className="list-header">
        <span>Vorgang</span>
        <span>Score</span>
      </div>
      {documents.map((document) => (
        <button
          key={document.id}
          className={document.id === selectedId ? "document-row selected" : "document-row"}
          onClick={() => onSelect(document.id)}
        >
          <div className="row-main">
            <div className="row-meta">
              <span>{formatDate(document.lastActivityDate)}</span>
              <span>{document.level}</span>
              <span>{getSourceLabel(document)}</span>
              <span>{getSignalKind(document)}</span>
              <span>{document.sourceType}</span>
            </div>
            <h2>{document.title}</h2>
            <p>{document.summaryShort}</p>
            <div className="tag-row">
              {document.tags.slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <p className="reason-line">{document.relevanceReason}</p>
          </div>
          <ScoreBadge score={document.relevanceScore} />
        </button>
      ))}
    </section>
  );
}

function DetailPanel({ document }: { document: RegulatoryDocument }) {
  return (
    <aside className="detail-panel" aria-label="Detailansicht">
      <div className="detail-header">
        <div>
          <span className="detail-kicker">{document.documentType}</span>
          <h2>{document.title}</h2>
        </div>
        <ScoreBadge score={document.relevanceScore} large />
      </div>

      <div className="detail-meta">
        <span>{document.level}</span>
        <span>{getSignalKind(document)}</span>
        <span>{getSourceLabel(document)}</span>
        <span>{document.sourceType}</span>
        <span>{document.source}</span>
        <span>{formatDate(document.date)}</span>
        <span>{document.status}</span>
      </div>

      <section>
        <h3>Zusammenfassung</h3>
        <p>{document.summaryLong}</p>
      </section>

      <section>
        <h3>Relevanz-Begruendung</h3>
        <p>{document.relevanceReason}</p>
      </section>

      <section>
        <h3>Tags</h3>
        <div className="detail-tags">
          {document.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>

      <a className="source-link" href={document.url} target="_blank" rel="noreferrer">
        Originalquelle oeffnen
        <ExternalLink size={16} />
      </a>
    </aside>
  );
}

function EmptyDetail({
  title = "Kein Vorgang ausgewaehlt",
  copy = "Waehle einen Eintrag, um Zusammenfassung, Relevanzgrund und Originalquelle zu sehen."
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
  const lawSignals = ["gesetz", "verordnung", "bekanntmachung", "verkuendung", "verkündung"];
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
  if (source.includes("verkuendungsplattform")) return "Verkuendung NI";
  return document.source;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}
