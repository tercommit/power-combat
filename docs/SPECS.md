# Spécifications : Power Combat (V1), jeu de combat 1v1 low poly (web)

> Statut : **v0.3**. Décisions validées : combat 1v1, à mains nues, support manette, hébergement GitHub Pages, jauge de garde en V1.
> Dépôt : https://github.com/tercommit/power-combat · Site : https://tercommit.github.io/power-combat/
> Date : 2026-11-01

## 1. Vision

Un **jeu de combat 1v1** en 3D **low poly**, jouable dans le navigateur, façon Tekken ou Street Fighter en version simplifiée.
Les combattants s'affrontent **à mains nues** (arts martiaux, boxe, kicks).
La priorité absolue est le **ressenti** : des coups qui ont de l'impact, des animations fluides et des contrôles précis.
La V1 est un **prototype jouable** (vertical slice).

**Pitch :** deux combattants, une arène, 3 rounds. Le premier à 2 victoires gagne.

## 2. Objectifs de la V1

| # | Objectif | Critère de réussite |
|---|----------|---------------------|
| O1 | Combat qui « se sent bien » | Hit-stop, recul, screen shake et particules à chaque impact |
| O2 | Contrôles précis | Délai entrée → action ≤ 3 frames (50 ms), buffer d'entrées, aucune entrée perdue |
| O3 | Manette de première classe | Jouable entièrement à la manette, menus compris |
| O4 | Performance web | 60 FPS stables sur un laptop récent, chargement initial < 10 Mo |
| O5 | Boucle complète | Titre → sélection → combat (meilleur des 3) → résultat → rejouer |
| O6 | En ligne | Build déployé automatiquement sur GitHub Pages |

### Hors périmètre (V1)
- Multijoueur en ligne (netcode, rollback)
- Plus de 2 personnages jouables
- Mode histoire, progression, sauvegarde de compte
- Contrôles tactiles mobiles
- Armes

## 3. Modes de jeu

| Mode | V1 | Description |
|------|----|-------------|
| **Joueur vs CPU** | ✅ | Mode principal, avec 3 niveaux de difficulté pour l'IA |
| **Joueur vs Joueur (local)** | ✅ | 2 manettes, ou clavier contre manette |
| **Entraînement** | ✅ | Mannequin configurable (immobile, garde, saut), affichage des hitboxes et des frame data |

## 4. Caméra et espace de jeu

- **Gameplay 2.5D :** les combattants se déplacent sur un **plan 2D** (gauche/droite, saut), avec un rendu 3D. Pas de déplacement latéral en V1.
- **Caméra latérale** qui suit le milieu des deux combattants et zoome selon leur distance (bornes min/max).
- **Arène :** largeur limitée par des murs invisibles ; être acculé au bord crée de la pression.
- Les combattants se font **toujours face** (retournement automatique quand l'un passe derrière l'autre).

## 5. Contrôles

Les directions sont **relatives au personnage** : « avant » signifie vers l'adversaire, « arrière » s'en éloigner.

| Action | Manette (Xbox / PS) | Clavier J1 | Clavier J2 (PvP) |
|--------|---------------------|------------|------------------|
| Déplacement | Stick gauche / croix | ZQSD (WASD en QWERTY) | Flèches |
| Poing léger (LP) | X / □ | U | Pavé num. 4 |
| Poing lourd (HP) | Y / △ | I | Pavé num. 5 |
| Pied léger (LK) | A / ✕ | J | Pavé num. 1 |
| Pied lourd (HK) | B / ○ | K | Pavé num. 2 |
| Saisie (LP+LK) | RB / R1 | O | Pavé num. 6 |
| Pause | Start / Options | Échap | — |

- **Mouvements :**
  - **Garde :** maintenir arrière (garde haute) ou bas-arrière (garde basse).
  - **Saut :** haut, en avant, en arrière.
  - **Accroupi :** bas.
  - **Dash :** double tap avant (dash) ou arrière (backdash).
