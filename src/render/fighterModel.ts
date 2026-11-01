/**
 * Combattant low poly procédural (en attendant les modèles glTF + Mixamo).
 * Les poses sont calculées à partir de l'état de simulation : le rendu ne
 * décide de rien, il illustre.
 */
import * as THREE from 'three';
import { moveOf } from '../sim/state';
import type { CharacterId, FighterState, MoveId } from '../sim/types';

const JOINTS = [
  'torso',
  'head',
  'shoulderL',
  'elbowL',
  'shoulderR',
  'elbowR',
  'hipL',
  'kneeL',
  'hipR',
  'kneeR',
] as const;
type Joint = (typeof JOINTS)[number];

/** Rotation de chaque articulation (euler XYZ) + hauteur et bascule du bassin. */
interface Pose {
  hipsY: number;
  hipsRot: [number, number, number];
  joints: Partial<Record<Joint, [number, number, number]>>;
}

interface Palette {
  skin: string;
  top: string | null;
  bottom: string;
  gloves: string;
  belt: string;
  hair: string;
}

const PALETTES: Record<CharacterId, Palette> = {
  kai: {
    skin: '#e9b48a',
    top: '#f2efe6',
    bottom: '#f2efe6',
    gloves: '#c8402f',
    belt: '#1d1d1d',
    hair: '#1c1410',
  },
  brick: {
    skin: '#a8714f',
    top: null,
    bottom: '#2f5fc4',
    gloves: '#e8b53a',
    belt: '#e8b53a',
    hair: '#3a2416',
  },
};

const SCALE: Record<CharacterId, number> = { kai: 1, brick: 1.12 };

// --- Poses -----------------------------------------------------------------
// Repère local : +z = vers l'adversaire, membres au repos pendants (-y).
// Rotation x négative = lever le membre vers l'avant ; genou positif = plier.

const GUARD: Pose = {
  hipsY: -0.08,
  hipsRot: [0, 0.5, 0],
  joints: {
    torso: [0.08, -0.3, 0],
    head: [0, -0.2, 0],
    shoulderR: [-1.0, 0, 0.1],
    elbowR: [-1.9, 0, 0],
    shoulderL: [-0.7, 0, -0.1],
    elbowL: [-2.1, 0, 0],
    hipR: [-0.45, 0, 0],
    kneeR: [0.45, 0, 0],
    hipL: [0.35, 0, 0],
    kneeL: [0.35, 0, 0],
  },
};

const ATTACK_POSES: Record<MoveId, Pose> = {
  lp: {
    hipsY: -0.08,
    hipsRot: [0, 0.35, 0],
    joints: {
      ...GUARD.joints,
      torso: [0.12, -0.2, 0],
      shoulderR: [-1.6, 0, 0.05],
      elbowR: [-0.05, 0, 0],
    },
  },
  hp: {
    hipsY: -0.12,
    hipsRot: [0, -0.15, 0],
    joints: {
      ...GUARD.joints,
      torso: [0.25, -0.5, 0],
      shoulderL: [-1.62, 0, -0.05],
      elbowL: [-0.05, 0, 0],
      shoulderR: [-0.6, 0, 0.2],
      elbowR: [-2.2, 0, 0],
      hipL: [0.6, 0, 0],
      kneeL: [0.1, 0, 0],
    },
  },
  lk: {
    hipsY: -0.14,
    hipsRot: [0, 0.6, 0],
    joints: {
      ...GUARD.joints,
      torso: [-0.1, -0.3, 0],
      hipR: [-0.95, 0, 0],
      kneeR: [0.1, 0, 0],
      hipL: [0.15, 0, 0],
    },
  },
  hk: {
    hipsY: -0.05,
    hipsRot: [0, 1.1, 0.25],
    joints: {
      ...GUARD.joints,
      torso: [-0.4, -0.2, -0.2],
      hipR: [-1.75, 0, 0.3],
      kneeR: [0.05, 0, 0],
      hipL: [0.05, 0, 0],
      kneeL: [0.15, 0, 0],
    },
  },
};

/** Brick frappe en uppercut au lieu du coup de pied circulaire. */
const UPPERCUT: Pose = {
  hipsY: -0.2,
  hipsRot: [0, 0.1, 0],
  joints: {
    ...GUARD.joints,
    torso: [-0.25, -0.4, 0],
    shoulderL: [-2.7, 0, -0.1],
    elbowL: [-0.6, 0, 0],
    hipR: [-0.6, 0, 0],
    kneeR: [0.9, 0, 0],
    hipL: [0.2, 0, 0],
    kneeL: [0.7, 0, 0],
  },
};

