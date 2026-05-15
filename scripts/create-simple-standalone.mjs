import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputPath = fileURLToPath(new URL("../Regulatory-Radar-Standalone.html", import.meta.url));

const documents = [
  {
    date: "14.05.2026",
    level: "Niedersachsen",
    status: "Antwort ausstehend",
    title: "Kleine Anfrage: Zukunft der Erdgasfoerderung in Niedersachsen",
    summary: "Landtagsanfrage zu Foerdermengen, Bohrungen und bergrechtlichen Genehmigungen in Niedersachsen.",
    reason:
      "Taxonomie-Treffer: Bergrecht, Erdgas, Foerderung; neue Aktivitaet innerhalb von 24 Stunden; Niedersachsen-Bezug mit Foerderungs-/Bergrechtsnaehe.",
    tags: ["Bergrecht", "Erdgas", "Foerderung", "Genehmigung"],
    score: 98,
    url: "https://www.landtag-niedersachsen.de/drucksachen/"
  },
  {
    date: "14.05.2026",
    level: "Bund",
    status: "Ausschussberatung",
    title: "Entwurf eines Gesetzes zur Beschleunigung von Genehmigungsverfahren fuer Energieinfrastruktur",
    summary: "Bundesweite Verfahrensbeschleunigung fuer Energieinfrastruktur mit moeglicher Relevanz fuer Pipelines und Speicher.",
    reason:
      "Taxonomie-Treffer: Infrastruktur, Genehmigung / Planfeststellung, Umwelt/Klima; Gesetzentwurf aus Bundestag DIP; neue Aktivitaet innerhalb von 24 Stunden.",
    tags: ["Infrastruktur", "Genehmigung", "Umwelt/Klima"],
    score: 87,
    url: "https://dip.bundestag.de/"
  },
  {
    date: "13.05.2026",
    level: "Bund",
    status: "Zugeleitet",
    title: "Bundesratsinitiative zur Umsetzung der EU-Methanverordnung im Energiesektor",
    summary: "Neue Berichtspflichten und Messvorgaben fuer Methanemissionen in Gasinfrastruktur werden politisch vorbereitet.",
    reason: "Taxonomie-Treffer: Methan, Infrastruktur, Umwelt/Klima; Drucksache aus Bundesrat Drucksache.",
    tags: ["Methan", "Infrastruktur", "Umwelt/Klima"],
    score: 80,
    url: "https://www.bundesrat.de/DE/dokumente/drucksachen/drucksachen-node.html"
  },
  {
    date: "08.05.2026",
    level: "Bund",
    status: "In Kraft",
    title: "Bekanntmachung zur Anpassung energiewirtschaftlicher Meldepflichten",
    summary: "Meldepflichten fuer Energieunternehmen werden aktualisiert; direkter Oel- und Gasbezug ist zu pruefen.",
    reason: "Taxonomie-Treffer: Erdgas, Infrastruktur; Bekanntmachung aus Bundesgesetzblatt.",
    tags: ["Erdgas", "Infrastruktur"],
    score: 65,
    url: "https://www.recht.bund.de/"
  },
  {
    date: "06.05.2026",
    level: "Bund",
    status: "Signal",
    title: "Pressemitteilung: Dialogprozess zu Industrieemissionen gestartet",
    summary: "Ministerieller Dialogprozess zu Emissionen mit moeglicher Relevanz fuer Raffinerien und Anlagenbetreiber.",
    reason: "Taxonomie-Treffer: Methan, Erdoel, Umwelt/Klima; Pressemitteilung aus BMUV.",
    tags: ["Methan", "Erdoel", "Umwelt/Klima"],
    score: 64,
    url: "https://www.bmuv.de/presse"
  },
  {
    date: "11.05.2026",
    level: "Bund",
    status: "Ueberwiesen",
    title: "Antrag: Klimaschutzprogramm 2030 im Gebaeudesektor nachschaerfen",
    summary: "Klimapolitischer Antrag mit moeglichen indirekten Auswirkungen auf Gasnachfrage und Waermemarkt.",
    reason: "Taxonomie-Treffer: Bergrecht, Umwelt/Klima; Antrag aus Bundestag DIP.",
    tags: ["Bergrecht", "Umwelt/Klima"],
    score: 59,
    url: "https://dip.bundestag.de/"
  }
];