- **Manette :**
  - API Gamepad avec support du mapping standard (Xbox, PS4/PS5, Switch Pro).
  - Zone morte configurable ; la croix et le stick sont équivalents.
  - Écran de remappage des boutons.
  - Vibration (`vibrationActuator`) sur les coups reçus, si disponible.
  - Branchement et débranchement à chaud ; la pause est automatique si la manette d'un joueur se déconnecte.
- **Clavier :** lecture de `KeyboardEvent.code`, donc compatible AZERTY et QWERTY.

## 6. Système de combat

### 6.1 Fondamentaux (frame data)
- La logique tourne à **60 frames par seconde, en pas fixe**. Toutes les durées sont exprimées en frames.
- Chaque coup a trois phases : **startup** (préparation), **active** (hitbox active) et **recovery** (récupération).
- Chaque coup a aussi un **hitstun** et un **blockstun**, qui déterminent l'avantage ou le désavantage en frames.
- **Hauteurs de coup :**

  | Type | Bloqué par |
  |------|------------|
  | **Haut** | garde haute (passe au-dessus d'un adversaire accroupi) |
  | **Milieu** | garde haute |
  | **Bas** | garde basse uniquement |
  | **Overhead** (coup sauté) | garde haute uniquement |

- **Buffer d'entrées :** 6 frames pour les coups, 10 frames pour les coups spéciaux.
- **Coups déclarés en données** (fichier JSON/TS par personnage) : frames, dégâts, hauteur, hitbox, knockback, hit-stop. Cela permet d'équilibrer sans toucher au code.

### 6.2 Coups normaux
- 4 boutons × 3 postures (debout, accroupi, sauté), soit **12 coups normaux** par personnage.
- Quelques coups de commande (ex. avant + HP = overhead).

### 6.3 Combos
- **Enchaînements cibles :** LP → LP → HP, LK → HK, etc. (2 à 3 chaînes par personnage).
- **Cancel :** certains coups normaux peuvent être annulés par un coup spécial pendant le hit ou le block.
- **Réduction des dégâts :** chaque coup supplémentaire d'un combo fait 10 % de dégâts en moins, avec un minimum de 30 %.
- **Juggle :** limité, l'adversaire projeté en l'air peut être touché 1 ou 2 fois.

### 6.4 Coups spéciaux
Les commandes restent simples et accessibles (pas de 360°) :

| Commande | Notation |
|----------|----------|
| Quart de cercle avant + poing | ↓↘→ + P |
| Dragon punch | →↓↘ + P |
| Quart de cercle arrière + pied | ↓↙← + K |

- 3 coups spéciaux par personnage. La version légère ou lourde dépend du bouton utilisé.

### 6.5 Défense
- **Garde :** les dégâts sont réduits à 0 (pas de dégâts de garde en V1).
- **Jauge de garde (V1) :**
  - 100 points ; chaque coup bloqué en consomme selon sa force (léger 8, lourd 15, spécial 20, super 35).
  - Elle se régénère de 1 point par frame après 60 frames sans bloquer.
  - **Garde brisée** quand elle tombe à 0 : l'adversaire est étourdi 60 frames, peut être touché sans protection, puis la jauge remonte à 100.
  - Une barre fine sous la barre de PV clignote quand il reste moins de 25 %.
- **Saisie :** imparable, mais l'adversaire peut s'en dégager en appuyant aussi sur saisie dans les 7 premières frames.
- **Relevé :** après une chute au sol, l'adversaire peut se relever sur place ou rouler en arrière (choix de la direction).

### 6.6 Ressources
- **PV :** 1000 par round.
- **Jauge de super :** se remplit en frappant et en encaissant, sur 1 barre. Elle permet de lancer **1 super coup** par personnage (↓↘→↓↘→ + P).

### 6.7 Feedback d'impact (le « juice »)
- **Hit-stop :** gel des deux combattants pendant 6 à 14 frames selon la force du coup.
- **Screen shake :** léger sur les coups normaux, fort sur les lourds et les supers.
- **Hit flash** et **particules** au point d'impact ; effet différent selon que le coup touche ou est bloqué.
- **Knockback :** recul de l'adversaire, avec pushback quand le coup est bloqué.
- **Ralenti et zoom caméra** sur le coup final du round (KO).
- **Sons :** whoosh, impact (léger, lourd, bloqué), voix d'annonce (« Round 1 », « Fight! », « K.O. »).
- **Vibration manette.**
- **Compteur de combo** à l'écran (« 4 HITS »).

### 6.8 Hitboxes / hurtboxes
- **Hurtboxes :** plusieurs boîtes par personnage (tête, torse, jambes), qui suivent l'animation.
- **Hitboxes :** définies par coup dans les données, ou attachées aux os (poing, pied), actives seulement pendant la phase active.
- **Pushbox :** empêche les deux personnages de se traverser.
- Un même coup touche au maximum une fois.
- **Mode debug** (`F1`) : affiche les boîtes et les frame data en direct.

## 7. Personnages (V1 : 2)

| Personnage | Style | Archétype |
|------------|-------|-----------|
| **Kai** | Karaté / kung-fu | Polyvalent : projectile (onde de ki), dragon punch, coups de pied tournoyants |
| **Brick** | Boxe / lutte | Grappler : coups lourds et lents, saisie de commande, armure sur 1 coup |

Les deux personnages partagent le même squelette, ce qui permet de réutiliser les animations de base. Leur silhouette et leur palette sont différentes.

**Animations par personnage :** idle (pose de garde), marche avant/arrière, dash, saut (3 directions), accroupi, garde (haute/basse), 12 normaux, 3 spéciaux, super, saisie (réussie/dégagée), hitstun (haut/bas/air), chute et relevé, KO, victoire, intro.

## 8. IA (CPU)

- Machine à états avec une prise de décision toutes les N frames.
- **Facile :** réactions lentes, garde rare, pas de combos.
- **Moyen :** garde les attaques évidentes, combos simples, quelques anti-airs.
- **Difficile :** punit les coups dans le vide, varie haut et bas, utilise les spéciaux et la super.
- L'IA lit uniquement l'état visible du jeu, sans tricher sur les entrées du joueur (sauf temps de réaction réglable).

## 9. Boucle de jeu et interface

1. **Écran titre :** « Appuyez sur Start » (détecte la manette ou le clavier du joueur 1).
2. **Menu principal :** VS CPU, VS Joueur, Entraînement, Options (contrôles, audio, difficulté).
3. **Sélection des personnages** pour J1 et J2/CPU.
4. **Combat :** au meilleur des 3 rounds, chacun limité à 99 s. Si le temps est écoulé, le joueur avec le plus de PV gagne.
5. **Résultat :** vainqueur, puis « Revanche », « Changer de perso » ou « Menu ».
6. **Pause :** reprendre, liste des coups, options, quitter.

**Interface en combat :**
- barres de PV en haut (miroir J1/J2) avec un effet de « dégât récent » rouge ;
- timer au centre ;
- indicateurs de rounds gagnés ;
- jauges de garde sous les PV ;
- jauges de super en bas ;
- compteur de combo ;
- annonces « Round / Fight / K.O. ».

## 10. Direction artistique

- **Style :** low poly flat shading, palette limitée, éclairage dramatique.
- **Arène (V1 : 1) :** dojo sur une colline au coucher de soleil, avec un fond en parallaxe (montagnes, arbres, lanternes).
- **Lumière :** 1 lumière directionnelle avec ombres, 1 lumière hémisphérique, et une lumière de contour (rim light) pour détacher les persos.
- **Post-processing :** bloom léger sur les impacts et la super, vignette.
- **Lisibilité avant tout :** les silhouettes des combattants doivent rester claires sur le fond.

## 11. Assets (gratuits)

| Besoin | Source | Licence |
|--------|--------|---------|
| Personnages | Quaternius (Ultimate Modular Characters), Kenney | CC0 |
| Animations | Mixamo (catégorie *combat / martial arts*), packs Quaternius | Libre d'utilisation / CC0 |
| Décor | Kenney, Quaternius, Poly Pizza | CC0 / CC-BY |
| Sons et voix | Kenney Audio, freesound.org | CC0 |

- **Format :** glTF binaire (`.glb`), compression Meshopt ou Draco.
- Les crédits sont listés dans `CREDITS.md`.
- Les animations Mixamo ne peuvent pas être redistribuées seules. Elles doivent être intégrées aux modèles, ce qui est permis.

## 12. Stack technique

| Domaine | Choix |
|---------|-------|
| Langage | TypeScript (strict) |
| Build | Vite |
| Rendu 3D | Three.js (WebGL 2) |
| Animation | `THREE.AnimationMixer`, pilotée frame par frame par la logique (déterministe) |
| Collisions | Maison : boîtes alignées 2D (AABB) sur le plan de combat, pas de moteur physique |
| Input | Couche d'abstraction clavier + Gamepad API, avec un historique d'entrées pour détecter les commandes |
| Audio | Web Audio API |
| Interface | HTML/CSS par-dessus le canvas |
| Qualité | ESLint + Prettier, Vitest (détection des commandes, frame data, dégâts) |
| Debug | lil-gui, stats.js, overlay des hitboxes |
| CI/CD | GitHub Actions : lint + tests + build, puis déploiement sur **GitHub Pages** |

### Principes d'architecture
- **Logique et rendu séparés :** la simulation est **déterministe** (pas fixe, sans `Math.random` non seedé) et le rendu se contente d'afficher l'état. Cela prépare un futur rollback netcode en V2+.
- **Entrées sous forme de bitmask par frame**, ce qui permet de rejouer un combat (replay) à partir des entrées seules.

### Arborescence (proposition)

```
V1/
├─ docs/              # specs, notes de design
├─ public/assets/     # .glb, sons, textures
├─ src/
│  ├─ main.ts
│  ├─ core/           # boucle à pas fixe, horloge, events, RNG seedée
│  ├─ input/          # clavier, manette, mapping, buffer, détection des commandes
│  ├─ sim/            # état du combat, fighters, collisions, frame data, rounds
│  ├─ characters/     # données par perso (kai.ts, brick.ts)
│  ├─ ai/             # CPU
│  ├─ render/         # scène, caméra, lumières, sync anim ↔ sim, post-fx
│  ├─ fx/             # particules, shake, flash, ralenti
│  ├─ audio/
│  └─ ui/             # HUD, menus, sélection, remappage
├─ tests/
└─ .github/workflows/ # deploy.yml (GitHub Pages)
```

### Déploiement GitHub Pages
- `vite.config.ts` : `base: '/power-combat/'`.
- Le workflow `actions/deploy-pages` se lance à chaque push sur `main`.
- Les assets sont servis en statique, sans backend.

## 13. Jalons

| Jalon | Contenu | Livrable |
|-------|---------|----------|
| **M0 : Socle** | Vite + TS + Three.js, boucle à pas fixe, arène placeholder, caméra latérale, workflow GitHub Pages | Une scène en ligne |
| **M1 : Input** | Clavier + manette, mapping, buffer, détection des commandes (testée) | Écran de test des entrées |
| **M2 : Mouvement** | Combattant animé, marche, dash, saut, accroupi, face-à-face, pushbox | Deux persos qui bougent |
| **M3 : Coups** | Normaux, hitbox/hurtbox, hitstun/blockstun, garde haute/basse, saisie, mode entraînement + debug | On se tape dessus |
| **M4 : Juice** | Hit-stop, shake, particules, sons, vibration, compteur de combo | Ça « tape » |
| **M5 : Profondeur** | Spéciaux, combos/cancels, super, juggle, 2e personnage | Un vrai jeu de baston |
| **M6 : CPU** | IA en 3 niveaux | Jouable en solo |
| **M7 : Boucle** | Menus, sélection, rounds, timer, HUD, résultat, remappage | V1 de bout en bout |
| **M8 : Polish** | Arène finale, post-fx, équilibrage, perf | Version partageable |

## 14. Questions ouvertes

_Aucune pour l'instant._ Les noms Kai et Brick sont conservés (sans importance pour la V1).
