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

## 2026-09-24 — Ein Playtester-Agent im echten Browser

Ein Subagent hat das Spiel ~16 Minuten lang per Playwright gespielt (Tastatur,
Maus, Screenshots, die er sich *angesehen* hat): einen ganzen Akt-1-Run inkl.
Mongoose, Debug-Kämpfe gegen alle Gegner, beide Auflösungen, Terminal-Skin.
Die besten Funde — Dinge, die weder Tests noch Bot finden konnten:

- **"Bask" heilte nichts** — weil der Fleisch-Cap aktiv war, aber nirgends
  angezeigt wurde. Die UI sagte "Regrow 5 flesh… You feel renewed."
- **Zwei verschiedene Fleisch-Zahlen** gleichzeitig auf dem Schirm (im Raum vs.
  mitgebracht).
- **Die Mungo-Schleife:** Den Boss an eine Wand drücken und 12 Züge lang
  beißen. Jeder Biss unterbricht, er kommt nie zum Zug. → Unterbrechung nur noch,
  wenn der Rückstoß *gelingt*; eingeklemmte Gegner und Bosse behalten ihre Absicht.
  Das macht aus einem Exploit eine Positionsfrage: *Wohin* beiße ich ihn?
- **Der Käfer am Eingang,** der jedes auftauchende Item frisst. Nicht
  ausweichbar, schlimmstes Erlebnis des Tests. → Die Baumündung ist sicher,
  solange man noch herauskriecht.
- Violette Bögen (Wrap) nirgends erklärt; Ausgänge schwer zu finden;
  Tipps verdecken Gegner; Rot wurde doch für Gegner verwendet (Ameisen,
  Königin) — gegen meine eigene Designregel.

Der Bot hat danach die Balance der Änderungen gemessen: Die Interrupt-Änderung
allein drückte die Bot-Siegquote von 58 % auf 23 %. Nach Nachjustieren
(Hunger 14, Boss-HP, Schildkröte: Bisse max. 1 statt immun, Elstern entkommen
nach 3 Zügen statt ewig zu fliehen — die Ursache fast aller Patt-Kämpfe)
landet sie bei ~45–60 %, Crush-Anteil ~30 %.

**Beobachtung zum Prozess:** Drei Arten von Tests finden drei Arten von
Fehlern. Unit-/Fuzz-Tests: Regel-Inkonsistenzen (Überlappungen, Softlocks).
Bot-Simulation: Balance und degenerierte Dynamiken (Tretmühlen, Patts).
Browser-Playtester: alles, was mit *Wahrnehmung* zu tun hat.

## 2026-09-24 — Charms, Spezies, und warum "+1 Bissschaden" böse ist

Neu: **Charms** (passive Relikte für den ganzen Run; von Elites, Bossen, im Shop)
und **Spezies** (Garden Snake, Viper, Python, Ouroboros — freischaltbar über
Meilensteine), die jeweils mit eigenem Genom und einem Spezies-Charm starten.

Erste Messung mit Charms: Bot-Siegquote **63 % → 93 %**. Zwei Lektionen:
1. **Flache +1 auf Bissschaden ist dominant.** Fast alle Gegner haben 2–3 HP;
   +1 halbiert die nötigen Bisse und damit die Zeit, in der sie telegraphieren
   können. Der Viper mit +1 Biss gewann 97 %. Jetzt vergiften seine Bisse
   stattdessen (2 Gift) — Schaden mit Verzögerung, der die Unterbrechung nicht
   beschleunigt.
2. **Ein Nachteil, der mathematisch keiner ist:** Der Python hatte "Bisse −1
   (min 1)". Bei Basis-Biss 1 ist das… 1. Jetzt: Seine Bisse unterbrechen nie
   (kein Rückstoß) — dafür riesige Coils. Ein echter Stilwechsel.
3. Boss-Charms bekommen Kehrseiten ("Bisse +2, aber Hunger 4 Züge früher").

Stand (lookahead2, Molt 0): Garden 67 %, Python 53 % (der Bot plant keine
Coils — Menschen dürften den Python deutlich besser spielen), Viper 83 %.

## 2026-09-24 — Playtest 2: "Die einfachste Aktion schlägt die Signatur-Aktion"

Der zweite Playtester hat einen kompletten Run **gewonnen** (alle drei Bosse,
15 Räume, 54 Kills, davon 39 durch Coil/Wrap) — und die schärfste Kritik des
ganzen Projekts geliefert:

> Right now the easiest action (touch 3 tiles) outperforms the signature one
> (enclose), and the snowball erases the challenge.

Ein Wrap passiert entlang von Wänden fast gratis; mit zwei Crush-Charms machte
er 3 Schaden pro Zug. Ein echter Ring kostet 5–8 geplante Züge und mehrere Items.
Und ab Akt 2 war die Schlange 30+ Segmente lang: nichts war mehr bedrohlich.

**Änderungen:**
- Wrap macht pauschal 1 und profitiert von keinem Bonus.
- Echte Coils sind jetzt die Belohnung: **eingeschlossene Gegner können weder
  sich bewegen noch angreifen.** (Vorher konnten sie den Ring beißen.)
- **Das Genom ist jetzt wirklich ein Deck:** Pro Raum wachsen nur 8 zufällige
  Items. Das begrenzt die Länge, macht Genom-Verdünnung zu einer echten Kosten
  und "Item entfernen" im Shop zu einer echten Entscheidung. (Mit 7 statt 8
  sank die Bot-Siegquote von 60 % auf 40 % — die Stellschraube ist empfindlich.)
- Bugs: Events ignorierten den Fleisch-Cap; wer das Item vor dem Charm wählte,
  verlor den Charm; der Autopilot farmte nach dem Säubern Minions statt
  hinauszugehen und verhungerte (in einem Spiel, in dem man ihn per Taste
  einschalten kann!); Shop-Käufe ohne Undo.