const BLOCK_HIGH: Pose = {
  hipsY: -0.1,
  hipsRot: [0, 0.4, 0],
  joints: {
    ...GUARD.joints,
    torso: [0.2, -0.2, 0],
    head: [0.25, 0, 0],
    shoulderR: [-1.5, 0, 0.35],
    elbowR: [-2.3, 0, 0],
    shoulderL: [-1.4, 0, -0.35],
    elbowL: [-2.4, 0, 0],
  },
};

const BLOCK_LOW: Pose = {
  hipsY: -0.42,
  hipsRot: [0, 0.4, 0],
  joints: {
    torso: [0.35, -0.2, 0],
    head: [0.1, 0, 0],
    shoulderR: [-0.9, 0, 0.3],
    elbowR: [-1.6, 0, 0],
    shoulderL: [-0.8, 0, -0.3],
    elbowL: [-1.8, 0, 0],
    hipR: [-1.3, 0, 0],
    kneeR: [1.9, 0, 0],
    hipL: [-0.5, 0, 0],
    kneeL: [1.8, 0, 0],
  },
};

const HIT: Pose = {
  hipsY: -0.06,
  hipsRot: [0, 0.4, 0],
  joints: {
    ...GUARD.joints,
    torso: [-0.5, 0.1, 0.1],
    head: [-0.5, 0.2, 0],
    shoulderR: [-0.5, 0, 0.5],
    elbowR: [-1.0, 0, 0],
    shoulderL: [-0.2, 0, -0.6],
    elbowL: [-0.8, 0, 0],
    hipR: [-0.2, 0, 0],
    kneeR: [0.3, 0, 0],
  },
};

const DAZED: Pose = {
  hipsY: -0.15,
  hipsRot: [0, 0.2, 0],
  joints: {
    torso: [0.45, 0, 0.15],
    head: [0.5, 0, 0.3],
    shoulderR: [0.1, 0, 0.15],
    elbowR: [-0.3, 0, 0],
    shoulderL: [0.1, 0, -0.15],
    elbowL: [-0.3, 0, 0],
    hipR: [-0.2, 0, 0],
    kneeR: [0.5, 0, 0],
    hipL: [-0.1, 0, 0],
    kneeL: [0.6, 0, 0],
  },
};

const KO: Pose = {
  hipsY: -0.82,
  hipsRot: [-1.45, 0.3, 0],
  joints: {
    torso: [-0.1, 0, 0],
    head: [-0.3, 0.5, 0],
    shoulderR: [-2.6, 0, 0.6],
    elbowR: [-0.4, 0, 0],
    shoulderL: [-2.8, 0, -0.5],
    elbowL: [-0.2, 0, 0],
    hipR: [-0.3, 0, 0.15],
    kneeR: [0.4, 0, 0],
    hipL: [0.1, 0, -0.1],
    kneeL: [0.1, 0, 0],
  },
};

const VICTORY: Pose = {
  hipsY: 0,
  hipsRot: [0, 0, 0],
  joints: {
    torso: [-0.1, 0, 0],
    head: [-0.25, 0, 0],
    shoulderR: [-3.0, 0, 0.3],
    elbowR: [-0.3, 0, 0],
    shoulderL: [-0.3, 0, -0.2],
    elbowL: [-1.8, 0, 0],
    hipR: [-0.1, 0, 0.1],
    kneeR: [0.1, 0, 0],
    hipL: [0.1, 0, -0.1],
    kneeL: [0.1, 0, 0],
  },
};

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const joints: Pose['joints'] = {};
  for (const j of JOINTS) {
    const ra = a.joints[j] ?? [0, 0, 0];
    const rb = b.joints[j] ?? [0, 0, 0];
    joints[j] = [
      ra[0] + (rb[0] - ra[0]) * t,
      ra[1] + (rb[1] - ra[1]) * t,
      ra[2] + (rb[2] - ra[2]) * t,
    ];
  }
  const r = (i: number) => a.hipsRot[i] + (b.hipsRot[i] - a.hipsRot[i]) * t;
  return { hipsY: a.hipsY + (b.hipsY - a.hipsY) * t, hipsRot: [r(0), r(1), r(2)], joints };
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Pose cible pour un état de simulation donné. `time` sert aux mouvements cycliques. */
function poseFor(f: FighterState, time: number): { pose: Pose; snap: boolean } {
  switch (f.action) {
    case 'attack': {
      const move = moveOf(f)!;
      const target = f.character === 'brick' && f.move === 'hk' ? UPPERCUT : ATTACK_POSES[f.move!];
      const k = f.actionFrame;
      let t: number;
      if (k < move.startup) t = easeOut((k + 1) / move.startup);
      else if (k < move.startup + move.active) t = 1;
      else t = 1 - (k - move.startup - move.active) / move.recovery;
      return { pose: lerpPose(GUARD, target, t), snap: true };
    }
    case 'block':
    case 'blockstun':
      return { pose: f.blockHeight === 'low' ? BLOCK_LOW : BLOCK_HIGH, snap: false };
    case 'hitstun': {
      const t = 1 - Math.min(1, f.actionFrame / f.stun);
      return { pose: lerpPose(GUARD, HIT, Math.min(1, t * 1.6)), snap: f.actionFrame < 2 };
    }
    case 'guardBroken': {
      const sway = Math.sin(time * 9) * 0.15;
      return { pose: { ...DAZED, hipsRot: [0, 0.2, sway] }, snap: false };
    }
    case 'ko':
      return { pose: lerpPose(HIT, KO, Math.min(1, f.actionFrame / 28)), snap: true };
    case 'victory':
      return { pose: VICTORY, snap: false };
    case 'walk': {
      const s = Math.sin(time * 11) * 0.35;
      const pose = lerpPose(GUARD, GUARD, 0);
      pose.joints.hipR = [-0.45 + s, 0, 0];
      pose.joints.hipL = [0.35 - s, 0, 0];
      pose.joints.kneeR = [0.45 + Math.max(0, -s), 0, 0];
      pose.joints.kneeL = [0.35 + Math.max(0, s), 0, 0];
      pose.hipsY = GUARD.hipsY + Math.abs(Math.cos(time * 11)) * 0.03;
      return { pose, snap: false };
    }
    default: {
      // Garde avec léger rebond, façon boxeur.
      const bob = Math.sin(time * 5) * 0.025;
      const pose = lerpPose(GUARD, GUARD, 0);
      pose.hipsY += bob;
      pose.joints.kneeR = [0.45 - bob * 4, 0, 0];
      pose.joints.kneeL = [0.35 - bob * 4, 0, 0];
      return { pose, snap: false };
    }
  }
}

