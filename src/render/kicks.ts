/**
 * Coups de pied procéduraux, décrits par deux poses clés :
 *  - l'armé (« chamber ») : genou levé, tibia replié, bassin qui commence à tourner ;
 *  - l'extension : jambe tendue sur la cible, bassin tourné à fond.
 *
 * Déroulé : garde → armé → extension (début de la phase d'impact), maintien,
 * puis extension → armé → garde pendant la récupération.
 *
 * Repère du personnage : +z = vers l'adversaire, +y = haut, +x = côté gauche
 * du combattant. La jambe qui frappe est la droite (jambe arrière).
 */

export type Vec3 = [number, number, number];

export interface KickKey {
  /** Rotation du bassin (radians) : [bascule avant, rotation, inclinaison latérale]. */
  pelvis: Vec3;
  /** Descente du bassin (mètres) : le genou d'appui fléchit. */
  drop: number;
  /** Directions des segments, os → enfant. */
  thigh: Vec3;
  calf: Vec3;
  spine: Vec3;
  /** Bras droit, qui part en arrière pour équilibrer. */
  arm: Vec3;
  forearm: Vec3;
}

export interface KickDef {
  chamber: KickKey;
  extended: KickKey;
}

export const KICKS = {
  /** Coup de pied circulaire : la hanche tourne à fond, le pied d'appui pivote. */
  roundhouse: {
    chamber: {
      pelvis: [0, 0.85, -0.25],
      drop: 0.04,
      thigh: [-0.35, 0.15, 0.92],
      calf: [-0.6, -0.1, -0.8],
      spine: [0.05, 0.92, -0.35],
      arm: [-0.35, -0.8, -0.45],
      forearm: [-0.3, -0.9, -0.2],
    },
    extended: {
      pelvis: [0, 1.35, -0.4],
      drop: 0.06,
      thigh: [0, 0.42, 0.9],
      calf: [0.05, 0.5, 0.86],
      spine: [0.1, 0.72, -0.68],
      arm: [-0.45, -0.75, -0.5],
      forearm: [-0.45, -0.75, -0.45],
    },
  },
  /** Low kick (style muay-thaï) : la jambe arrière fauche la cuisse adverse. */
  lowKick: {
    chamber: {
      pelvis: [0, 0.5, -0.1],
      drop: 0.05,
      thigh: [-0.3, -0.25, 0.92],
      calf: [-0.45, -0.85, -0.25],
      spine: [0.05, 0.95, -0.25],
      arm: [-0.3, -0.85, -0.4],
      forearm: [-0.25, -0.9, -0.2],
    },
    extended: {
      pelvis: [0, 0.95, -0.15],
      drop: 0.08,
      thigh: [-0.05, -0.35, 0.93],
      calf: [0, -0.4, 0.92],
      spine: [0.1, 0.9, -0.4],
      arm: [-0.35, -0.8, -0.5],
      forearm: [-0.35, -0.8, -0.4],
    },
  },
} satisfies Record<string, KickDef>;

/** Part de la préparation consacrée à l'armé, et de la récupération au ré-armé. */
const CHAMBER_AT = 0.55;
const RECHAMBER_UNTIL = 0.35;

const ease = (t: number) => t * t * (3 - 2 * t);
/** Départ rapide : le genou monte franchement au lieu de traîner derrière. */
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function lerpKey(a: KickKey, b: KickKey, t: number): KickKey {
  return {
    pelvis: lerpVec(a.pelvis, b.pelvis, t),
    drop: a.drop + (b.drop - a.drop) * t,
    thigh: lerpVec(a.thigh, b.thigh, t),
    calf: lerpVec(a.calf, b.calf, t),
    spine: lerpVec(a.spine, b.spine, t),
    arm: lerpVec(a.arm, b.arm, t),
    forearm: lerpVec(a.forearm, b.forearm, t),
  };
}

/**
 * Pose du coup de pied à une frame donnée de l'attaque, et son poids par
 * rapport à la garde (0 = garde pure, 1 = pose du coup de pied).
 */
export function kickPose(
  def: KickDef,
  frame: number,
  startup: number,
  active: number,
  recovery: number,
): { key: KickKey; weight: number } {
  if (frame < startup) {
    const u = (frame + 1) / startup;
    if (u < CHAMBER_AT) return { key: def.chamber, weight: easeOut(u / CHAMBER_AT) };
    return {
      key: lerpKey(def.chamber, def.extended, ease((u - CHAMBER_AT) / (1 - CHAMBER_AT))),
      weight: 1,
    };
  }
  if (frame < startup + active) return { key: def.extended, weight: 1 };
  const v = Math.min(1, (frame - startup - active) / recovery);
  if (v < RECHAMBER_UNTIL)
    return { key: lerpKey(def.extended, def.chamber, ease(v / RECHAMBER_UNTIL)), weight: 1 };
  return {
    key: def.chamber,
    weight: 1 - easeOut((v - RECHAMBER_UNTIL) / (1 - RECHAMBER_UNTIL)),
  };
}