Bot-Stand: 58 %, die Tode konzentrieren sich jetzt auf die drei Bosse.

## 2026-09-25 — Der erste menschliche Spieler

Der Auftraggeber hat Akt 1 durchgespielt. Sein wichtigster Befund:

> Ich habe zwei Durchläufe verloren, bevor mir klar wurde, dass ich die
> Items/Karten sehr freizügig einsetzen muss.

Das ist das klassische "Zu gut zum Benutzen"-Problem (Heiltränke in RPGs),
hier verstärkt durch die Kernidee selbst: *Karte spielen = kürzer werden*
fühlt sich an wie Schaden. Zwei Subagenten (Systemdesign vs.
Spielerpsychologie) kamen unabhängig zur selben Diagnose — und die war
beschämend einfach: **Das Spiel hat nirgends gesagt, dass Items im nächsten
Raum zurückkommen.** Dazu zählte die HUD "Segmente" als große Zahl, Items
inklusive. Jeder gespielte Item ließ die Lebensanzeige sinken.

Änderungen:
- HUD trennt ♥ Fleisch (Leben, trägt sich weiter) von Items (↻ kommen zurück).
- Gespielte Items nähren: pro 2 gespielte +1 Fleisch am Raumende (max. 2).
  Das Horten kostet jetzt sichtbar etwas.
- Handkarten, auf die ein Gegner zielt, pulsieren rot: "Targeted! Play it —
  the attack fizzles." (Die Regel existierte schon seit Tag 1, war aber unsichtbar.)
- Vorschau unterscheidet "Spend: Lunge (back next room)" von "Destroyed unplayed".
- Raum-Bilanz auf dem Belohnungsbildschirm: gespielt / verschwendet.
- "Passive:" heißt jetzt "While carried:", "consumes the segment" ist weg.

Außerdem: Item-Upgrades ("Molting") für alle 23 Items, 10 neue Events (ein
Nokia-Stein im Moos mit HIGHSCORE 3310, ein Blockade-Automat von 1976, ein
Einsiedlerkrebs, der Segmente tauscht …), ein neuer Schlangen-Renderer
(Catmull-Rom-Mittellinie, gefülltes Polygon mit Verjüngung, Rautenmuster,
Keilkopf mit Schlitzpupillen) und prozedurale Kartenillustrationen — alles
weiterhin ohne eine einzige Bilddatei.

## 2026-09-25 — Playtest 3 und Deployment

