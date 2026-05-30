# Regulatory Radar - Handover

## Kurzbeschreibung

Dieses Projekt ist ein lokaler Stufe-1-Prototyp fuer einen KI-gestuetzten Regulatory Radar fuer Public Affairs im Oel- und Gassektor in Deutschland. Die App dient als Triage-Interface: Nutzer sollen schnell erkennen, welche regulatorischen Entwicklungen relevant sind, warum sie relevant sind und welche Originalquelle dahintersteht.

Aktueller Stand:

- React + TypeScript App mit Vite-Build
- JSON-Datenbestand unter `public/data/documents.json`, erzeugbar aus Importern
- Taxonomie-basierte Klassifikation
- Regelbasierter Relevanzscore mit erklaerbarer Begruendung
- Dashboard, "Heute neu", Detailansicht und "Heute wichtig"-Kurzliste
- Direkt oeffnbare lokale HTML-Startdatei

## Lokaler Start

### Variante 1: Direkt im Browser oeffnen

Die Datei `Regulatory-Radar-Standalone.html` doppelklicken.

Das ist eine Ein-Datei-Version mit eingebettetem JavaScript und CSS. Sie ist fuer Weitergabe per ZIP oder E-Mail am einfachsten.

Alternativ kann `Regulatory-Radar-oeffnen.html` verwendet werden; diese Datei leitet auf die Standalone-Version weiter.

### Variante 2: Lokaler Preview-Server

```bash
npm install
npm run dev
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:5173/
```

Hinweis: `npm run dev` baut absichtlich zuerst die App und startet dann einen kleinen lokalen Server fuer `dist/`. Das ist robuster in diesem Windows/OneDrive-Ordner als der klassische Vite-Dev-Server.

## Wichtige Dateien

- `src/App.tsx` - Hauptoberflaeche, Views, Filter, Detailpanel, Briefing/Kurzliste
- `public/data/documents.json` - aktueller Datenbestand im Importformat
- `scripts/fetch-dip.mjs` - erster Live-Importer fuer DIP Bundestag/Bundesrat
- `scripts/fetch-bmwe.mjs` - Importer fuer BMWE-RSS-Feeds Pressemitteilungen und Energie
- `scripts/fetch-bmukn.mjs` - Importer fuer BMUKN-RSS-Feeds Klimaschutz, Umwelt und Natur
- `scripts/fetch-lbeg.mjs` - Importer fuer LBEG-Neuigkeiten und LBEG-Presseinformationen
- `scripts/fetch-nilas.mjs` - erster vorsichtiger Importer fuer NILAS-/Landtag-Niedersachsen-Drucksachen
- `scripts/validate-data.mjs` - Datenqualitaetscheck fuer Pflichtfelder, Platzhalter, Fehlerseiten und Dubletten
- `src/data/taxonomy.json` - editierbare Taxonomie mit Keywords und Gewichten
- `src/lib/scoring.ts` - Score-Berechnung, Tagging, "Heute neu"-Logik
- `src/types.ts` - zentrale TypeScript-Typen
- `src/styles.css` - komplettes visuelles System
- `scripts/fix-dist-paths.mjs` - korrigiert Build-HTML fuer direktes Datei-Oeffnen
- `scripts/create-simple-standalone.mjs` - erzeugt eine robuste, direkt oeffnbare Ein-Datei-Vorschau ohne React/Module
- `scripts/serve-dist.mjs` - kleiner lokaler Server fuer den gebauten Prototyp
- `docs/ORIGINAL_PRD.md` - urspruenglicher Produktprompt als Referenz

## Aktuelle Produktlogik

### Relevanzscore

Der Score wird in `src/lib/scoring.ts` berechnet. Er beruecksichtigt:

- Taxonomie-Treffer aus Titel, Zusammenfassung, Status, Quelle und Dokumenttyp
- Dokumenttyp, z. B. Gesetzentwurf, Verordnung, Kleine Anfrage
- Quellentyp, z. B. Parlament, Verkuendung, Ministerium
- Aktualitaet
- Bonus fuer Niedersachsen-Bezug bei Foerderungs-/Bergrechtsnaehe

Score-Buckets:

- `>= 75`: hoch
- `>= 45`: mittel
- darunter: niedrig

### Heute neu

Ein Dokument ist "Heute neu", wenn `lastActivityDate` innerhalb der letzten 24 Stunden liegt.

### Heute wichtig

Die linke Kurzliste zeigt neue oder aktualisierte Dokumente mit mindestens mittlerer Relevanz. Sie soll kein separates Fenster sein, sondern ein schneller Einstieg in die wichtigsten Signale.

## Naechster sinnvoller Entwicklungsschritt

Der erste DIP-Importer ist angelegt. Er liest den API-Key aus `DIP_API_KEY`, ruft im Standardmodus Vorgaenge und Drucksachen der 21. Wahlperiode ab dem 25.03.2025 ab, filtert lokal nach Oel-/Gas-relevanten Begriffen und schreibt normalisierte Eintraege nach `public/data/documents.json`. Damit entsteht ein kleiner Legacy-Bestand aus laufenden und abgeschlossenen Verfahren der aktuellen Legislaturperiode, nicht nur ein Tagesdelta.

Zusaetzlich ist ein LBEG-Importer angelegt. Er liest LBEG-Neuigkeiten und LBEG-Presseinformationen, normalisiert Treffer fuer Niedersachsen und merged sie in `public/data/documents.json`. Der Filter priorisiert Oel/Gas, Leitungsbau und CCS, nimmt Geothermie und Lithium niedriger priorisiert auf und schliesst Tagungen, Jubilaeen und aehnliche Veranstaltungs-/PR-Treffer aus.

