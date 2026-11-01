/**
 * Coups procéduraux (coups de pied, crochet, swing, genou, uppercut), décrits
 * par deux poses clés :
 *  - l'armé (« chamber ») : le coup se prépare, le bassin commence à tourner ;
 *  - l'extension : le coup arrive sur la cible, bassin tourné à fond.
 *
 * Déroulé : garde → armé → extension (début de la phase d'impact), maintien,
 * puis extension → armé → garde pendant la récupération.
 *
 * Repère du personnage : +z = vers l'adversaire, +y = haut, +x = côté gauche
 * du combattant. La garde est orthodoxe : bras et jambe gauches devant.
 */

export type Vec3 = [number, number, number];

/** Segments orientables : chaque entrée relie un os à son enfant. */
export const SLOTS = {
  thighR: ['thigh_r', 'calf_r'],
  calfR: ['calf_r', 'foot_r'],
  footR: ['foot_r', 'ball_r'],
  spine: ['spine_01', 'spine_03'],
  armR: ['upperarm_r', 'lowerarm_r'],
  forearmR: ['lowerarm_r', 'hand_r'],
  armL: ['upperarm_l', 'lowerarm_l'],
  forearmL: ['lowerarm_l', 'hand_l'],
} as const;
export type Slot = keyof typeof SLOTS;

export interface StrikeKey {
  /** Rotation du bassin (radians) : [bascule avant, rotation, inclinaison latérale]. */
  pelvis: Vec3;
  /** Descente du bassin (mètres) : les genoux d'appui fléchissent. */
  drop: number;
  /** Directions des segments (les deux poses d'un coup doivent avoir les mêmes). */
  aims: Partial<Record<Slot, Vec3>>;
}

export interface StrikeDef {
  chamber: StrikeKey;
  extended: StrikeKey;
  /** Pieds qui restent au sol (cinématique inverse). */
  planted: ('l' | 'r')[];
}

