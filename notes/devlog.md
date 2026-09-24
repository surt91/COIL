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
