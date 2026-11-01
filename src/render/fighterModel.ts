/**
 * Combattant animé à partir du mannequin riggé de la Universal Animation Library
 * (Quaternius, CC0). Les animations sont échantillonnées à partir de l'état de
 * simulation (pas de lecture en temps réel) : le rendu illustre, il ne décide pas.
 *
 * Le pack ne contient ni coups de pied, ni garde, ni uppercut : ces poses sont
 * construites en orientant les os (« aim ») par-dessus la garde du jab. Les
 * coups de pied font aussi tourner le bassin, avec le pied d'appui maintenu au
 * sol par cinématique inverse (voir kicks.ts).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { moveOf } from '../sim/state';
import type { CharacterId, FighterState, MoveId } from '../sim/types';
import { KICKS, kickPose, type KickKey, type Vec3 } from './kicks';

const MODEL_URL = `${import.meta.env.BASE_URL}assets/models/fighter.glb`;

export interface FighterAssets {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

/** Os du haut du corps : la marche ne les anime pas, ils restent en garde. */
const UPPER_BODY =
  /^(spine|neck|Head|clavicle|upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)/;

function splitClip(clip: THREE.AnimationClip, name: string, upper: boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => UPPER_BODY.test(t.name.split('.')[0]) === upper);
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

export async function loadFighterAssets(): Promise<FighterAssets> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL_URL);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  const get = (n: string) => clips.get(n)!;
  clips.set('Walk_Lower', splitClip(get('Walk_Loop'), 'Walk_Lower', false));
  clips.set('Guard_Upper', splitClip(get('Punch_Jab'), 'Guard_Upper', true));
  return { scene: gltf.scene, clips };
}

interface Palette {
  main: string;
  joints: string;
}

const PALETTES: Record<CharacterId, Palette> = {
  kai: { main: '#f2ede2', joints: '#c8402f' },
  brick: { main: '#2f5fc4', joints: '#e8b53a' },
};

const SCALE: Record<CharacterId, number> = { kai: 1, brick: 1.08 };

/**
 * Moments clés des clips de coups de poing (en secondes), mesurés sur les
 * animations : début du geste, bras tendu, fin du maintien, retour en garde.
 */
const CLIP_TIMING: Partial<
  Record<MoveId, { clip: string; keys: [number, number, number, number] }>
> = {
  lp: { clip: 'Punch_Jab', keys: [0, 0.22, 0.3, 0.75] },
  hp: { clip: 'Punch_Cross', keys: [0.12, 0.25, 0.42, 0.95] },
};

type Layer = { clip: string; time: number };

/** Une orientation d'os, exprimée dans le repère du personnage (+z = vers l'adversaire). */
type Aim = { bone: string; child: string; dir: [number, number, number] };

const AIMS = {
  uppercut: [
    { bone: 'spine_01', child: 'spine_03', dir: [0, 0.95, 0.2] },
    { bone: 'upperarm_r', child: 'lowerarm_r', dir: [0.15, -0.1, 0.95] },
    { bone: 'lowerarm_r', child: 'hand_r', dir: [0.05, 0.95, 0.3] },
  ],
  blockHigh: [
    { bone: 'upperarm_l', child: 'lowerarm_l', dir: [-0.15, -0.2, 0.95] },
    { bone: 'lowerarm_l', child: 'hand_l', dir: [-0.25, 0.95, 0.15] },
    { bone: 'upperarm_r', child: 'lowerarm_r', dir: [0.15, -0.2, 0.95] },
    { bone: 'lowerarm_r', child: 'hand_r', dir: [0.25, 0.95, 0.15] },
  ],
  blockLow: [
    { bone: 'upperarm_l', child: 'lowerarm_l', dir: [0.05, -0.55, 0.85] },
    { bone: 'lowerarm_l', child: 'hand_l', dir: [-0.3, 0.5, 0.8] },
    { bone: 'upperarm_r', child: 'lowerarm_r', dir: [-0.05, -0.55, 0.85] },
    { bone: 'lowerarm_r', child: 'hand_r', dir: [0.3, 0.5, 0.8] },
  ],
} satisfies Record<string, Aim[]>;

interface Target {
  /** Change quand on passe d'une animation à une autre (déclenche un fondu). */
  key: string;
  layers: Layer[];
  aims: Aim[];
  aimWeight: number;
  /** Durée du fondu d'entrée, en secondes. */
  fade: number;
  sway: number;
  /** Pas en avant pendant l'attaque (mètres), purement visuel. */
  lunge: number;
  kick?: { key: KickKey; weight: number };
}

/** Les membres du mannequin sont plus courts que la portée des coups : on avance un peu. */
const LUNGE: Record<MoveId, number> = { lp: 0.15, hp: 0.2, lk: 0.3, hk: 0.35 };

