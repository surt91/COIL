# COIL — Devlog (Material für einen späteren Blogartikel)

Chronologische Notizen: Entscheidungen, Irrwege, Überraschungen, Zahlen.

## 2026-09-24 — Tag 1: Brainstorming

**Auftrag:** "Große kreative Freiheit, Snake-Spiel, freie Wahl von Tech Stack und
Spielprinzip — gerne Roguelike oder Deckbuilder, rundenbasiert." Der Auftraggeber
hat bereits ~8 Snake-Klone geschrieben (C/ncurses, PyQt, JS, Matlab, REST,
Multiplayer, Rust mit Smart-Kinetic-Walk-Autopilot, RL-Autopilot mit
Actor-Critic in TF.js). Alle davon: klassisches Echtzeit-Snake.

**Leitfrage:** Was bleibt von Snake übrig, wenn man die Echtzeit wegnimmt?
Meine Antwort: zwei heilige Regeln —
1. Man kann nie stillstehen.
2. Der Körper folgt dem Kopf.

Alles andere darf sich ändern. Die zentrale Idee, die dabei herauskam:
**Länge ist die einzige Ressource** — gleichzeitig Lebensleiste, Inventar
(Segmente tragen "Grafts") und Waffe (Gegner einkreisen = würgen).

**Tech-Entscheidung:** TypeScript + Vite, Preact für Menüs, Canvas2D fürs
Spielfeld. Deterministischer, purer Kern (`state + action → state + events`)
mit Seeded RNG — damit sind Replays, Daily Seeds, Unit-Tests und headless Bots
(Balancing!) gratis. Ein Nicken zur Autopilot-Historie des Auftraggebers.

**Prozess-Experiment:** Nach dem ersten Konzept habe ich drei Subagenten mit
unterschiedlichen Rollen auf das Design losgelassen:
- ein Roguelike-/Deckbuilder-Systemdesigner,
- ein Player-Experience-/Game-Feel-Kritiker (Snake-Fan),
- ein pragmatischer Senior-Programmierer/Producer (Scope, Edge Cases, Architektur).
Ergebnisse und was ich übernommen habe: siehe nächster Eintrag.

## 2026-09-24 — Die Drei-Agenten-Kritik

Drei Subagenten, drei Rollen, parallel, nur Lesezugriff aufs Design-Dokument.
Das Ergebnis war erstaunlich komplementär — und an einer Stelle widersprüchlich.

**Systemdesigner (Roguelike/Deckbuilder):**
- Fand den größten Fehler sofort: *Weil der Körper dem Kopf folgt, verlässt nur
  die Schwanzspitze je ein Feld.* Ein auf ein Körperfeld telegraphierter Angriff
  ist praktisch nie ausweichbar — und wenn Schaden sowieso immer vom Schwanz
  abgezogen wird, ist *wo* man getroffen wird egal. Positionierung wäre bedeutungslos.
  → Lösung: zwei Angriffsarten. *Tile Strikes* (dem Kopf ausweichbar) und
  *Segment Locks*, die an einem Segment kleben und mitwandern; man kontert, indem
  man den Angreifer beißt, das Segment aus der Reichweite schiebt oder … (siehe unten).
- Stalling als dominante Strategie (im 2×2-Quadrat kreisen) → Hunger + Eskalation.
- Das Kartendeck war "angeklebt". Und dann die große Idee:
  **"Der Körper ist das Deck."** Jedes Segment trägt eine Karte, die drei hinter
  dem Kopf sind die Hand, Karte spielen = Segment verbrauchen. Energie entfällt.

**Player-Experience-Kritiker (Snake-Fan):**
- "Turn-based kills tension" → Hunger als Raum-Uhr, kein Echtzeit-Timer (höchstens
  optionaler "Frenzy"-Modus).
- Lesbarkeit ist *die* Hürde: Geister-Vorschau jedes Zugs, Schadensvorschau direkt
  auf der Schlange, Coil-Vorschau, Rot exklusiv für eingehenden Schaden.
- Art Direction "biolumineszentes Terrarium", Futter-Beule, die den Körper
  hinunterwandert, pentatonische Züge.
- Nette Nods an die Snake-Historie des Auftraggebers: ncurses-Terminal-Skin,
  "Kinetic Walk"-Karte, Bots als Geister in Daily Runs.

