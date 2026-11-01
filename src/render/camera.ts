import * as THREE from 'three';

export const CAMERA = {
  fov: 40,
  minDistance: 6,
  maxDistance: 12,
  /** Marge horizontale autour des deux combattants (mètres). */
  padding: 3.5,
  height: 1.8,
  lookAtY: 1.1,
  /** Vitesse de suivi (plus grand = plus réactif). */
  followRate: 6,
};

/**
 * Calcule où placer la caméra latérale pour cadrer les deux combattants :
 * centrée sur leur milieu, reculée juste assez pour que l'écart tienne à l'écran.
 */
export function frameFighters(
  x1: number,
  x2: number,
  aspect: number,
): { x: number; distance: number } {
  const halfSpan = (Math.abs(x2 - x1) + CAMERA.padding * 2) / 2;
  const halfVFov = THREE.MathUtils.degToRad(CAMERA.fov / 2);
  const halfHFov = Math.atan(Math.tan(halfVFov) * aspect);
  const distance = THREE.MathUtils.clamp(
    halfSpan / Math.tan(halfHFov),
    CAMERA.minDistance,
    CAMERA.maxDistance,
  );
  return { x: (x1 + x2) / 2, distance };
}

export class FightCamera {
  readonly camera: THREE.PerspectiveCamera;
  private x = 0;
  private distance = CAMERA.minDistance;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Suit les combattants en douceur. `snap` place la caméra directement (début de round). */
  update(x1: number, x2: number, dtSeconds: number, snap = false): void {
    const target = frameFighters(x1, x2, this.camera.aspect);
    const k = snap ? 1 : 1 - Math.exp(-CAMERA.followRate * dtSeconds);
    this.x += (target.x - this.x) * k;
    this.distance += (target.distance - this.distance) * k;
    this.camera.position.set(this.x, CAMERA.height, this.distance);
    this.camera.lookAt(this.x, CAMERA.lookAtY, 0);
  }
}
