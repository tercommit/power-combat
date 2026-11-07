# Power Combat (V1)

Jeu de combat 1v1 en 3D low poly, à mains nues, jouable dans le navigateur (Three.js + TypeScript + Vite), avec support manette. Hébergé sur GitHub Pages.

- Spécifications : [`docs/SPECS.md`](docs/SPECS.md)

## Statut

Prototype jouable dans le navigateur, avec trois écrans :

- **Menu** (`#`)
- **Combat IA** (`#fight`) : Kai contre Brick, pilotés par l'ordinateur, avec coups, garde, jauge de garde, combos, rounds et HUD.
- **Récolte** (`#farm`) : on dirige un personnage dans une clairière pour couper du bois et casser de la pierre (ZQSD/flèches, E ou Espace, ou clic sur un arbre/rocher ; manette : stick gauche, A, X/Y). Les ressources repoussent, et elles servent à améliorer la hache et la pioche (touches 1 et 2). Progression sauvegardée dans le navigateur.
- **Galerie d'animations** (`#gallery/<perso>/<animation>`, ex. `#gallery/kai/hk`) : lecture image par image, vitesse réglable, phases des coups, mannequin cible à la portée du coup. L'identifiant affiché (ex. `kai/hk`) sert à demander une retouche précise.

Prochaine étape : M1 (clavier et manette).

## Développement

```bash
npm install
npm run dev      # serveur local (http://localhost:5173)
npm test         # tests unitaires
npm run lint
npm run build    # build de production dans dist/
npm run assets   # régénère public/assets/models/fighter.glb depuis assets-src/
```

Le pack source (Universal Animation Library de Quaternius, CC0) n'est pas versionné : place `UAL1_Standard.glb` dans `assets-src/` pour régénérer le modèle. Voir [`CREDITS.md`](CREDITS.md).

Site : https://tercommit.github.io/power-combat/
