# Regulatory Radar - Oel & Gas

Lokaler Stufe-1-Prototyp fuer ein Public-Affairs-Monitoring im Oel- und Gassektor in Deutschland.

Die App zeigt regulatorische Vorgaenge als Triage-Dashboard mit Relevanzscore, Begruendung, Tags, Detailansicht und "Heute wichtig"-Kurzliste.

Die aktuellen Beispieldaten liegen in:

```text
public/data/documents.json
```

Live-Daten aus DIP koennen mit einem API-Key erzeugt werden:

```bash
npm run fetch:dip
```

Der API-Key wird nicht ins Repository geschrieben. Lokal wird er als `DIP_API_KEY` gesetzt, in GitHub als Repository Secret mit demselben Namen.
Alternativ kann lokal eine `.env`-Datei nach dem Muster aus `.env.example` angelegt werden.

Standardmaessig laeuft der DIP-Import im Legacy-Modus fuer die 21. Wahlperiode ab dem 25.03.2025. Dadurch werden nicht nur taegliche neue Dokumente, sondern auch bereits laufende oder abgeschlossene Verfahren aus der aktuellen Legislaturperiode beruecksichtigt. Die Ausgabe bleibt ueber `DIP_MAX_DOCUMENTS` begrenzt.

Die aktuelle Datenliste kann ohne API-Abruf gegen die Importfilter geprueft werden:

```bash
npm run analyze:dip
```

## Schnellstart

```bash
npm install
npm run dev
```

Dann oeffnen:

```text
http://127.0.0.1:5173/
```

Alternativ lokal per Doppelklick:

```text
Regulatory-Radar-Standalone.html
```

Falls du lieber eine Startdatei mit Weiterleitung nutzt:

```text
Regulatory-Radar-oeffnen.html
```

## Uebergabe

Alle wichtigen Hinweise fuer Weiterentwicklung, GitHub, Hosting und echte Datenquellen stehen in:

```text
HANDOVER.md
```

Der urspruengliche Produktprompt liegt hier:

```text
docs/ORIGINAL_PRD.md
```