**Engineer/Producer:**
- 16 Regel-Edge-Cases, die vor dem Coden entschieden werden müssen (z.B. darf man
  die Schwanzspitze betreten? Nur wenn sie in diesem Zug wirklich wegzieht —
  nicht beim Wachsen und nicht, solange noch Körper im Bau steckt).
- Architektur: purer Reducer, Content als Daten mit `defineX`-Registry,
  ASCII-Fixtures für Regel-Tests, `legalActions()` als gemeinsame Quelle für UI,
  Bots und Tests. Bot-Ziel: Constrict soll ≥25% der Kills machen, sonst trägt
  die Kernmechanik nicht.
- Konstriktion vorziehen — sie ist die Identität des Spiels.

**Widerspruch:** Zählen Wände als Coil-Barriere? Engineer: nein (sonst trivial).
Designer: ja (Ecken als Killing Ground). Meine Auflösung: Wände zählen, aber ein
Coil ist nur eine abgetrennte Region, die den Körper berührt und ≤12 Felder hat.
Und der Schaden skaliert mit der Enge (1 Feld → 3/Zug, 9–12 Felder → nur festhalten).

**Was ich aus "Körper = Deck" gemacht habe:**
- Eine einzige Ressource: Segmente. Fleisch (leer) oder Item.
- Hand = die ersten drei Items hinter dem Kopf. Spielen verbraucht das Segment,
  der Körper zieht sich zusammen, das nächste Item rutscht nach.
- Treffer zerstören *das getroffene Segment samt Item* — damit ist die Position
  auf dem Brett wieder bedeutsam. Kopftreffer zerstören die Hand.
- Mein Lieblings-Konter, der sich aus der Kombination ergab: Ein Segment-Lock
  zielt auf ein Segment → **man spielt einfach das Item auf diesem Segment, und
  der Angriff geht ins Leere.**
- Fleisch ist gleichzeitig Leben und Währung (Shops nehmen Fleisch). Die
  Bones-Währung ist rausgeflogen.
- Genom = persistentes Deck; Items kommen jeden Raum zurück, Fleisch nicht (Attrition).

Designdokument → v2.

## 2026-09-24 — Vom Regelwerk zum spielbaren Run

**Ein Geometrie-Bug im Design, gefunden beim Coden, nicht beim Spielen:**
Segment-Locks sollten landen, wenn das Segment "noch benachbart" ist. Aber: Die
vier orthogonalen Nachbarn eines Feldes sind *untereinander nie* orthogonal
benachbart. Da jedes Segment jeden Zug genau ein Feld weiterrutscht, hätte ein
Lock mit Reichweite 1 (Manhattan) *immer* verfehlt — und mit Reichweite 2
*immer* getroffen. Lösung: Chebyshev-Distanz (8er-Nachbarschaft). Jetzt trifft
ein Lock, wenn der Körper an dieser Stelle um den Gegner *herumläuft*, und
verfehlt, wenn er sich *wegbewegt*. Genau das wollte ich: Positionierung zählt.
Nebeneffekt: Ein Lock auf den *Kopf* ist kaum ausweichbar (alle Ausweichfelder
liegen diagonal in Reichweite) → man muss zurückbeißen. Das ist die Frage, die
der Käfer stellen soll: "Unterbrichst du rechtzeitig?"

**Diagonale Lücken im Coil:** Mein erster Test schlug fehl, weil ich eine
diagonale Lücke für "offen" hielt. Da Gegner sich nur orthogonal bewegen, ist
sie aber dicht. Der Test war falsch, nicht der Code.

**Der pure Kern zahlt sich sofort aus:**
- Die Zugvorschau im UI ist einfach `step(fight, move)` — sie zeigt *exakt*,
  welche Segmente verloren gehen, ob man stirbt, welche Coils entstehen.
- Undo = alten State behalten.
- Speichern = `JSON.stringify(run)`, inklusive laufendem Kampf.
- Ein ASCII-Renderer + 40-Zeilen-CLI (`scripts/play.ts`) lassen mich das Spiel
  im Terminal spielen. (Und er wird später der "ncurses-Skin" als Nod an den
  allerersten C-Klon des Auftraggebers.)

**Erste eigene Testpartie (im Terminal):**
```
#...#.1@!r..#...#     Frosch telegraphiert Zunge auf (8,4),(7,4),(6,4).
#.....2.........#     Egal wohin ich ziehe: mein Nacken rutscht auf (7,4).
oooo++3..........     Carapace (vom gefressenen Käfer) schluckt den Treffer.
```
Der Frosch fragt "Bist du zu gerade?" — und die Antwort war ja.