Dritter Browser-Playtest, diesmal mit dem Auftrag "spiel wie ein neuer Spieler":
Die Ammo-Botschaft kommt an ("verstanden in Zug 4 des ersten Kampfs, durch den
Tipp; der rote Puls auf Fang in Zug 8 hat es verstärkt"). Gefunden wurden vor
allem Layout-Fehler (abgeschnittene Karten, eine CSS-Regel, die unter 1200 px
*alle* Passiv-Texte versteckte) und eine Namenskollision: "Molt" war
gleichzeitig die Upgrade-Aktion, ein Item und die Schwierigkeitsstufen. Jetzt:
Molt = Upgrade, das Item heißt "Ghost Skin", die Stufen heißen "Depth".

Außerdem: Die schwächsten Illustrationen (Gorge, Acid, Silk) sind neu,
gehäutete Items haben einen Goldrahmen, Event-Modifikatoren für den nächsten
Kampf sind als Chips auf Karte und HUD sichtbar.

Deployment: GitHub Actions baut und testet bei jedem Push und deployt auf
GitHub Pages. Eine `CLAUDE.md` hält fest, wie hier gearbeitet wird — inklusive
der Regel, dass dies *mein* Spiel ist und Vorschläge des Auftraggebers
Denkanstöße eines Spielers sind.

## 2026-09-25 — Ein Art-Director-Agent und das Handy

**"Alle Schlangen sehen gleich aus."** Stimmt: Jede Spezies war dieselbe
türkise Schlange. Jetzt hat jede eine eigene Anatomie: Garden (Rauten, Keilkopf),
Viper (Zickzack-Band, Pfeilkopf, schlank), Python (Sattelflecken mit hellem
Rand, stumpfer Kopf mit Wärmegruben, 22 % dicker), Ouroboros (Ringe, runder Kopf).

Dafür gibt es jetzt einen **Art-Critic-Agenten** (`.claude/agents/art-critic.md`)
und eine Style-Sheet-Seite (`?gallery`), die jede Grafik des Spiels auf einer
Seite zeigt. Seine härtesten Befunde:
- Der Rivale war "ein umgefärbter Spieler-Viper", der Endboss ein goldener
  Spieler-Ouroboros — *Gold bedeutet aber Futter/Belohnung*. Jetzt: Rivale
  olivgrün mit Sattelmuster und langer Schnauze, Boss knochenweiß-obsidian mit
  Doppelringen und Hörnerkrone.
- Das ">" im Schlangengesicht las sich wie ein UI-Pfeil → Maullinie, Nasenlöcher,
  Kopfzeichnung pro Spezies.
- Drei verschiedene Outline-Regime → alle Kreaturen bekommen denselben dunklen
  Rand (per Canvas-`drop-shadow`-Filter, eine Zeile statt 15 Pfade).
- Glyphen-Kollisionen bei 16 px (drei "Kreise", drei "Ovale").
- Pac-Man-Kiefer auf der Swallow-Karte: "an off-style meme icon".

**Mobil:** Bisher unspielbar (Hover-Vorschau, feste Seitenleiste). Jetzt:
Tippen/Wischen zeigt die Vorschau, nochmal bestätigt; Infos als Bottom-Sheet;
und im Hochformat wird das 17×13-Brett um 90° gedreht dargestellt (Kacheln
~40 % größer). Texte und Glyphen werden dabei per gepatchtem `fillText`
zurückgedreht, Wischrichtungen umgerechnet — die Spiellogik merkt nichts davon.

## 2026-09-25 — Der Körper bekommt eine Reihenfolge

"Setze die Entwicklung fort" — ohne Vorgabe. Also zuerst drei Agenten parallel
losgeschickt, jeder mit einer anderen Frage: ein **Playtester** (spiel einen
ganzen Run, wo ist Mid- und Late-Game langweilig?), ein **Systemdesigner**
(was ist die größte Schwäche an Tiefe und Wiederspielwert?) und eine
**Spielerpsychologin** (warum sollte jemand nach dem dritten Run einen vierten
starten?). Dazu eine Bot-Baseline: 50 % Siege, Crush-Anteil 26 %, und — das
war der auffälligste Befund des Systemdesigners — *kein einziger* der 20 Tode
ging auf einen Akt-3-Gegner. Die Hälfte waren Hunger und Stalls.

**Die Diagnose des Systemdesigners war unbequem:** Die Kernidee "der Körper ist
das Deck" hat keine *Anordnung*. Jeder Raum mischte die Items neu; übrig blieb
ein gewöhnliches Zufallsdeck mit Handgröße 3. Der Beweis: Der Bot wählt
Belohnungen nach einer starren Tier-Liste und gewinnt trotzdem die Hälfte.

### Das Ring-Genom

Das Genom ist jetzt ein **geordneter Ring**, den man zwischen den Kämpfen frei
umsortiert (Klick, Klick — auf Desktop auch Drag & Drop). Jeder Raum beginnt an
einem zufälligen Punkt des Rings und zieht die nächsten 8 Items *in Reihenfolge*.

Beim Testen fiel mir ein Denkfehler auf, der auch im Vorschlag steckte: Weil der
Startpunkt zufällig ist, kontrolliert man nicht, *wo* ein Item im Körper landet —
nur, *was neben was* liegt. Ich habe das so gelassen. Ein fester Startpunkt hätte
heißen: die besten 8 nach vorn, fertig. So entstehen stattdessen Nachbarschafts-
Entscheidungen: Fang direkt vor Lunge (eine Hand, ein Kombo), starke Items
gleichmäßig verteilen, damit jede Hand etwas taugt. Dafür gibt es jetzt Items,
die genau darauf zielen (entworfen von der Content-Designerin):

- **Knot** ist an das Item *hinter* ihm geknüpft: ausgespielt zieht er es in die
  Hand, und stirbt ein Gegner in einem Coil, den der Knot berührt, wächst eine
  Kopie des geknüpften Items nach.
- **Scute** schützt seine beiden Nachbarsegmente vor Bissen, Schnitten und Diebstahl.
- **Heat Pit**: Bisse +2 gegen Beute im Coil, den das Segment berührt.
- **Muscle** wurde zum "Ring"-Item: +1 Crush nur noch für Coils, die sein Segment berührt.

### Was du zerquetschst, frisst du

Die kleinste Änderung mit der größten Wirkung: Ein im Coil zerquetschter Gegner
wird verschluckt, wie beim tödlichen Biss (+1 Fleisch, Hunger zurückgesetzt).
Vorher war der Coil — die Signatur-Waffe — die einzige Tötungsart, die *hungrig*
machte. Crush-Anteil: 26 % → 34 %.

Dazu ein Akt-3-Gegner, der die Frage "Coilst du ihn?" wirklich stellt: die
**Brood Grub**. Tötet man sie anders als durch Zerquetschen, platzt sie in zwei
Grublinge, die zu klein sind, um satt zu machen.

### Bosse, die man nicht "anparken" kann

Der Playtester gewann einen ganzen Run und schrieb als Problem Nr. 1:

> Bosse gewinnt man, indem man neben ihnen parkt und beißt. "Du kannst nie
> stillstehen" verschwindet, weil ein Biss dich nicht bewegt.

Stimmt — ein Biss auf etwas Überlebendes ist die einzige Aktion, bei der der
Kopf stehen bleibt, und Bosse werden nie zurückgestoßen. Zwei Agenten
(Systemdesign gegen Spielerpsychologie) schlugen unterschiedliche Lösungen vor:
der eine eine allgemeine Regel, die andere pro Boss eine eigene Lektion
("Mungo: ködern und umwickeln"). Ich habe die allgemeine Regel genommen, weil sie
genau das Heiligtum repariert, das kaputt war:

- **Konter:** Überlebt ein Boss deinen Biss, markiert er dein Kopffeld rot. Stehst
  du nach dem nächsten Zug noch dort, schlägt er zu. → Man muss um den Boss kreisen.
- **Entblößt:** Wer um einen Boss kreist, umwickelt ihn fast von selbst. Ein
  umwickelter oder eingekreister Boss wird zurückgestoßen, unterbrochen, nimmt +1
  und kontert nicht. So zahlen sich auch lockere Coils aus.

Die Boss-Ideen der Psychologin liegen auf Halde, bis ein Playtest zeigt, ob die
allgemeine Regel reicht.

Ein Bug im Test der Konter-Regel war lehrreich: Der zweite Biss überschrieb die
ausstehende Markierung, bevor sie zuschlagen konnte — die Regel feuerte also
genau im Parkfall *nie*. Die erste Bot-Messung (59 %) war damit wertlos; erst der
Regeltest hat es gezeigt.

### Balance

Die **Balance-Analystin** fand den Grund, warum Akt 3 plötzlich trivial war:

> Die Ouroboros stirbt an einem Biss. Ein Biss knapp hinter den Kopf trennt
> 17–21 von 22 HP ab. Mehr als die Hälfte der Kämpfe wurde von einem einzigen
> Biss entschieden. hp 26 statt 22 änderte gar nichts.

Außerdem fütterten ihre beschworenen Glühwürmer den Spieler durch den Kampf.
Meine eigene Idee (mehr HP für Akt-2/3-Gegner) hatte sie ebenfalls gemessen:
kein Effekt, weil die Crush-Fütterung die längeren Kämpfe wieder bezahlt.
Verworfen. Jetzt: Ein Biss trennt einem Boss höchstens 5 Segmente ab, die Brut
der Ouroboros macht nicht satt, und die Ameisenkönigin legt ihre Ameisen im
Umkreis 2 — wer daneben parkt, blockiert sie nicht mehr.

| | Siege | Crush-Anteil | Tode nach Akt |
|---|---|---|---|
| Morgens | 50 % | 26 % | 9 / 5 / 6 |
| + Crush frisst, Ring-Genom, neue Items | 65–70 % | 37–41 % | 8 / 3 / 2 |
| + Boss-Paket | **48 / 53 / 58 %** | 37–41 % | 7 / 5 / 7 |

### Der Endbildschirm schaut nach vorn

Die Psychologin: Der Endbildschirm zeigte nur Statistiken und "Back to title".
Freischaltungen passierten still. Jetzt: Todesursache mit Akt und Raum,
persönlicher Rekord ("Deepest yet: Act 2, room 5"), was dieser Run freigeschaltet
hat, eine Meilenstein-Leiste mit dem *nächsten* Ziel ("Next: defeat the Ant Queen
to wake the Python"), ein Beiname für den Spielstil ("You fought like a
Constrictor — 22 of 40 kills crushed in coils") und ein großer Knopf "Shed your
skin and go again" auf Enter. Nach einem Boss kündigt ein Banner die neue Spezies
an, auf dem Titelbildschirm trägt sie ein NEW-Band.

Kleinere Funde des Playtesters, gleich mit behoben: Coiled Strike unterbrach
Bosse, Fleisch konnte über der Obergrenze liegen, nach dem Säubern eines Raums
wuchs endlos Futter nach (man konnte sich vollfressen — jetzt: gesäubert heißt
gehen), und Event-Entscheidungen erklären jetzt die Items, die sie nennen.

## 2026-09-25 — Zweite Runde: Räume, Karte, und was man nicht sieht

**Eigene Räume pro Akt.** Der Playtester hatte "Open Lawn" in allen drei Akten
gesehen. Jetzt hat jeder Akt mindestens fünf eigene Räume: die Wurzeln verschlungen
und voller Engstellen (Taproot, Warren, Root Knot), die Tiefe mit Säulenhallen,
einer Schlucht mit nur einer Brücke und einer Grotte, deren Innenhöhle nur einen
Eingang hat (ein Coil wartet darauf, geschlossen zu werden). Ein neuer Test prüft,
dass jeder Raum zusammenhängend ist und einen erreichbaren Ausgang hat — er fand
sofort einen Ausgang hinter einer Wand.

**Die Karte.** Gemessen über 500 Karten: An **83 %** der Knoten gab es genau einen
Weg weiter. Jetzt sechs Pfade ohne Kreuzungen plus Querverbindungen, und kein
Spezialknoten folgt auf denselben (kein "Bask → Bask → Elite" mehr): 55 %.

**Ein Bug, den der Bot fand, indem er ihn ausnutzte.** Nach den Boss-Kontern
endete ein Ouroboros-Kampf mit 136 Fleisch. Die Spur: Ein Kopftreffer zerstört die
zwei Segmente hinter dem Kopf. War eines davon ein *Clutch* (gehäutetes Ei), schlüpfte
es — und setzte dabei eine temporäre Fang *vor* sich. Der Treffer entfernte dann den
Index, nicht das getroffene Segment: die frische Fang starb, das Clutch blieb. Jeder
Konter: +6 Fleisch. Der Bot hatte gelernt, sich absichtlich kontern zu lassen.
Fix: das getroffene Segment per Identität entfernen, plus Regeltest, der ohne Fix rot ist.

**Zwei Playtests, eine Botschaft: Die Regeln sind gut, aber unsichtbar.**
Der Handy-Tester: "Tipps sind auf dem Handy unsichtbar" — sie lebten im geschlossenen
Info-Sheet, der Konter wurde einem Handy-Spieler also *nie* erklärt. Der Desktop-
Tester: "Die Boss-Regeln sind gut, aber man sieht sie nicht, also fühlen sich
Bosskämpfe wie unerklärte Zermürbung an." Sein bester Moment dagegen:

> Um den Mungo kreisen. Mein Körper umwickelte ihn (die violetten Bögen), er nahm
> Quetschschaden, und der entblößte Biss stieß ihn für 2 zurück. Das ist die
> beabsichtigte Schleife, und wenn sie klickt, ist sie großartig.

Also: Tipps schweben auf dem Handy über dem Brett, dringende Tipps (Konter, Brut)
drängeln sich in der Warteschlange vor, die Konter-Markierung pulsiert *über* dem
Kopf statt darunter, die Vorschau sagt "The boss marks this tile", ein entblößter
Boss trägt einen violetten Ring mit "EXPOSED", und die Inspektion erklärt beides.

Kleinere Funde: Die Genom-Übersicht öffnete sich auf dem Handy außerhalb des
Bildschirms (ein `position: fixed` in einem transformierten Eltern-Element — Portal),
schwebende Texte stiegen auf dem gedrehten Brett *seitwärts* auf und überlagerten
sich, und nachdem nach dem Säubern kein Futter mehr wächst, verhungerte der Autopilot
einen Schritt vor dem Ausgang. Jetzt steht in gesäuberten Räumen auch der Hunger still.

Balance nach allem: 48 / 53 % (zwei Seeds), Tode an den drei Bossen.

## 2026-09-25 — Weniger lesen, mehr sehen

Der Auftraggeber: *"Mir scheint das Interface sehr minimalistisch und textlastig zu
sein. Ein gutes Spiel sollte keine langen Texte benötigen, um sich zu erklären."*
Drei Blicke darauf, parallel: Spielerpsychologin, Art-Critic und ein Playtester mit
der Anweisung, sich zu *weigern* zu lesen.

Die Diagnose war bei allen dreien die gleiche, die Psychologin hat sie am knappsten
formuliert: Das Brett zeigte die meisten Regeln längst (rote Kacheln, Fadenkreuz,
violette Bögen, Vorschau-Geist mit roten Kreuzen), der Text wiederholte sie nur. So
lernt man als Spieler, Text zu überspringen, und verpasst dann genau die drei Regeln,
die das Brett *nicht* zeigt: Items kommen zurück, Fleisch wird mitgenommen, und wie
stark ein Coil quetscht. Ihre Regel dazu: **Das Brett nennt die Fakten, der Text gibt
ihnen Namen.**

Der Nicht-Leser hat drei Räume gewonnen, und zwar nur über die Vorschau:

> Hover-Vorschauen sind das Beste am Spiel. Ab Zug 3 habe ich jede Entscheidung
> anhand der Vorschau getroffen.

Er hat aber nie selbst etwas eingerollt ("nichts auf dem Brett zeigt 'dieser Zug
würde X einschließen'"). Ein Kopf-Biss war für ihn "ein paar rote Pixel unter den
Mandibeln", weil das Fadenkreuz *unter* dem Kopf gezeichnet wurde. Und die rosa
Zunge hielt er für eine Angriffsmarkierung, weil Rot doch Schaden heißt.

Was sich geändert hat:
- **Tipps haben nur noch einen Satz.** Der Fadenkreuz-Tipp hatte vorher 14 Zeilen,
  jetzt: *"Red reticle: that segment gets bitten — unless it slides out of the red
  box, or you bite the attacker first."*
- **Die Regel-Seitenleiste ist weg.** Übrig sind eine Tastenzeile und ein
  zugeklapptes "Rules". Auch das "How to play" auf dem Titelbildschirm ist
  zugeklappt, von sechs Absätzen auf fünf kurze Zeilen geschrumpft.
- **Das HUD zeigt Bilder statt Prosa.**
  - Vorher: `4 flesh (carry ≤8) · 6 items left ↻ all return next room · 10 in burrow`.
  - Jetzt: 4 volle Herzen und 4 hohle bis zur Mitnahmegrenze, dazu eine Reihe mit
    den Items des Raums (gespielte verblassen, ↻ dahinter) und eine goldene
    Hunger-Leiste.
  - Dass Items zurückkommen, sieht man jetzt: Das verblasste Icon bleibt stehen.
- **Die Quetsch-Tabelle steht jetzt auf dem Brett.** Ein violettes "−2" unter jedem
  eingerollten Gegner. In der Vorschau steht ein gestricheltes "−3" auf dem Gegner,
  den der Zug einschließen *würde*. Die Tabelle `1 Feld: 3, 2–3: 2, 4–8: 1` muss
  niemand mehr lesen, man vergleicht einfach zwei Vorschauen.
- **Kleinigkeiten mit großer Wirkung:**
  - Das Fadenkreuz wird über der Schlange gezeichnet, um den Kopf größer.
  - Die Zunge ist schiefergrau (Rot ist für Schaden reserviert).
  - Netz-Absichten sind silbern statt violett (Violett gehört den Coils).
  - Die Vorschau warnt, wenn ein Fang-Bonus verfällt, weil in diesem Zug kein Biss
    kommt.

Bewusst abgelehnt habe ich das Symbolvokabular des Art-Critics: Karteneffekte als
Icon plus Zahl, dazu 3×3-Minigitter für Reichweiten. Kartentext gehört zu einem
Deckbuilder. Die Grenze ist: **Text für das, was sich pro Item unterscheidet,
Brett-Feedback für alles, was in jedem Kampf gleich ist.** 12-Pixel-Gitter wären nur
eine neue Sprache, die man erst lernen müsste. Den Passivtext kürze ich auf eine
Zeile mit ◇, den Rest gibt es beim Hovern.

## 2026-09-25 — Kartentext, der passt, und der erste Coil ohne Erklärung

**Kartentext.** Der Auftraggeber: *"Der Itemtext ist manchmal zu lang für die Karten.
Items dürfen Text haben, aber er sollte lesbar sein"* (aufgefallen beim Passivtext von
Ouroboros). Meine Ein-Zeilen-Ellipse aus dem letzten Schritt hatte es noch
verschlimmert. Aus "kürzer" wurde deshalb ein Budget: höchstens 72 Zeichen aktiv und
60 Zeichen passiv. Ein Inhaltstest bewacht das Budget. Zusätzlich misst ein
Browser-Skript für *jedes* Item, ob die Karte bei 1400 px, 1150 px und auf dem Handy
überläuft. 38 Texte wurden neu geschrieben, die Mechanik blieb gleich. Beispiel
Double Knot, von 177 auf 59 Zeichen:

> ~~When an enemy is crushed to death in a coil this segment borders — or squeezed to
> death right next to it — a temporary copy of the next item behind it grows behind
> your head.~~
> Coil or squeeze kill beside it: temp copy of item behind it.

**Der erste Coil.** Der Nicht-Leser aus dem letzten Test hatte nie selbst etwas
eingerollt. Die Psychologin hat den Grund benannt: *"Die Vorschau schaut einen Zug
voraus, ein Coil ist ein Plan über drei bis fünf Züge. Das gestrichelte '−3'
erscheint genau dann, wenn man es nicht mehr braucht."* Daraus sind zwei Dinge
entstanden:

- **Pocket-Hinweis.** Eine Breitensuche über die eigenen Züge (höchstens 4 Züge,
  etwa 10 ms) findet den nächsten erreichbaren Coil. Die Tasche glimmt dann
  violett, und auf dem Gegner steht "−2?". Das Ziel ist sichtbar, der Weg nicht.
  Der Hinweis gilt nur für die ersten drei Coils einer Karriere, danach nimmt er
  sich zurück.
  - Überraschung: Die Suche fand zuerst *nichts*. Der Grund: Ein Coil, der sofort
    tötet, hinterlässt keinen eingerollten Gegner, sondern nur seinen Quetschschaden
    im Ereignisstrom.
  - Zweite Überraschung: Coils sind in kleinen frühen Kämpfen schlicht selten. Der
    Bot schloss 4 in rund 1500 Zügen. Der Hinweis hilft also, wenn es eine Chance
    gibt, aber er erschafft keine.
- **Die Kinderstube.** Deshalb ist der erste Kampf des ersten Runs die "Nursery",
  entworfen vom Systems-Designer. Ein Käfer sitzt in einer Wandnische, und eine alte
  Haut (ein Husk, der nicht verfällt) verstopft den Ausgang. Auf dem einzigen Weg in
  den Raum frisst man die Haut, der Körper versiegelt die Nische, und in Zug 2 steht
  dort "−2". Der zweite Käfer landet an der Wandecke, wo der Gang sich öffnet, und
  dort wird es eine echte Wahl zwischen Beißen und Umwickeln.
  - Getestet über fünf Seeds.
  - Nicht als Tutorial beschriftet.
  - Nie in Tages-Runs oder für Bots.
  - Der Zufallsstrom des Runs bleibt identisch, weil die Auswahl erst *nach* den
    normalen Ziehungen ersetzt wird.

Die Psychologin warnte vor dem Gegenteil: *"Kein Geisterpfad — er löst das Rätsel,
und man zeichnet ihn nur nach."* Daran habe ich mich gehalten.

Außerdem:
- Die Knoten auf der Karte sind nach Typ eingefärbt (Pool blau, Nest gold, Elite
  orange und gestrichelt).
- Der Belohnungsbildschirm ist kürzer.
- Der Coil-Tipp drängelt sich jetzt vor.
- Der Hand-Tipp wartet bis Zug 5, damit Raum 1 nicht vier Tipps in vier Zügen zeigt.

**Nachtrag, Handy-Playtest.** Die Kinderstube funktioniert: *"Ich habe 'die Nische
zu versiegeln hat ihn getötet' verstanden, ohne zu lesen."* Der schlimmste Fund war
aber hausgemacht. Das neue Bilder-HUD bricht bei mehr Items in eine zweite Zeile um,
die Brettfläche wird dadurch ein paar Pixel flacher, und der Renderer entscheidet die
Drehung neu. *Das Brett kippte mitten im Elite-Kampf ins Hochformat.* Jetzt fällt die
Drehung nur noch, wenn sich die Bildschirmausrichtung selbst ändert, und das HUD hat
auf dem Handy eine feste Höhe. Außerdem:
- Leere Coils versprechen in der Vorschau nichts mehr.
- Eine gezielte, aber unspielbare Karte sagt nicht mehr "play it!".
- Blockierte Karten nennen auf dem Handy den Grund.
- Der Passivtext steht jetzt im Tipp-Popup.
- Die Haut sieht aus wie Haut und nicht wie ein Knopf.

**Die offenen Punkte.**

- **Hunger:** Statt die Leiste besser zu beschriften, steht die Folge jetzt dort, wo
  sie eintritt. In den letzten drei Zügen zählt eine bernsteinfarbene Zahl auf der
  Schwanzspitze herunter, also auf dem Segment, das der Hunger frisst (bzw. auf der
  Fat Reserve, wenn man eine trägt). Bernstein und nicht Rot, denn Hunger ist kein
  eingehender Schaden.
- **Das kryptische "↻ +2♥":** Gemeint war die Regel "jedes zweite gespielte Item
  lässt am Raumende 1 Fleisch nachwachsen". Jetzt pulsiert das nachwachsende Herz in
  der Herzreihe. Beim Verdienen steigt über dem Kopf "+1♥ at room end" auf. Herzen
  über der Mitnahmegrenze sind grau statt nur blass, damit man sie nicht mit den
  pulsierenden verwechselt.
- **Überlappende schwebende Texte:** Bisher wurde nur gestapelt, was jünger als
  500 ms und näher als 3 Felder war. Ältere, noch steigende Texte und Nachbarspalten
  wurden ignoriert. Jetzt kennt jeder Text seine gemessene Breite und Höhe, und ein
  neuer rückt so weit nach oben, bis er keinen sichtbaren mehr überlappt (auch auf
  dem gedrehten Brett).
- **Pacing:** Der Handy-Tester wurde als drittes Kampfziel in ein Elite gezwungen,
  im selben Raum wie davor. Neue Kartenregel: **Elites sind eine Wahl, nie ein
  Muss.** Ein Elite steht nie hinter einem Knoten, der nur dorthin führt. Außerdem
  kommt derselbe Raum nie zweimal hintereinander.
  - Balance, je 4 × 40 Runs: vorher 48/53/40/55 % (Mittel 49 %), nachher
    55/35/38/48 % (Mittel 44 %), Stalls 12 → 8.
  - Der Unterschied liegt innerhalb des Rauschens (Standardfehler etwa 5,6 %).
    Weil die Karte jeden Run neu würfelt, sind die Stichproben praktisch unabhängig.
  - Ich stelle nichts nach, beobachte es aber: Bleibt es unter 45 %, ist das der
    Hebel.

## 2026-09-26 — Der sicherste Zustand im Spiel, und Schlangen, die nie stehen

**Nackter Kopf.** Der Desktop-Playtester hat zum ersten Mal einen ganzen Run bis
Akt 3 gespielt und dabei etwas gefunden, das keine Zahl verraten hatte: *"Von Zug 24
bis 79 war die Schlange ein Feld lang, mit 0 Fleisch. 55 Züge ohne Entscheidung."*
Im zweiten Run hat er die Ameisenkönigin sogar als nackter Kopf besiegt. Der
Systems-Designer hat den Grund im Code gefunden: Jede Bedrohung zielt auf
Segmente. Locks, Severs, Stacheln und Hunger brauchen etwas hinter dem Kopf, und
der Kopf selbst kann jedem angekündigten Angriff ausweichen. Jedes Futter ist ein
Extraleben, das der nächste Biss wieder abnimmt. **0 Segmente waren der sicherste
Zustand im Spiel.** Die Spannungskurve lief rückwärts.

Die Psychologin warnte vor der naheliegenden Lösung "sofort tot": Die Geschichten,
die man weitererzählt, sind die mit "ein Feld, drei Züge, ich hab's zum Futter
geschafft". Der Systems-Designer warnte vor ihrer Lösung, einem Countdown, der sich
durch Fressen auffüllt, weil das nur die Schleife verlängert. Entschieden habe ich:
**6 Atemzüge pro Kampf.** Jeder Zug ohne Segmente kostet einen, und verbrauchter
Atem kommt nicht zurück. Die Punkte stehen als weißer Kranz um den Kopf (nicht
rot, denn es greift niemand an, man geht nur aus), dazu ein Herzschlag.

Die Bot-Quote fiel erst auf 41 % (Ersticken wurde Todesursache Nr. 1). Dem Bot
beizubringen, dass Atem etwas wert ist, half nur wenig, und 9 Atemzüge brachten
gar nichts. Die zusätzlichen Tode waren genau die zähen Siege, die die Regel
abschaffen soll.

**Schlangen, die nie stehen.** Dann die Frage des Auftraggebers, der das Spiel auf
dem Handy durchgespielt hat: *"Ich habe das Gefühl, dass Gegnerschlangen manchmal
stehen bleiben. Sollten sie nicht auch immer ziehen müssen?"* Richtig. Die Rival
Snake "spielt nach deinen Regeln", biss aber mit demselben Lock wie ein Käfer und
stand dabei still. Die Psychologin: *"Eine Schlange, die still steht, hat aufgehört
zu kommunizieren."* Der Systems-Designer hat die ehrliche Symmetrie gefunden: Auch
der Spieler bleibt beim Beißen stehen. Die Regel heißt also nicht "Schlangen halten
nie an", sondern **"Schlangen warten nie: jeder Zug ist ein Bewegungsversuch, und
ein Biss ist eine Bewegung in ein besetztes Feld."**
- Der Biss ist ein *Lunge*: ein rotes Feld mit Pfeil vom Kopf. Was nach deinem Zug
  dort liegt, wird gebissen, ein leeres Feld gleitet sie einfach hinein. Danach
  muss sie erst wegziehen, bevor sie wieder beißt.
- Blockiert, weicht sie aus. Ganz eingesperrt, frisst sie ihren eigenen Schwanz und
  wirft Hüllen ab. Bei der Ouroboros ist das wörtlich der Mythos.
- Die einzige Ausnahme ist der Coil.

Die Überraschung kam beim Messen des Endbosses allein: Die Siegquote des Bots stieg
von 50 % auf 87 %. Er verlor im Schnitt nur 1 Fleisch statt 7. In 488 Zügen hatte
die Ouroboros nur **10 Mal** zugestoßen. Sie jagte die Schwanzspitze, deren Feld
nach jedem Zug leer ist, und wenn sie dort ankam, durfte sie weder warten noch die
Spitze beißen. Also wich sie zum offensten Feld aus, weg von der Beute. Drei
Korrekturen:
- Sie jagt das hintere Körperdrittel statt der Spitze.
- Beim Ausweichen bleibt sie nah an der Beute.
- Ihr Lunge reicht 2 Felder weit.

Dazu kamen 30 statt 22 HP und ein Glühwürmchen alle 4 statt alle 6 Züge. Damit steht
es bei 65 % im Einzelkampf.

Gesamtbalance, je 40 Runs: 53 % / 45 %, Crush-Anteil 38–40 %. Die Tode sitzen
wieder bei den Bossen. Außerdem:
- Bosse schlucken einen Zug lang, nachdem ihr Lock gelandet ist. Der
  "Fleischwolf" (ein Mungo, der sich jeden Zug ein vorbeigleitendes Segment
  holt) ist damit weg.
- Belohnungen erinnern sich an die letzten zwei Angebote.
- Die Karte passt auf den Bildschirm.
- Der Fuzz-Test hat einen alten Fehler aufgedeckt: Maulwürfe konnten in einen
  anderen, eingegrabenen Maulwurf hinein auftauchen.

**Nachtrag, zwei Berichte später.** Der Handy-Tester fand die Ouroboros am
Eingang lauernd. Solange der Körper noch aus dem Bau kam, schnitt ihr
Sever-Lunge alles ab, was noch drinsteckte: 10 Segmente auf 2, ohne jede
Ausweichmöglichkeit. Neue Regel: **Solange du noch auftauchst, beißt ein Sever
nur.** Den Lunge-Marker sah man auf dem Handy kaum, weil das rote Feld unter dem
eigenen Körper verschwand. Jetzt liegen Eckklammern über dem Segment, dazu ein
großer Pfeil. Außerdem färbt die Vorschau jeden Angriff grau, dem der angezeigte
Zug ausweicht. Das war die Antwort auf "wird es treffen?", die dem Fleischwolf
gefehlt hatte.

Der Balance-Analyst hat 680 Runs über fünf Tiefen gerechnet und den schönsten
Fund des Tages gemacht: **Man konnte nach dem Sieg über den Endboss noch
sterben.** In 5 von 13 Bossraum-Niederlagen war die Ouroboros schon tot. Der Raum
galt als geräumt, also wuchs kein Futter mehr, ihre Glühwürmchen blieben, und der
nackte Kopf erstickte oder wurde zu Tode gespuckt. Alle 8 Stalls bei Tiefe 0 waren
genau das. Jetzt stirbt die Brut mit ihrem Boss.

Weitere Änderungen:
- Die Königin legte Ameisen, die satt machten. Verlorene Kämpfe zogen sich so bis
  zu 196 Züge hin. Ab Zug 40 ist ihre Brut zu klein zum Fressen.
- Tiefe 1 ("Hungrier") bewirkte gar nichts: 51 % gegen 50 %. Jedes Futter, jeder
  Biss-Kill und jeder Crush setzt den Hunger zurück, deshalb gab es nur 0,2–2
  Hunger-Ereignisse pro Kampf. Mit Hunger alle 9 statt alle 10 Züge liegt Tiefe 0
  bei 52 % und Tiefe 1 bei 42 %.

## 2026-09-26 — Die Ouroboros als Duell

Der Handy-Tester: *"Erst ein Hinterhalt an der Tür, dann stapeln sich die
Glühwürmchen, und es wird Schwarm-Verwaltung. Ihr bester Moment war ein gut
angekündigter Lunge im offenen Raum."* Der Systems-Designer hat 30 Einzelkämpfe
zerlegt, und das Bild war schlimmer als gedacht:
- **Die Hälfte ihrer HP nagte sie sich selbst ab.** Eine 30 Felder lange Schlange
  in 3 Felder breiten Gängen sperrt sich mit ihrem eigenen Körper, ihren
  Glühwürmchen und ihren Hüllen ein. Nur in 3,5 % der Fälle warst du es.
- 123 Fleisch gingen an Glühwürmchen verloren, 21 an den Boss.
- Ein Biss in ihren Körper war ein Buffet: bis zu 5 Schaden ohne Risiko und
  5 Hüllen zum Fressen. Der Bot kam aus dem Endkampf mit mehr Fleisch heraus, als
  er mitgebracht hatte (11,9 → 15,2).

Der Content-Designer schlug einen Umbau in drei Phasen vor (Jagd, Kreis,
Häutung). Ich habe erst das Fundament gebaut:
- **Keine Glühwürmchen mehr.**
- **Umkehren statt Nagen:** Ein Kreis hat kein Vorne. Die eingesperrte Ouroboros
  dreht sich um, ihr Schwanz wird zum Kopf.
- **Stachelhaut:** Ein Biss in ihren Körper kostet ein Segment, es sei denn, sie
  ist umwickelt oder eingerollt. Das gibt dem Coil im Endkampf seine Aufgabe.
- **Schlingen:** Sie frisst Hüllen und wächst davon nach.
- Ihr abgebissener Körper zerfällt zu Staub.

Die Sackgasse dabei war lehrreich. Mit Schlingen allein (ihre Stücke bleiben als
Hüllen liegen, sie kann sie zurückfressen) gewann der Bot 29 von 30 und verlor
dabei 0,1 Fleisch. Den Wettlauf um die Hüllen gewinnt immer, wer näher dran ist,
und das abgetrennte Ende liegt weit weg von ihrem Kopf. Erst als ihre Stücke zu
Staub zerfielen und sie den ganzen Körper jagt statt der Schwanzspitze, wurde sie
zur Wand: Im Einzelkampf gewinnt der Bot jetzt 70 % und verliert 6,8 Fleisch.
Gesamtbalance: 58 % / 40 %. Jagd, Kreis und Häutung heben wir uns auf: erst
schauen, ob das Duell trägt.

**Nachtrag, der Playtest des neuen Endkampfs.** Drei Kämpfe von Hand: zwei Siege
mit dem letzten Atemzug, eine Niederlage. Beide Siege liefen gleich ab: dreimal in
den Körper beißen, dann einen fliehenden Kopf jagen. Der härteste Satz im Bericht:
*"Den Kopf zu umwickeln ist eine Falle, keine Belohnung."* Mit ihrem Kopf in der
Tasche kündigte sie einen Sever-Lunge an, beide Fluchtwege zeigten "Lose 12 flesh".
Der Code-Guardian hatte vorher schon gefunden, dass die versprochene Ausnahme
"umwickelt" für Schlangen gar nicht eintreten konnte.

Jetzt gilt:
- Ein Kopf, um den sich mindestens 4 deiner Felder schließen, ist entblößt. Der
  Biss in den Körper ist dann kostenlos, und ihr Lunge kann nicht abtrennen.
- Ein nackter Kopf zahlt die Stachelhaut mit einem Atemzug. Der Autopilot hatte
  sie mit 0 Fleisch in drei Zügen von 20 auf 6 HP gebissen.
- Während sie schluckt, frisst sie keine Hüllen. Aus dem versprochenen Wettlauf,
  den es nie gab, wird ein Zug Vorsprung.
- Sie sucht kein Futter mehr. Das war der Grund für "man teilt sich eher einen
  Raum": Sie lief zu jedem Futter, das näher an ihr lag als an dir.

**Nachtrag, ein ganzer Run nach dem Umbau.** Der Playtester ist zweimal gestorben,
beide Male auf dieselbe Art: Ab Zug 30 kamen immer mehr Käfer aus den
Nachschub-Löchern, fraßen den Körper auf 0, und dann folgten sechs Atemzüge Warten
auf den Tod. *"Der Ausgang steht zehn Züge vorher fest, und der Spieler sitzt es
nur aus."* Die Atemregel hatte das zähe Überleben abgeschafft, aber ein zähes
Sterben übrig gelassen.

Die Antwort ist wieder Sichtbarkeit und Fairness:
- Im HUD zählt "beetle in N" herunter.
- Im Zug vorher rühren sich die Löcher (erdfarben pulsierend, nicht rot).
- **Solange du ein nackter Kopf bist, kommt kein Nachschub.** Die Atemzüge sind
  eine Chance, keine Zugabe.

Außerdem:
- Eine Sackgasse, aus der nur der Biss in den eigenen Nacken herausführt, kündigt
  die Vorschau jetzt an. Sie hatte den Tester in einem geräumten Raum 6 Fleisch
  gekostet.
- Verlorene Items eines Zuges stehen in einer Zeile ("Lost: Fang, Rattle") statt
  in vier gestapelten Texten.