function flat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
}

/** Membre : boîte suspendue sous son pivot. */
function limb(material: THREE.Material, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = -h / 2;
  return mesh;
}

export class FighterModel {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly joints = {} as Record<Joint, THREE.Group>;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private current: Pose = GUARD;

  constructor(character: CharacterId) {
    const pal = PALETTES[character];
    const mat = (c: string) => {
      const m = flat(c);
      this.materials.push(m);
      return m;
    };
    const skin = mat(pal.skin);
    const top = pal.top ? mat(pal.top) : skin;
    const bottom = mat(pal.bottom);
    const gloves = mat(pal.gloves);
    const belt = mat(pal.belt);
    const hair = mat(pal.hair);

    const pivot = (name: Joint, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };

    this.hips.position.y = 0.95;
    this.root.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), bottom);
    this.hips.add(pelvis);

    const torso = pivot('torso', this.hips, 0, 0.08);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.26), top);
    chest.position.y = 0.28;
    const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.24), belt);
    beltMesh.position.y = 0.02;
    torso.add(chest, beltMesh);

    const head = pivot('head', torso, 0, 0.58);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), skin);
    skull.position.y = 0.13;
    const hairMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.155, 0), hair);
    hairMesh.position.set(0, 0.19, -0.03);
    hairMesh.scale.set(1, 0.6, 1);
    head.add(skull, hairMesh);

    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? -1 : 1;
      const shoulder = pivot(`shoulder${side}`, torso, sx * 0.29, 0.48);
      shoulder.add(limb(top, 0.13, 0.3, 0.13));
      const elbow = pivot(`elbow${side}`, shoulder, 0, -0.3);
      elbow.add(limb(skin, 0.11, 0.26, 0.11));
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.15), gloves);
      fist.position.y = -0.31;
      elbow.add(fist);

      const hip = pivot(`hip${side}`, this.hips, sx * 0.12, -0.05);
      hip.add(limb(bottom, 0.16, 0.45, 0.16));
      const knee = pivot(`knee${side}`, hip, 0, -0.45);
      knee.add(limb(bottom, 0.14, 0.42, 0.14));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), skin);
      foot.position.set(0, -0.44, 0.05);
      knee.add(foot);
    }

    this.root.scale.setScalar(SCALE[character]);
    this.root.traverse((o) => (o.castShadow = true));
  }

  /** Met à jour position, orientation, pose et flash d'impact. */
  update(f: FighterState, x: number, time: number, dt: number): void {
    this.root.position.set(x, f.y, 0);
    this.root.rotation.y = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;

    const { pose, snap } = poseFor(f, time);
    this.current = snap ? pose : lerpPose(this.current, pose, 1 - Math.exp(-22 * dt));

    this.hips.position.y = 0.95 + this.current.hipsY;
    this.hips.rotation.set(...this.current.hipsRot);
    for (const j of JOINTS) {
      const r = this.current.joints[j];
      if (r) this.joints[j].rotation.set(r[0], r[1], r[2]);
    }

    const flash = f.flash > 0 ? 1 : 0;
    for (const m of this.materials) {
      m.emissive.setScalar(flash);
    }
  }
}