**Parallelisierung:** Zwei Subagenten bauen nebenher unabhängige Module:
Sound-Synthese (WebAudio, keine Assets) und einen headless Balancing-Bot.
Ich baue derweil die Run-Struktur (Karte à la Slay the Spire, Belohnungen,
Molting Pool als Shop, der mit *Fleisch* bezahlt wird, Events, Mungo-Boss).

**Tutorial-Entscheidung:** Statt geskripteter Tutorial-Räume kontextuelle
Tipps, die genau einmal erscheinen, wenn eine Mechanik zum ersten Mal auftaucht
(erster Lock, erste Zungenlinie, erster Coil, erster Hunger …).

## 2026-09-24 — Der Bot als Game Designer

Ein Subagent hat einen headless Bot geschrieben: 1-ply-Greedy und 2-ply-Lookahead
über `step()`, mit einer Bewertungsfunktion (Segmentwert, Gegner-HP, Coils,
Fallen-Vermeidung per Flood Fill, landende Telegraphen). ~80 ms pro Kampf.
Er ist gleichzeitig Fuzzer (Invarianten nach jedem Schritt) und Balancing-Tool.

**Was der Fuzzer fand (bevor je ein Mensch es sah):**
1. Gegner konnten auf Futter stehen; ein tödlicher Biss bewegte den Kopf auf das
   Feld, ohne das Futter zu essen → später "wächst" die Schlange beim Betreten
   ihrer eigenen Schwanzspitze → Kopf auf Schwanz. (Dieselbe Klasse Bug hatte
   ich parallel über Molt-Häute gefunden.)
2. Softlock: Der Kopf kriecht zurück in die 1-Feld-Nische des Eingangsbaus.
   Einziger Ausweg wäre der Nacken. → Baue sind jetzt Sackgassen für den Kopf,
   und als allerletzter Ausweg darf man sich in den Nacken beißen.
3. Maulwürfe tauchten unter dem Körper auf; Flieger landeten auf dem Körper
   (und wären dann unbeißbar gewesen).

**Was die Zahlen sagten (erste Messung):**
| Metrik | Wert | Ziel |
|---|---|---|
| Crush-Anteil an Kills | 7 % | ≥ 25 % |
| Todesursache Hunger | 29–43 % | "Druck", nicht Hauptkiller |
| Eskalation | Käfer-Tretmühle, 150-Zug-Kämpfe | |

Die Diagnose des Bots war präzise: Eine 6–10 Segmente lange Schlange *kann*
offenes Gelände schlicht nicht einschließen (ein 3×3-Ring braucht 8 Segmente
für *ein* Feld). Coils waren binär — alles oder nichts.

**Gegenmaßnahmen:**
- *Wrap*: Ein Gegner, der 4+ Felder der Schlange berührt (Diagonalen zählen),
  wird auch ohne geschlossenen Ring gequetscht. Coilen wird inkrementell.
- Eskalations-Käfer und beschworene Ameisen sind "Minions" und blockieren das
  Raum-Ende nicht mehr.
- Hunger alle 12 statt 10 Züge.
- Heart war unterbepreist, Ouroboros nutzlos (0,01 Einsätze pro Kampf) →
  neu designt.

**Zweite Messung — ganze Runs (3 Akte) mit Run-Simulator:**
Neues Problem: *Fleisch explodiert* (5 → 19 → 36 Segmente). Lange Schlangen sind
zu sicher, und Fleisch als Währung verliert Knappheit. → Fleisch-Obergrenze pro
Akt (8/10/12, "den Rest verdaust du"), Gegner-HP skaliert pro Akt.

| Stand | Bot-Siegquote (Runs) | Crush-Anteil |
|---|---|---|
| vorher | 70 % | 0 % gemessen (Bug in der Zählung) |
| nach Fleisch-Cap & HP-Skalierung | 58 % | 26 % ✔ |

Interessant: Der Bot kennt alle Telegraphen und rechnet 2 Züge voraus — das
entspricht einem sorgfältigen Menschen, der die Zugvorschau nutzt. Aber er
*plant keine Coils*. Ein Mensch, der das tut, dürfte also stärker sein. Deshalb
peile ich für den Bot eher 40–60 % an und will später Schwierigkeitsstufen.