/** Progression d'une attaque : 0 → 1 pendant la préparation, 1 pendant l'impact, 1 → 0 ensuite. */
function attackWeight(frame: number, startup: number, active: number, recovery: number): number {
  if (frame < startup) return (frame + 1) / startup;
  if (frame < startup + active) return 1;
  return Math.max(0, 1 - (frame - startup - active) / recovery);
}

/** Temps dans un clip de coup de poing, aligné sur les phases de la simulation. */
function punchTime(
  keys: [number, number, number, number],
  frame: number,
  s: number,
  a: number,
  r: number,
): number {
  const [t0, t1, t2, t3] = keys;
  if (frame < s) return t0 + (t1 - t0) * ((frame + 1) / s);
  if (frame < s + a) return t1 + (t2 - t1) * ((frame - s) / a);
  return t2 + (t3 - t2) * Math.min(1, (frame - s - a) / r);
}

const GUARD: Layer[] = [{ clip: 'Punch_Jab', time: 0 }];

function targetFor(f: FighterState, time: number): Target {
  const base = { aims: [] as Aim[], aimWeight: 0, fade: 0.12, sway: 0, lunge: 0 };
  switch (f.action) {
    case 'attack': {
      const move = moveOf(f)!;
      const { startup: s, active: a, recovery: r } = move;
      const timing = CLIP_TIMING[f.move!];
      const key = `attack-${f.move}`;
      const lunge = LUNGE[f.move!] * attackWeight(f.actionFrame, s, a, r);
      if (timing && !(f.character === 'brick' && f.move === 'hk')) {
        const t = punchTime(timing.keys, f.actionFrame, s, a, r);
        return { ...base, key, layers: [{ clip: timing.clip, time: t }], fade: 0.04, lunge };
      }
      if (f.move === 'lk' || f.move === 'hk') {
        if (f.character !== 'brick' || f.move === 'lk') {
          const def = f.move === 'lk' ? KICKS.lowKick : KICKS.roundhouse;
          const kick = kickPose(def, f.actionFrame, s, a, r);
          return { ...base, key, layers: GUARD, kick, fade: 0.04, lunge };
        }
      }
      const aimWeight = attackWeight(f.actionFrame, s, a, r);
      return { ...base, key, layers: GUARD, aims: AIMS.uppercut, aimWeight, fade: 0.04, lunge };
    }
    case 'walk': {
      const t = time * 1.1 * f.walkDir;
      const duration = 1.33;
      const walkTime = ((t % duration) + duration) % duration;
      return {
        ...base,
        key: 'walk',
        layers: [
          { clip: 'Walk_Lower', time: walkTime },
          { clip: 'Guard_Upper', time: 0 },
        ],
      };
    }
    case 'block':
    case 'blockstun':
      if (f.blockHeight === 'low') {
        return {
          ...base,
          key: 'block-low',
          layers: [{ clip: 'Crouch_Idle_Loop', time: 0.5 }],
          aims: AIMS.blockLow,
          aimWeight: 1,
          fade: 0.06,
        };
      }
      return {
        ...base,
        key: 'block-high',
        layers: GUARD,
        aims: AIMS.blockHigh,
        aimWeight: 1,
        fade: 0.06,
      };
    case 'hitstun': {
      const clip = f.hitHeight === 'high' ? 'Hit_Head' : 'Hit_Chest';
      const duration = clip === 'Hit_Head' ? 0.43 : 0.33;
      const t = Math.min(duration, (f.actionFrame / f.stun) * duration);
      return { ...base, key: `hit-${f.comboTaken}`, layers: [{ clip, time: t }], fade: 0.03 };
    }
    case 'guardBroken':
      return {
        ...base,
        key: 'dazed',
        layers: [{ clip: 'Hit_Chest', time: 0.04 }],
        sway: Math.sin(time * 8) * 0.25,
      };
    case 'ko':
      return {
        ...base,
        key: 'ko',
        layers: [{ clip: 'Death01', time: Math.min(1.5, f.actionFrame / 60) }],
        fade: 0.05,
      };
    case 'victory':
      return {
        ...base,
        key: 'victory',
        layers: [{ clip: 'Dance_Loop', time: time % 1 }],
        fade: 0.25,
      };
    default:
      return { ...base, key: 'idle', layers: GUARD, sway: Math.sin(time * 4.5) * 0.04 };
  }
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qRoot = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _planted = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Piste d'animation reliée directement à la propriété d'un os. */
interface BoundTrack {
  target: THREE.Vector3 | THREE.Quaternion;
  interpolant: THREE.Interpolant;
}

/**
 * On n'utilise pas AnimationMixer : il n'écrit dans le squelette que lorsque la
 * valeur calculée change, ce qui laisse s'accumuler nos retouches procédurales
 * sur les poses fixes. Ici chaque frame repart de la pose de repos.
 */
export class FighterModel {
  readonly root = new THREE.Group();
  private readonly clips = new Map<string, { duration: number; tracks: BoundTrack[] }>();
  private readonly rest: { q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  private readonly bones: THREE.Bone[] = [];
  private readonly bonesByName = new Map<string, THREE.Bone>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  /** Pose affichée à la frame précédente, et pose de départ du fondu en cours. */
  private readonly last: { q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  private readonly fadeFrom: { q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  private currentKey = '';
  private fadeProgress = 1;
  private fadeDuration = 0.1;

  constructor(assets: FighterAssets, character: CharacterId) {
    const model = SkeletonUtils.clone(assets.scene);
    const palette = PALETTES[character];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        this.bones.push(o as THREE.Bone);
        this.bonesByName.set(o.name, o as THREE.Bone);
      }
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
          (m) => {
            const clone = (m as THREE.MeshStandardMaterial).clone();
            clone.color.set(clone.name === 'M_Joints' ? palette.joints : palette.main);
            clone.flatShading = true;
            clone.roughness = 0.8;
            clone.metalness = 0;
            this.materials.push(clone);
            return clone;
          },
        );
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      }
    });
    this.root.add(model);
    this.root.scale.setScalar(SCALE[character]);

    for (const [name, clip] of assets.clips) {
      const tracks: BoundTrack[] = [];
      for (const track of clip.tracks) {
        const [boneName, property] = track.name.split('.');
        const bone = this.bonesByName.get(boneName);
        if (!bone || (property !== 'quaternion' && property !== 'position')) continue;
        // createInterpolant existe à l'exécution mais n'est pas typé par @types/three.
        const interpolant = (
          track as unknown as { createInterpolant(): THREE.Interpolant }
        ).createInterpolant();
        tracks.push({ target: bone[property], interpolant });
      }
      this.clips.set(name, { duration: clip.duration, tracks });
    }
    for (const bone of this.bones) {
      this.rest.push({ q: bone.quaternion.clone(), p: bone.position.clone() });
      this.last.push({ q: bone.quaternion.clone(), p: bone.position.clone() });
      this.fadeFrom.push({ q: new THREE.Quaternion(), p: new THREE.Vector3() });
    }
  }

  update(f: FighterState, x: number, time: number, dt: number): void {
    const target = targetFor(f, time);
    this.root.position.set(x + target.lunge * f.facing, f.y, 0);
    this.root.rotation.y = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
    this.root.updateMatrixWorld(true);
    if (target.key !== this.currentKey) {
      this.currentKey = target.key;
      this.fadeProgress = 0;
      this.fadeDuration = target.fade;
      this.last.forEach((s, i) => {
        this.fadeFrom[i].q.copy(s.q);
        this.fadeFrom[i].p.copy(s.p);
      });
    }

    // 1. Pose de base : pose de repos, puis les clips demandés au temps voulu.
    this.bones.forEach((bone, i) => {
      bone.quaternion.copy(this.rest[i].q);
      bone.position.copy(this.rest[i].p);
    });
    for (const layer of target.layers) {
      const clip = this.clips.get(layer.clip)!;
      const t = THREE.MathUtils.clamp(layer.time, 0, clip.duration);
      for (const track of clip.tracks) track.target.fromArray(track.interpolant.evaluate(t));
    }

    // 2. Retouches procédurales (coups de pied, garde, balancement).
    if (target.sway) this.bonesByName.get('spine_02')?.rotateZ(target.sway * 0.3);
    if (target.kick && target.kick.weight > 0) this.applyKick(target.kick.key, target.kick.weight);
    if (target.aimWeight > 0) {
      this.root.updateMatrixWorld(true);
      for (const aim of target.aims) this.aim(aim, target.aimWeight);
    }

    // 3. Fondu depuis la pose précédente.
    if (this.fadeProgress < 1) {
      this.fadeProgress = Math.min(1, this.fadeProgress + dt / this.fadeDuration);
      const k = this.fadeProgress * (2 - this.fadeProgress);
      this.bones.forEach((bone, i) => {
        // slerpQuaternions(a, b) écrase sa cible avant de lire b : on passe par une copie.
        _q.copy(bone.quaternion);
        bone.quaternion.copy(this.fadeFrom[i].q).slerp(_q, k);
        bone.position.lerpVectors(this.fadeFrom[i].p, bone.position, k);
      });
    }
    this.bones.forEach((bone, i) => {
      this.last[i].q.copy(bone.quaternion);
      this.last[i].p.copy(bone.position);
    });

    const flash = f.flash > 0 ? 0.9 : 0;
    for (const m of this.materials) m.emissive.setScalar(flash);
  }

  /**
   * Coup de pied : rotation et descente du bassin, jambe d'appui recalée sur son
   * pied (cinématique inverse), puis jambe qui frappe, buste et bras arrière.
   */
  private applyKick(key: KickKey, weight: number): void {
    const bone = (n: string) => this.bonesByName.get(n)!;
    const pelvis = bone('pelvis');
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_qRoot);
    bone('foot_l').getWorldPosition(_planted);

    // Bassin : inclinaison, puis rotation autour de la verticale (repère du personnage).
    const [pitch, yaw, roll] = key.pelvis;
    _euler.set(pitch * weight, yaw * weight, roll * weight, 'YZX');
    _q.setFromEuler(_euler);
    const pelvisTurn = _qWorld.copy(_qRoot).multiply(_q).multiply(_qParent.copy(_qRoot).invert());
    pelvis.getWorldQuaternion(_q).premultiply(pelvisTurn);
    pelvis.parent!.getWorldQuaternion(_qParent);
    pelvis.quaternion.copy(_qParent.invert().multiply(_q));
    pelvis.getWorldPosition(_pos).y -= key.drop * weight;
    pelvis.position.copy(pelvis.parent!.worldToLocal(_pos));
    pelvis.updateMatrixWorld(true);

    // Jambe d'appui : le pied reste planté, le genou pointe dans l'axe du bassin.
    _pole.copy(FORWARD).applyQuaternion(_qRoot).applyQuaternion(pelvisTurn);
    this.solveLeg('thigh_l', 'calf_l', 'foot_l', _planted, _pole);

    const aimDir = (b: string, c: string, dir: Vec3) =>
      this.aim({ bone: b, child: c, dir }, weight);
    aimDir('thigh_r', 'calf_r', key.thigh);
    aimDir('calf_r', 'foot_r', key.calf);
    aimDir('spine_01', 'spine_03', key.spine);
    aimDir('upperarm_r', 'lowerarm_r', key.arm);
    aimDir('lowerarm_r', 'hand_r', key.forearm);
  }

  /** Cinématique inverse à deux os : place le pied sur `target`, genou vers `pole`. */
  private solveLeg(
    thighName: string,
    calfName: string,
    footName: string,
    target: THREE.Vector3,
    pole: THREE.Vector3,
  ): void {
    const thigh = this.bonesByName.get(thighName)!;
    const calf = this.bonesByName.get(calfName)!;
    const foot = this.bonesByName.get(footName)!;
    thigh.getWorldPosition(_hip);
    calf.getWorldPosition(_knee);
    const upper = _hip.distanceTo(_knee);
    const lower = _knee.distanceTo(foot.getWorldPosition(_pos));
    _dir.subVectors(target, _hip);
    const dist = THREE.MathUtils.clamp(_dir.length(), 0.01, upper + lower - 1e-4);
    _dir.normalize();
    const cosHip = THREE.MathUtils.clamp(
      (upper * upper + dist * dist - lower * lower) / (2 * upper * dist),
      -1,
      1,
    );
    _side.copy(pole).addScaledVector(_dir, -pole.dot(_dir)).normalize();
    _knee
      .copy(_hip)
      .addScaledVector(_dir, upper * cosHip)
      .addScaledVector(_side, upper * Math.sqrt(1 - cosHip * cosHip));
    this.aimWorld(thigh, calf, _from.subVectors(_knee, _hip).normalize(), 1);
    calf.getWorldPosition(_knee);
    this.aimWorld(calf, foot, _from.subVectors(target, _knee).normalize(), 1);
  }

  /** Oriente un os pour que son segment (os → enfant) pointe dans `dir` (repère du personnage). */
  private aim({ bone: boneName, child: childName, dir }: Aim, weight: number): void {
    const bone = this.bonesByName.get(boneName);
    const child = this.bonesByName.get(childName);
    if (!bone || !child) return;
    this.root.getWorldQuaternion(_qRoot);
    const worldDir = new THREE.Vector3(...dir).normalize().applyQuaternion(_qRoot);
    this.aimWorld(bone, child, worldDir, weight);
  }

  /** Même chose avec une direction en coordonnées monde. */
  private aimWorld(
    bone: THREE.Bone,
    child: THREE.Bone,
    worldDir: THREE.Vector3,
    weight: number,
  ): void {
    if (!bone.parent) return;
    _to.copy(child.getWorldPosition(_to)).sub(bone.getWorldPosition(_pos)).normalize();
    _q.setFromUnitVectors(_to, worldDir);
    if (weight < 1) _q.copy(IDENTITY.clone().slerp(_q, weight));
    bone.getWorldQuaternion(_qWorld);
    _qWorld.premultiply(_q);
    bone.parent.getWorldQuaternion(_qParent);
    bone.quaternion.copy(_qParent.invert().multiply(_qWorld));
    bone.updateMatrixWorld(true);
  }
}