Ein BMWE-Importer ist angelegt und im GitHub-Workflow verdrahtet. Er liest die offiziellen RSS-Feeds fuer Pressemitteilungen und Energie, filtert streng auf Oel/Gas, LNG, Gaskraftwerke, Energieinfrastruktur, Wasserstoffleitungen/-netz, CCS/CO2-Transport und verwandte Themen. Bei 0 relevanten Treffern bleibt `documents.json` unveraendert.

Ein BMUKN-Importer ist angelegt und im GitHub-Workflow verdrahtet. Er liest die offiziellen RSS-Feeds fuer Klimaschutz, Umwelt und Natur, filtert aber besonders streng auf CCS/CO2, Methan, Industrieemissionen, konkrete Oel-/Gas-/Kohlenwasserstoffbezuege sowie Meeresschutz mit Offshore-/Foerderungsbezug. Allgemeine Natur-, Boden-, internationale Klima- oder Verbraucher-Themen sollen draussen bleiben.

Ein erster NILAS-/Landtag-Niedersachsen-Importer ist als Prototyp angelegt. Er nutzt stabile Landtags-Drucksachen-PDFs, extrahiert Text ohne zusaetzliche Abhaengigkeiten, filtert auf Oel/Gas, CCS, Leitungsbau, Bergrecht, Genehmigungsverfahren, Wasserstoffnaehe sowie niedriger priorisiert Geothermie/Lithium und normalisiert Treffer ins bestehende Dokumentformat. Er ist bewusst noch nicht im GitHub-Workflow aktiviert, weil Scanfenster und Trefferqualitaet zunaechst lokal geprueft werden sollten.

Vor Deploys sollte die Datenvalidierung laufen:

```bash
npm run validate:data
```

Der Check blockiert alte Mock-/Legacy-IDs, generische Platzhalter-URLs, Fehlerseiten-Links, fehlende Pflichtfelder und offensichtliche Dubletten. Dadurch sollen falsche Treffer mit nicht funktionierenden Originalquellen frueh auffallen.

Lokal:

```bash
npm run validate:data
npm run fetch:dip
npm run fetch:bmwe
npm run fetch:bmukn
npm run fetch:lbeg
npm run fetch:nilas
```

GitHub Actions fuehrt DIP vor dem Build aus, wenn im Repository Secret `DIP_API_KEY` gesetzt ist. LBEG laeuft ohne Secret danach und merged die Niedersachsen-Treffer in den Datenbestand.

Naechste sinnvolle Reihenfolge:

1. Eigenen DIP-API-Key beantragen und als GitHub Secret `DIP_API_KEY` hinterlegen.
2. Import einmal manuell ueber GitHub Actions `workflow_dispatch` testen.
3. Relevanzbegriffe und Normalisierung anhand echter Treffer nachschaerfen.
4. NILAS lokal mit kleinen Scanfenstern testen und danach gezielt in den GitHub-Workflow aufnehmen.
5. Danach Bundesgesetzblatt/recht.bund.de als naechste Quelle pruefen.

Empfohlene erste echte Quelle:

- DIP Bundestag/Bundesrat, weil diese Quelle offiziell maschinenlesbar ist.

Danach:

- NILAS/Landtag Niedersachsen fuer direkte Landesgesetzgebung
- Bundesgesetzblatt / recht.bund.de fuer Verkuendungen
- EU-Quellen fuer Kommissions-/Parlaments-/Ratssignale

## GitHub-Uebergabe

Empfohlener Ablauf:

1. Neues GitHub-Repository erstellen, z. B. `regulatory-radar-oel-gas`.
2. Den gesamten Projektordner committen, aber `node_modules` nicht mitgeben.
3. Freund als Collaborator einladen.
4. Beide arbeiten ueber Branches und Pull Requests.
5. Codex kann im jeweiligen GitHub-Repo weiterarbeiten, sobald Zugriff besteht.

Typische erste Git-Befehle:

```bash
git init
git add .
git commit -m "Initial regulatory radar prototype"
git branch -M main
git remote add origin <GITHUB_REPO_URL>
git push -u origin main
```

## Hosting

Fuer den aktuellen Prototyp reicht statisches Hosting:

- GitHub Pages
- Netlify
- Vercel

Wichtig: Fuer echte Datenimporte mit API-Key sollte der Import nicht im Browser laufen. Besser ist ein Build-/Update-Skript, das JSON-Daten erzeugt. API-Keys gehoeren in GitHub Secrets oder lokale `.env`-Dateien.

## Uebergabe-Checkliste

- `npm install` funktioniert.
- `npm run build` funktioniert.
- `Regulatory-Radar-Standalone.html` ist als direkt oeffnbare lokale Startdatei vorhanden.
- `Regulatory-Radar-oeffnen.html` leitet auf die Standalone-Datei weiter.
- `dist/index.html` nutzt relative Asset-Pfade.
- Mockdaten und Taxonomie sind getrennt von der UI.
- Keine Logdateien oder lokalen Zwischenartefakte muessen mitgegeben werden.
- `node_modules` soll nicht verschickt oder committed werden.

## Bekannte Grenzen

- Importer sind regelbasiert; Quellenabdeckung und Deduplikation muessen weiter stabilisiert werden.
- Keine Persistenz, keine Nutzerkonten, keine Alerts.
- Relevanzlogik ist bewusst einfach und erklaerbar, nicht KI-basiert.
- Originalquellen-URLs werden aus DIP/LBEG erzeugt, sollten aber bei neuen Quellentypen weiter geprueft werden.
- Kein juristisches Analyse- oder Beratungstool.