export const STRIKES = {
  /** Kai : coup de pied circulaire, la hanche tourne à fond, le pied d'appui pivote. */
  roundhouse: {
    planted: ['l'],
    chamber: {
      pelvis: [0, 0.85, -0.25],
      drop: 0.04,
      aims: {
        thighR: [-0.35, 0.15, 0.92],
        calfR: [-0.6, -0.1, -0.8],
        footR: [-0.6, -0.1, -0.8],
        spine: [0.05, 0.92, -0.35],
        armR: [-0.35, -0.8, -0.45],
        forearmR: [-0.3, -0.9, -0.2],
      },
    },
    extended: {
      pelvis: [0, 1.35, -0.4],
      drop: 0.06,
      aims: {
        thighR: [0, 0.42, 0.9],
        calfR: [0.05, 0.5, 0.86],
        footR: [0.05, 0.5, 0.86],
        spine: [0.1, 0.72, -0.68],
        armR: [-0.45, -0.75, -0.5],
        forearmR: [-0.45, -0.75, -0.45],
      },
    },
  },
  /** Kai : low kick (style muay-thaï), la jambe arrière fauche la cuisse adverse. */
  lowKick: {
    planted: ['l'],
    chamber: {
      pelvis: [0, 0.5, -0.1],
      drop: 0.05,
      aims: {
        thighR: [-0.3, -0.25, 0.92],
        calfR: [-0.45, -0.85, -0.25],
        footR: [-0.45, -0.85, -0.25],
        spine: [0.05, 0.95, -0.25],
        armR: [-0.3, -0.85, -0.4],
        forearmR: [-0.25, -0.9, -0.2],
      },
    },
    extended: {
      pelvis: [0, 0.95, -0.15],
      drop: 0.08,
      aims: {
        thighR: [-0.05, -0.35, 0.93],
        calfR: [0, -0.4, 0.92],
        footR: [0, -0.4, 0.92],
        spine: [0.1, 0.9, -0.4],
        armR: [-0.35, -0.8, -0.5],
        forearmR: [-0.35, -0.8, -0.4],
      },
    },
  },
  /** Brick : crochet du bras avant, coude à l'horizontale, les hanches tournent. */
  hook: {
    planted: ['l', 'r'],
    chamber: {
      pelvis: [0, 0.25, 0],
      drop: 0.04,
      aims: {
        spine: [0.1, 0.95, 0.1],
        armL: [0.55, -0.35, 0.75],
        forearmL: [0.1, 0.75, 0.65],
      },
    },
    extended: {
      pelvis: [0, -0.6, 0.05],
      drop: 0.06,
      aims: {
        spine: [-0.15, 0.93, 0.25],
        armL: [0.6, 0.08, 0.8],
        forearmL: [-0.8, 0.05, 0.6],
      },
    },
  },
  /** Brick : swing du bras arrière, armé loin derrière, qui plonge sur la cible. */
  overhand: {
    planted: ['l', 'r'],
    chamber: {
      pelvis: [0, -0.35, 0],
      drop: 0.04,
      aims: {
        spine: [0, 0.95, -0.25],
        armR: [-0.55, 0.25, -0.8],
        forearmR: [-0.1, 0.95, -0.3],
      },
    },
    extended: {
      pelvis: [0.15, 0.9, 0],
      drop: 0.1,
      aims: {
        spine: [-0.1, 0.82, 0.55],
        armR: [-0.15, 0.3, 0.94],
        forearmR: [0.1, -0.2, 0.97],
      },
    },
  },
  /** Brick : coup de genou, les deux mains tirent la nuque adverse vers le bas. */
  knee: {
    planted: ['l'],
    chamber: {
      pelvis: [-0.05, 0.3, -0.05],
      drop: 0.03,
      aims: {
        thighR: [-0.1, -0.5, 0.85],
        calfR: [-0.05, -0.8, -0.6],
        footR: [-0.05, -0.8, -0.6],
        spine: [0, 0.95, -0.15],
        armL: [0.15, 0.1, 0.98],
        forearmL: [-0.2, 0.1, 0.97],
        armR: [-0.15, 0.1, 0.98],
        forearmR: [0.2, 0.1, 0.97],
      },
    },
    extended: {
      pelvis: [-0.15, 0.45, -0.1],
      drop: 0.05,
      aims: {
        thighR: [-0.05, 0.4, 0.92],
        calfR: [0, -0.9, -0.43],
        footR: [0, -0.8, -0.6],
        spine: [0, 0.95, -0.3],
        armL: [0.1, -0.15, 0.98],
        forearmL: [-0.25, -0.45, 0.86],
        armR: [-0.1, -0.15, 0.98],
        forearmR: [0.25, -0.45, 0.86],
      },
    },
  },
  /** Brick : uppercut, flexion puis poussée des jambes et rotation des hanches. */
  uppercut: {
    planted: ['l', 'r'],
    chamber: {
      pelvis: [0.2, -0.25, 0],
      drop: 0.14,
      aims: {
        spine: [0.05, 0.85, 0.5],
        armR: [-0.1, -0.95, 0.25],
        forearmR: [0, 0.55, 0.83],
      },
    },
    extended: {
      pelvis: [-0.1, 1.0, 0],
      drop: 0,
      aims: {
        spine: [-0.05, 0.98, 0.05],
        armR: [-0.05, -0.25, 0.97],
        forearmR: [0, 0.6, 0.8],
      },
    },
  },
} satisfies Record<string, StrikeDef>;

/** Part de la préparation consacrée à l'armé, et de la récupération au ré-armé. */
const CHAMBER_AT = 0.55;
const RECHAMBER_UNTIL = 0.35;

const ease = (t: number) => t * t * (3 - 2 * t);
/** Départ rapide : le coup s'arme franchement au lieu de traîner. */
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function lerpKey(a: StrikeKey, b: StrikeKey, t: number): StrikeKey {
  const aims: StrikeKey['aims'] = {};
  for (const slot of Object.keys(a.aims) as Slot[]) {
    aims[slot] = lerpVec(a.aims[slot]!, b.aims[slot] ?? a.aims[slot]!, t);
  }
  return {
    pelvis: lerpVec(a.pelvis, b.pelvis, t),
    drop: a.drop + (b.drop - a.drop) * t,
    aims,
  };
}

/**
 * Pose du coup à une frame donnée de l'attaque, et son poids par rapport à la
 * garde (0 = garde pure, 1 = pose du coup).
 */
export function strikePose(
  def: StrikeDef,
  frame: number,
  startup: number,
  active: number,
  recovery: number,
): { key: StrikeKey; weight: number } {
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
