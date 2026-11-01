# Spécifications : V1, prototype de combat low poly (web)

> Statut : **brouillon v0.1**, à valider avant de commencer le code.
> Date : 2026-11-01

## 1. Vision

Un jeu d'action 3D **low poly** jouable dans le navigateur, centré sur le **ressenti du combat** :
des coups qui ont de l'impact, des animations fluides et des contrôles réactifs.
La V1 est un **prototype jouable** (vertical slice), pas un jeu complet.

**Pitch :** une arène, un héros, des vagues d'ennemis. On frappe, on esquive, on survit.

## 2. Objectifs de la V1

| # | Objectif | Critère de réussite |
|---|----------|---------------------|
| O1 | Combat qui « se sent bien » | Hit-stop, recul, screen shake et particules à chaque impact |
| O2 | Contrôles réactifs | Délai entrée → animation < 100 ms, possibilité d'annuler une attaque par l'esquive |
| O3 | Performance web | 60 FPS sur un laptop récent, chargement initial < 10 Mo |
| O4 | Boucle de jeu complète | Menu → combat → victoire ou défaite → rejouer |

### Hors périmètre (V1)
- Multijoueur en ligne
- Plusieurs niveaux ou un monde ouvert
- Progression, inventaire, sauvegarde
- Support mobile tactile (prévu en V2)
- Rendu réaliste ou PBR poussé

## 3. Genre et caméra

- **Genre :** action / beat'em up en arène, à la 3e personne.
- **Caméra :** 3e personne, derrière l'épaule et légèrement surélevée, orbitale à la souris, avec lock-on optionnel sur l'ennemi le plus proche.
- **Vue :** perspective, champ de vision d'environ 60°.

> Variante possible : un combat 1v1 façon jeu de baston (caméra latérale fixe). À trancher, voir §12.

## 4. Contrôles (clavier + souris, manette en bonus)

| Action | Clavier/Souris | Manette (Xbox) |
|--------|----------------|----------------|
| Déplacement | ZQSD / WASD | Stick gauche |
| Caméra | Souris | Stick droit |
| Attaque légère | Clic gauche | X |
| Attaque lourde | Clic droit | Y |
| Esquive (roulade) | Espace | A |
| Garde / parade | Shift (maintenu) | LB |
| Lock-on | Tab / clic molette | R3 |
| Pause | Échap | Start |

La disposition AZERTY ou QWERTY est détectée via `KeyboardEvent.code`, qui suit la position physique des touches.

## 5. Système de combat

### 5.1 Attaques
- **Combo léger :** 3 coups enchaînés (L1 → L2 → L3) ; le dernier pousse l'ennemi en arrière.
- **Attaque lourde :** lente, gros dégâts, casse la garde.
- **Finisher :** léger, léger puis lourd déclenche un coup spécial.
- Chaque attaque a 3 phases : **startup** (préparation), **active** (hitbox active) et **recovery** (récupération).
- **Fenêtre d'enchaînement :** pendant la recovery, une entrée bufferisée (environ 200 ms) enchaîne le coup suivant.

### 5.2 Défense
- **Esquive :** roulade de 0,5 s, avec **i-frames** (invulnérabilité) pendant 0,25 s. Elle peut annuler la recovery d'une attaque.
- **Garde :** réduit les dégâts de 80 % et consomme de l'endurance.
- **Parade (bonus) :** une garde déclenchée dans les 150 ms avant l'impact étourdit l'ennemi.

### 5.3 Ressources
- **PV :** 100 pour le joueur.
- **Endurance :** 100, se régénère après 1 s sans action. L'esquive coûte 25, la garde 10 par coup bloqué, l'attaque lourde 20.

### 5.4 Feedback d'impact (le « juice »)
- **Hit-stop :** gel du jeu de 60 à 120 ms selon la force du coup.
- **Screen shake :** léger sur les coups normaux, fort sur les lourds et les finishers.
- **Hit flash :** l'ennemi devient blanc pendant 1 frame.
- **Knockback :** recul physique de l'ennemi.
- **Particules :** étincelles ou poussière au point d'impact.
- **Sons :** whoosh, impact, cri (placeholders libres de droits).
- **Chiffres de dégâts :** flottants (optionnel, activable).

### 5.5 Hitboxes / hurtboxes
- **Hurtbox :** capsule autour de chaque personnage.
- **Hitbox :** sphère attachée à l'os de la main, du pied ou de l'arme, active seulement pendant la phase active.
- Un même coup ne touche qu'une seule fois la même cible.
- Mode debug (touche `F1`) pour afficher les hitboxes.

## 6. Ennemis

| Type | PV | Comportement |
|------|----|--------------|
| **Mannequin** | ∞ | Ne bouge pas, sert à tester les combos |
| **Brute** | 60 | S'approche, enchaîne 2 coups, télégraphie ses attaques (flash rouge) |
| **Rapide** | 35 | Tourne autour du joueur, attaque en dash puis recule |