function bucket(score) {
  if (score >= 75) return "hoch";
  if (score >= 45) return "mittel";
  return "niedrig";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const rows = documents
  .map(
    (document, index) => `
      <article class="row ${index === 0 ? "selected" : ""}">
        <div>
          <div class="meta">
            <span>${document.date}</span>
            <span>${document.level}</span>
            <span>${document.status}</span>
          </div>
          <h2>${escapeHtml(document.title)}</h2>
          <p>${escapeHtml(document.summary)}</p>
          <div class="tags">${document.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <p class="reason">${escapeHtml(document.reason)}</p>
        </div>
        <div class="score ${bucket(document.score)}"><strong>${document.score}</strong><span>${bucket(document.score)}</span></div>
      </article>`
  )
  .join("");

const important = documents
  .slice(0, 2)
  .map(
    (document) => `
      <li>
        <span class="mini-score">${document.score}</span>
        <span><strong>${escapeHtml(document.title)}</strong><small>${document.level} - ${document.status}</small></span>
      </li>`
  )
  .join("");

const first = documents[0];

const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Regulatory Radar - Oel & Gas</title>
    <style>
      :root {
        font-family: Arial, Helvetica, sans-serif;
        color: #15211f;
        background: #eef2f3;
        --panel: #ffffff;
        --line: #dce5e2;
        --muted: #60706b;
        --accent: #0f766e;
        --dark: #182522;
        --high: #b42318;
        --medium: #b7791f;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; }
      .app { min-height: 100vh; display: grid; grid-template-columns: 292px minmax(0, 1fr); background: linear-gradient(180deg, rgba(15,118,110,.08), transparent 260px), #eef2f3; }
      aside { background: var(--dark); color: white; padding: 24px 18px; display: flex; flex-direction: column; gap: 24px; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .brand-mark { width: 42px; height: 42px; border-radius: 8px; background: #d6f4ee; color: #0a5c55; display: grid; place-items: center; font-weight: 800; }
      .brand strong, .brand span { display: block; }
      .brand span { color: #aec3bc; font-size: 12px; margin-top: 3px; }
      nav { display: grid; gap: 8px; }
      nav div { min-height: 42px; padding: 11px 12px; border-radius: 7px; background: #263832; font-weight: 700; }
      .important { margin-top: auto; border-top: 1px solid rgba(255,255,255,.14); padding-top: 18px; }
      .important h2 { margin: 0; font-size: 14px; }
      .important p { color: #b5c7c1; font-size: 12px; line-height: 1.45; }
      .important ul { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 8px; }
      .important li { display: grid; grid-template-columns: 34px 1fr; gap: 9px; align-items: center; padding: 9px; border-radius: 7px; background: rgba(214,244,238,.08); }
      .mini-score { width: 34px; height: 34px; border-radius: 7px; background: #d6f4ee; color: #0a5c55; display: grid; place-items: center; font-weight: 800; }
      .important strong { display: block; font-size: 12px; line-height: 1.3; }
      .important small { display: block; color: #b5c7c1; margin-top: 3px; }
      main { padding: 28px; min-width: 0; }
      .top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 22px; }
      .context { color: var(--muted); margin: 0 0 5px; font-size: 13px; }
      h1 { margin: 0; font-size: 32px; line-height: 1.1; }
      .metrics { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .metric { min-width: 112px; min-height: 44px; padding: 8px 11px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.78); color: var(--muted); font-size: 11px; }
      .metric strong { display: block; color: #15211f; font-size: 18px; margin-bottom: 2px; }
      .notice { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #c9ded8; border-radius: 8px; background: #f7fbfa; color: #42524e; font-size: 13px; line-height: 1.45; }
      .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 410px); gap: 16px; align-items: start; }
      .list, .detail { border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.92); box-shadow: 0 18px 50px rgba(23,37,35,.08); overflow: hidden; }
      .list-head { display: grid; grid-template-columns: 1fr 82px; padding: 12px 16px; background: #f7f9f8; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 800; }
      .row { display: grid; grid-template-columns: minmax(0,1fr) 82px; gap: 14px; padding: 15px 16px; border-bottom: 1px solid var(--line); background: white; }
      .row.selected { background: #f3faf7; box-shadow: inset 4px 0 0 var(--accent); }
      .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .meta span { padding: 4px 7px; border-radius: 6px; background: #eef4f2; color: var(--muted); font-size: 11px; font-weight: 800; }
      .row h2, .detail h2 { margin: 0; line-height: 1.25; }
      .row h2 { font-size: 16px; }
      .row p, .detail p { color: #42524e; line-height: 1.5; font-size: 13px; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .tags span { padding: 5px 8px; border-radius: 6px; background: #e5f2ee; color: #0f625b; font-size: 11px; font-weight: 800; }
      .reason { color: var(--muted) !important; font-size: 12px !important; }
      .score { width: 68px; min-height: 58px; border-radius: 8px; border: 1px solid currentColor; display: grid; place-items: center; align-content: center; }
      .score strong { font-size: 22px; line-height: 1; }
      .score span { text-transform: uppercase; font-size: 11px; font-weight: 800; }
      .hoch { color: var(--high); background: #fff0ee; }
      .mittel { color: var(--medium); background: #fff8e8; }
      .detail { padding: 18px; position: sticky; top: 18px; }
      .detail h2 { font-size: 21px; }
      .detail h3 { font-size: 13px; margin: 20px 0 8px; }
      .source { margin-top: 22px; min-height: 42px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--accent); color: white; font-weight: 800; text-decoration: none; }
      @media (max-width: 980px) { .app { grid-template-columns: 1fr; } aside { min-height: auto; } .grid { grid-template-columns: 1fr; } .detail { position: static; } }
      @media (max-width: 640px) { main { padding: 18px; } .top { display: block; } .row { grid-template-columns: 1fr; } .score { width: 100%; min-height: 44px; grid-template-columns: auto auto; justify-content: center; gap: 8px; } }
    </style>
  </head>
  <body>
    <div class="app">
      <aside>
        <div class="brand">
          <div class="brand-mark">RR</div>
          <div><strong>Regulatory Radar</strong><span>Oel & Gas DE</span></div>
        </div>
        <nav>
          <div>Dashboard</div>
          <div>Heute neu · 2</div>
        </nav>
        <section class="important">
          <h2>Heute wichtig</h2>
          <p>Automatische Kurzliste der neuen, relevanten Signale.</p>
          <ul>${important}</ul>
        </section>
      </aside>
      <main>
        <header class="top">
          <div>
            <p class="context">Bund + Niedersachsen - Public Affairs Monitoring</p>
            <h1>Dashboard</h1>
          </div>
          <div class="metrics">
            <div class="metric"><strong>3</strong>Hohe Relevanz</div>
            <div class="metric"><strong>2</strong>24h Updates</div>
            <div class="metric"><strong>4+</strong>Quellen</div>
          </div>
        </header>
        <div class="notice">Diese Datei ist die robuste Ein-Datei-Vorschau fuer die Weitergabe. Sie nutzt Mockdaten und braucht keinen lokalen Server.</div>
        <div class="grid">
          <section class="list">
            <div class="list-head"><span>Vorgang</span><span>Score</span></div>
            ${rows}
          </section>
          <aside class="detail">
            <div class="meta"><span>${first.level}</span><span>${first.status}</span><span>${first.date}</span></div>
            <h2>${escapeHtml(first.title)}</h2>
            <h3>Zusammenfassung</h3>
            <p>${escapeHtml(first.summary)} Die Anfrage kann Hinweise auf politische Konfliktlinien, Datenanforderungen und kuenftige Landesaktivitaeten liefern.</p>
            <h3>Relevanz-Begruendung</h3>
            <p>${escapeHtml(first.reason)}</p>
            <h3>Tags</h3>
            <div class="tags">${first.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
            <a class="source" href="${first.url}" target="_blank" rel="noreferrer">Originalquelle oeffnen</a>
          </aside>
        </div>
      </main>
    </div>
  </body>
</html>`;

await writeFile(outputPath, html, "utf8");
console.log(`Created simple standalone ${outputPath}`);
