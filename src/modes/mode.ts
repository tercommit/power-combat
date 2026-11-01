import type * as THREE from 'three';
import type { FighterAssets } from '../render/fighterModel';

/** Contexte partagé par tous les écrans. */
export interface ModeContext {
  scene: THREE.Scene;
  assets: FighterAssets;
  /** Conteneur DOM réservé à l'interface de l'écran (vidé à la sortie). */
  ui: HTMLElement;
  /** Canvas WebGL (pour les contrôles de caméra à la souris). */
  canvas: HTMLElement;
  aspect: () => number;
  /** Change d'écran via l'URL (#fight, #gallery/kai/lk…). */
  navigate: (hash: string) => void;
}

/** Un écran de l'application : menu, combat, galerie… */
export interface Mode {
  readonly camera: THREE.PerspectiveCamera;
  update(now: number, elapsedMs: number): void;
  resize(aspect: number): void;
  dispose(): void;
}