- **IA :** machine à états (idle → poursuite → attaque → récupération → touché → mort).
- **Gestion de groupe :** au maximum 2 ennemis attaquent en même temps, les autres attendent en cercle (« attack tokens »).

## 7. Boucle de jeu

1. **Écran titre :** « Jouer », « Contrôles ».
2. **Arène :** 3 vagues (vague 1 : 3 brutes ; vague 2 : 2 brutes et 2 rapides ; vague 3 : 4 brutes et 3 rapides).
3. **Victoire :** affichage du temps et du nombre de coups, bouton « Rejouer ».
4. **Défaite :** « Game Over », bouton « Rejouer ».
5. **Pause :** reprendre, recommencer, contrôles.

## 8. Direction artistique

- **Style :** low poly flat shading, palette limitée (environ 16 couleurs), éclairage chaud.
- **Arène :** circulaire, avec quelques piliers et rochers ; ciel en dégradé et brouillard léger.
- **Lumière :** 1 lumière directionnelle avec ombres, 1 lumière hémisphérique.
- **Post-processing (si le budget le permet) :** bloom léger, vignette.
- **Interface :** barres PV et endurance en haut à gauche, barre PV au-dessus des ennemis, compteur de vague.

## 9. Assets (gratuits)

| Besoin | Source | Licence |
|--------|--------|---------|
| Personnages | Quaternius (Ultimate Modular Characters) / Kenney | CC0 |
| Animations | Mixamo (retarget) ou packs animés Quaternius | Libre d'utilisation / CC0 |
| Décor | Kenney, Quaternius, Poly Pizza | CC0 / CC-BY |
| Sons | Kenney Audio, freesound.org | CC0 |

- **Format :** glTF binaire (`.glb`), compression Draco ou Meshopt, textures en KTX2 si besoin.
- Les crédits sont listés dans `CREDITS.md`.

**Animations requises pour le héros :** idle, marche, course, L1, L2, L3, lourde, finisher, esquive, garde, touché, mort, victoire.

## 10. Stack technique

| Domaine | Choix |
|---------|-------|
| Langage | TypeScript |
| Build | Vite |
| Rendu 3D | Three.js (WebGL 2 ; WebGPU plus tard) |
| Animation | `THREE.AnimationMixer` (crossfade, animations additives) |
| Physique / collisions | Maison (capsules/sphères) en V1 ; Rapier si besoin |
| Audio | Web Audio API (via `THREE.Audio` ou Howler.js) |
| Interface | HTML/CSS par-dessus le canvas |
| Qualité | ESLint + Prettier ; Vitest pour la logique (combat, IA) |
| Debug | lil-gui (réglages en direct), stats.js |

### Architecture (proposition)

```
V1/
├─ docs/            # specs, notes de design
├─ public/assets/   # modèles .glb, sons, textures
├─ src/
│  ├─ main.ts       # bootstrap
│  ├─ core/         # boucle de jeu (fixed timestep), input, temps, events
│  ├─ render/       # scène, caméra, lumières, post-fx
│  ├─ entities/     # Player, Enemy, components
│  ├─ combat/       # attaques (data), hitbox, dégâts, hit-stop
│  ├─ ai/           # machines à états ennemis, attack tokens
│  ├─ game/         # vagues, états du jeu (menu/play/pause/end)
│  ├─ fx/           # particules, screen shake, flash
│  └─ ui/           # HUD, menus
└─ tests/
```

- **Boucle :** logique à pas fixe (60 Hz), rendu interpolé.
- **Attaques déclarées en données** (frames de startup, active et recovery, dégâts, knockback, hit-stop), ce qui permet de les équilibrer sans toucher au code.

## 11. Jalons

| Jalon | Contenu | Livrable |
|-------|---------|----------|
| **M0 : Socle** | Vite + TS + Three.js, scène, arène placeholder, boucle de jeu | Une scène qui tourne |
| **M1 : Héros** | Personnage animé, déplacement, caméra 3e personne | On se balade dans l'arène |
| **M2 : Combat** | Combo, lourde, esquive, garde, hitboxes, mannequin | On frappe le mannequin |
| **M3 : Juice** | Hit-stop, shake, flash, particules, sons | Ça « tape » |
| **M4 : Ennemis** | IA brute et rapide, attack tokens, PV et mort | Un vrai combat |
| **M5 : Boucle** | Vagues, HUD, menus, victoire/défaite | V1 jouable de bout en bout |
| **M6 : Polish** | Post-fx, équilibrage, perf, build de prod | Version partageable |

## 12. Questions ouvertes

1. **Genre :** beat'em up en arène (par défaut) ou 1v1 façon jeu de baston ?
2. **Héros :** à mains nues (arts martiaux) ou avec une arme (épée) ?
3. **Manette :** obligatoire en V1 ou bonus ?
4. **Hébergement :** GitHub Pages, Netlify ou Vercel (à décider au moment du lien GitHub) ?
