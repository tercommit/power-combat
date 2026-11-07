import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Chips, NodeView, createSky, createTerrain, createTool } from '../farm/world';
import {
  FARM,
  LABELS,
  applySave,
  canAfford,
  createFarm,
  hitNode,
  nearestNode,
  nodeRadius,
  resolveCollisions,
  tickFarm,
  toSave,
  upgradeCost,
  upgradeTool,
  type FarmState,
  type ResourceKind,
  type ResourceNode,
} from '../farm/state';
import type { Mode, ModeContext } from './mode';

const SAVE_KEY = 'power-combat:farm';
const SPEED = 4.2;
/** Durée d'un coup d'outil et instant de l'impact (s). */
const SWING = { duration: 0.6, impact: 0.28 };
const KINDS: ResourceKind[] = ['wood', 'stone'];

/** Mode récolte : on se promène dans une clairière pour couper du bois et casser de la pierre. */
export class FarmMode implements Mode {
  readonly camera: THREE.PerspectiveCamera;
  private readonly farm: FarmState;
  private readonly world = new THREE.Group();
  private readonly views = new Map<number, NodeView>();
  private readonly chips: Chips;
  private readonly flame: THREE.Object3D | undefined;

  // Joueur.
  private readonly player = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<'idle' | 'walk' | 'swing', THREE.AnimationAction>;
  private readonly tools: Record<ResourceKind, THREE.Group>;
  private pos = new THREE.Vector2(0, 1.5);
  private heading = Math.PI;
  private moving = false;
  private swingTime = -1;
  private swingTarget: ResourceNode | null = null;
  /** Cible choisie au clic : on y marche puis on la récolte jusqu'au bout. */
  private goal: { node: ResourceNode | null; x: number; z: number } | null = null;

  // Caméra orbitale autour du joueur.
  private camYaw = 0;
  private camDist = 9;
  private drag: { x: number; yaw: number; moved: boolean } | null = null;

  private readonly keys = new Set<string>();
  private gamepadPrev: boolean[] = [];
  private readonly restore: (() => void)[] = [];
  private readonly hud: {
    counts: Record<ResourceKind, HTMLElement>;
    tools: Record<
      ResourceKind,
      { level: HTMLElement; cost: HTMLElement; button: HTMLButtonElement }
    >;
    prompt: HTMLElement;
    floats: HTMLElement;
  };
  private readonly raycaster = new THREE.Raycaster();

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Digit1' || e.code === 'Numpad1') this.upgrade('wood');
    if (e.code === 'Digit2' || e.code === 'Numpad2') this.upgrade('stone');
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private readonly onBlur = () => this.keys.clear();
  private readonly onPointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, yaw: this.camYaw, moved: false };
  };
  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    if (Math.abs(dx) > 6) this.drag.moved = true;
    if (this.drag.moved) this.camYaw = this.drag.yaw - dx * 0.008;
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    if (this.drag && !this.drag.moved) this.pick(e.clientX, e.clientY);
    this.drag = null;
  };
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.01, 5, 16);
  };

  constructor(private readonly ctx: ModeContext) {
    this.camera = new THREE.PerspectiveCamera(50, ctx.aspect(), 0.1, 300);
    this.farm = createFarm(2026);
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) applySave(this.farm, JSON.parse(raw));
    } catch {
      // Pas de stockage disponible : on repart de zéro.
    }

    this.setupEnvironment();
    const terrain = createTerrain();
    this.flame = terrain.getObjectByName('flame');
    this.world.add(createSky(), terrain);
    for (const node of this.farm.nodes) {
      const view = new NodeView(node, 100 + node.id);
      this.views.set(node.id, view);
      this.world.add(view.root);
    }
    this.chips = new Chips(this.world);

    // Personnage : le mannequin du jeu, en tenue de bûcheron.
    const model = SkeletonUtils.clone(ctx.assets.scene);
    let hand: THREE.Object3D | undefined;
    model.traverse((o) => {
      if (o.name === 'hand_r') hand = o;
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const recolor = (m: THREE.Material) => {
          const c = (m as THREE.MeshStandardMaterial).clone();
          c.color.set(c.name === 'M_Joints' ? '#3a5a8c' : '#c0392b');
          c.flatShading = true;
          c.roughness = 0.8;
          c.metalness = 0;
          return c;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(recolor)
          : recolor(mesh.material);
      }
    });
    this.player.add(model);
    this.world.add(this.player);

    this.tools = { wood: createTool('wood'), stone: createTool('stone') };
    if (hand) {
      // L'os de la main peut porter une échelle : on la compense pour garder l'outil à taille réelle.
      model.updateMatrixWorld(true);
      const scale = new THREE.Vector3();
      hand.getWorldScale(scale);
      for (const tool of Object.values(this.tools)) {
        tool.scale.setScalar(1 / scale.x);
        tool.rotation.set(0, 0, 0);
        tool.position.set(0.0 / scale.x, 0.08 / scale.x, 0);
        hand.add(tool);
      }
    }
    this.tools.stone.visible = false;

    this.mixer = new THREE.AnimationMixer(model);
    const clip = (name: string) => ctx.assets.clips.get(name)!;
    this.actions = {
      idle: this.mixer.clipAction(clip('Idle_Loop')),
      walk: this.mixer.clipAction(clip('Walk_Loop')),
      swing: this.mixer.clipAction(clip('Punch_Cross')),
    };
    this.actions.swing.setLoop(THREE.LoopOnce, 1);
    this.actions.swing.clampWhenFinished = true;
    this.actions.idle.play();
    this.actions.walk.play();
    this.actions.walk.setEffectiveWeight(0);

    ctx.scene.add(this.world);

    this.hud = this.buildHud();
    this.refreshHud();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    ctx.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.updateCamera(0, true);
  }

  /** Masque le dojo et passe la lumière en plein jour ; tout est restauré à la sortie. */
  private setupEnvironment(): void {
    const scene = this.ctx.scene;
    for (const child of scene.children) {
      if ((child as THREE.Light).isLight) continue;
      const visible = child.visible;
      child.visible = false;
      this.restore.push(() => (child.visible = visible));
    }
    const fog = scene.fog;
    scene.fog = new THREE.Fog('#cfe8f5', 35, 95);
    this.restore.push(() => (scene.fog = fog));

    for (const child of scene.children) {
      const light = child as THREE.Light;
      if (!light.isLight) continue;
      const color = light.color.clone();
      const intensity = light.intensity;
      this.restore.push(() => {
        light.color.copy(color);
        light.intensity = intensity;
      });
      if ((light as THREE.HemisphereLight).isHemisphereLight) {
        const hemi = light as THREE.HemisphereLight;
        const ground = hemi.groundColor.clone();
        this.restore.push(() => hemi.groundColor.copy(ground));
        hemi.color.set('#e8f4ff');
        hemi.groundColor.set('#4a6a3a');
        hemi.intensity = 1.3;
      } else if ((light as THREE.DirectionalLight).isDirectionalLight) {
        const sun = light as THREE.DirectionalLight;
        if (sun.castShadow) {
          // Le soleil suit le joueur pour que les ombres restent nettes partout.
          const position = sun.position.clone();
          const cam = sun.shadow.camera;
          const box = [cam.left, cam.right, cam.top, cam.bottom];
          this.restore.push(() => {
            sun.position.copy(position);
            sun.target.position.set(0, 0, 0);
            [cam.left, cam.right, cam.top, cam.bottom] = box;
            cam.updateProjectionMatrix();
          });
          Object.assign(cam, { left: -14, right: 14, top: 14, bottom: -14 });
          cam.updateProjectionMatrix();
          scene.add(sun.target);
          this.restore.push(() => scene.remove(sun.target));
          sun.color.set('#fff1d6');
          sun.intensity = 2.6;
          this.sun = sun;
        } else {
          sun.intensity = 0.4;
        }
      }
    }
  }
  private sun: THREE.DirectionalLight | undefined;

  private buildHud() {
    const ui = this.ctx.ui;
    ui.innerHTML = `
      <div class="farm-hud">
        <div class="farm-panel farm-inventory">
          ${KINDS.map((k) => `<div class="farm-count"><span>${LABELS[k].icon}</span><strong data-count="${k}">0</strong><small>${LABELS[k].resource}</small></div>`).join('')}
        </div>
        <div class="farm-panel farm-tools">
          ${KINDS.map(
            (k, i) => `
            <div class="farm-tool">
              <div><strong>${LABELS[k].tool}</strong> <span data-level="${k}"></span></div>
              <small data-cost="${k}"></small>
              <button data-upgrade="${k}">Améliorer <kbd>${i + 1}</kbd></button>
            </div>`,
          ).join('')}
        </div>
        <div class="farm-prompt"></div>
        <div class="farm-floats"></div>
        <p class="farm-help">ZQSD / flèches : se déplacer · E ou Espace : récolter · clic : aller récolter · glisser : tourner la caméra</p>
      </div>
      <button class="back-button">☰ Menu</button>`;
    ui.querySelector('.back-button')!.addEventListener('click', () => this.ctx.navigate(''));
    const q = <T extends HTMLElement>(sel: string) => ui.querySelector<T>(sel)!;
    const hud = {
      counts: { wood: q(`[data-count=wood]`), stone: q(`[data-count=stone]`) },
      tools: Object.fromEntries(
        KINDS.map((k) => [
          k,
          {
            level: q(`[data-level=${k}]`),
            cost: q(`[data-cost=${k}]`),
            button: q<HTMLButtonElement>(`[data-upgrade=${k}]`),
          },
        ]),
      ) as FarmMode['hud']['tools'],
      prompt: q('.farm-prompt'),
      floats: q('.farm-floats'),
    };
    for (const k of KINDS) hud.tools[k].button.addEventListener('click', () => this.upgrade(k));
    return hud;
  }

  private refreshHud(): void {
    for (const k of KINDS) {
      this.hud.counts[k].textContent = String(this.farm.inventory[k]);
      const level = this.farm.tools[k].level;
      const t = this.hud.tools[k];
      t.level.textContent = `niv. ${level}`;
      const cost = upgradeCost(k, level);
      t.cost.textContent = cost
        ? `${cost.wood} ${LABELS.wood.icon} + ${cost.stone} ${LABELS.stone.icon}`
        : 'Niveau maximum';
      t.button.disabled = !cost || !canAfford(this.farm, cost);
      t.button.hidden = !cost;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(this.farm)));
    } catch {
      // Stockage indisponible : la partie n'est pas conservée.
    }
  }

  private upgrade(kind: ResourceKind): void {
    if (!upgradeTool(this.farm, kind)) return;
    this.floatText(
      `${LABELS[kind].tool} niv. ${this.farm.tools[kind].level} !`,
      this.player.position,
      2.4,
      'big',
    );
    this.refreshHud();
    this.save();
  }

  /** Clic sur l'écran : un arbre ou un rocher devient la cible, sinon on marche jusqu'au point. */
  private pick(clientX: number, clientY: number): void {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = [...this.views.values()]
      .filter((v) => v.node.respawnAt === null)
      .map((v) => v.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.nodeId === undefined) o = o.parent;
      if (o) {
        const node = this.farm.nodes[o.userData.nodeId as number];
        this.goal = { node, x: node.x, z: node.z };
        return;
      }
    }
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) {
      this.goal = { node: null, x: point.x, z: point.z };
    }
  }

  private readGamepad(): { x: number; z: number; harvest: boolean; pressed: boolean[] } {
    const pad = navigator.getGamepads?.().find((p) => p);
    if (!pad) return { x: 0, z: 0, harvest: false, pressed: [] };
    const dead = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
    const pressed = pad.buttons.map((b) => b.pressed);
    // X (2) et Y (3) : améliorer la hache / la pioche.
    if (pressed[2] && !this.gamepadPrev[2]) this.upgrade('wood');
    if (pressed[3] && !this.gamepadPrev[3]) this.upgrade('stone');
    this.camYaw -= dead(pad.axes[2] ?? 0) * 0.04;
    return { x: dead(pad.axes[0]), z: dead(pad.axes[1]), harvest: !!pressed[0], pressed };
  }

  private startSwing(node: ResourceNode): void {
    this.swingTime = 0;
    this.swingTarget = node;
    this.heading = Math.atan2(node.x - this.pos.x, node.z - this.pos.y);
    for (const k of KINDS) this.tools[k].visible = k === node.kind;
    const swing = this.actions.swing;
    swing.reset();
    swing.timeScale = 1.3;
    swing.setEffectiveWeight(1);
    swing.play();
  }

  private impact(node: ResourceNode): void {
    const result = hitNode(this.farm, node);
    if (!result) return;
    const view = this.views.get(node.id)!;
    view.hit();
    const towardsPlayer = new THREE.Vector2(this.pos.x - node.x, this.pos.y - node.z).normalize();
    const r = nodeRadius(node);
    const px = node.x + towardsPlayer.x * r;
    const pz = node.z + towardsPlayer.y * r;
    const color = node.kind === 'wood' ? '#c8955a' : '#a0a3a8';
    this.chips.burst(px, node.kind === 'wood' ? 0.9 : 0.5, pz, color, result.depleted ? 14 : 6);
    this.floatText(
      `+${result.gained} ${LABELS[node.kind].icon}`,
      new THREE.Vector3(node.x, node.kind === 'wood' ? 2.6 : 1.5, node.z),
      1.1,
      result.depleted ? 'big' : '',
    );
    if (result.depleted) {
      view.deplete(this.pos.x, this.pos.y);
      if (this.goal?.node === node) this.goal = null;
    }
    this.refreshHud();
    this.save();
  }

  private floatText(text: string, at: THREE.Vector3, life: number, cls: string): void {
    const el = document.createElement('div');
    el.className = `farm-float ${cls}`;
    el.textContent = text;
    this.hud.floats.appendChild(el);
    const origin = at.clone();
    const start = performance.now();
    const tick = () => {
      if (!el.isConnected) return;
      const t = (performance.now() - start) / 1000 / life;
      if (t >= 1) {
        el.remove();
        return;
      }
      const p = origin.clone();
      p.y += t * 1.2;
      p.project(this.camera);
      el.style.transform = `translate(${((p.x + 1) / 2) * window.innerWidth}px, ${((1 - p.y) / 2) * window.innerHeight}px) translate(-50%, -50%)`;
      el.style.opacity = String(1 - t * t);
      requestAnimationFrame(tick);
    };
    tick();
  }

  update(now: number, elapsedMs: number): void {
    const dt = elapsedMs / 1000;

    for (const node of tickFarm(this.farm, dt)) this.views.get(node.id)!.respawn();

    // --- Entrées ---
    const pad = this.readGamepad();
    let ix = pad.x;
    let iz = pad.z;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
    const harvestHeld = this.keys.has('KeyE') || this.keys.has('Space') || pad.harvest;
    this.gamepadPrev = pad.pressed;

    // Mouvement relatif à la caméra.
    let move = new THREE.Vector2();
    if (ix !== 0 || iz !== 0) {
      this.goal = null;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      move.set(ix * cos + iz * sin, -ix * sin + iz * cos);
      if (move.length() > 1) move.normalize();
    }

    const swinging = this.swingTime >= 0;
    const near = nearestNode(this.farm, this.pos.x, this.pos.y);

    // Déplacement automatique vers la cible choisie au clic.
    if (this.goal && !swinging) {
      const g = this.goal;
      if (g.node && g.node.respawnAt !== null) this.goal = null;
      else {
        const d = new THREE.Vector2(g.x - this.pos.x, g.z - this.pos.y);
        const stop = g.node ? nodeRadius(g.node) + FARM.reach * 0.7 : 0.2;
        if (d.length() > stop) move = d.normalize();
        else if (g.node) this.startSwing(g.node);
        else this.goal = null;
      }
    }

    if (!swinging && harvestHeld && near && move.lengthSq() === 0) this.startSwing(near);

    // --- Coup d'outil en cours ---
    if (this.swingTime >= 0) {
      const before = this.swingTime;
      this.swingTime += dt;
      if (before < SWING.impact && this.swingTime >= SWING.impact && this.swingTarget) {
        this.impact(this.swingTarget);
      }
      if (this.swingTime >= SWING.duration) {
        this.swingTime = -1;
        this.swingTarget = null;
      }
      move.set(0, 0);
    }

    this.moving = move.lengthSq() > 0;
    if (this.moving) {
      const [x, z] = resolveCollisions(
        this.farm,
        this.pos.x + move.x * SPEED * dt,
        this.pos.y + move.y * SPEED * dt,
      );
      this.pos.set(x, z);
      this.heading = Math.atan2(move.x, move.y);
    }

    // --- Rendu du joueur ---
    this.player.position.set(this.pos.x, 0, this.pos.y);
    let delta = this.heading - this.player.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.player.rotation.y += delta * Math.min(1, dt * 14);

    const blend = Math.min(1, dt * 10);
    const walkW = this.actions.walk.getEffectiveWeight();
    const swingW = this.swingTime >= 0 ? 1 : 0;
    const targetWalk = this.moving ? 1 : 0;
    const w = walkW + (targetWalk - walkW) * blend;
    this.actions.walk.setEffectiveWeight(w * (1 - swingW));
    this.actions.walk.timeScale = 1.25;
    this.actions.idle.setEffectiveWeight((1 - w) * (1 - swingW));
    if (!swingW) this.actions.swing.setEffectiveWeight(0);
    this.mixer.update(dt);

    // Outil affiché selon la ressource la plus proche.
    if (!swingW) {
      const focus = this.goal?.node ?? near;
      if (focus) for (const k of KINDS) this.tools[k].visible = k === focus.kind;
    }

    for (const view of this.views.values()) view.update(dt);
    this.chips.update(dt);
    if (this.flame) {
      this.flame.scale.set(1, 0.8 + Math.sin(now / 90) * 0.15 + Math.sin(now / 37) * 0.08, 1);
    }

    // Indication à l'écran.
    const target = this.goal?.node ?? near;
    if (target && !this.goal) {
      this.hud.prompt.textContent = `E / Espace : ${target.kind === 'wood' ? 'couper' : 'miner'} (${target.hp}/${target.maxHp})`;
      this.hud.prompt.hidden = false;
    } else this.hud.prompt.hidden = true;

    if (this.sun) {
      this.sun.position.set(this.pos.x - 8, 14, this.pos.y + 6);
      this.sun.target.position.set(this.pos.x, 0, this.pos.y);
    }
    this.updateCamera(dt);
  }

  private updateCamera(dt: number, snap = false): void {
    const height = this.camDist * 0.75;
    const desired = new THREE.Vector3(
      this.pos.x + Math.sin(this.camYaw) * this.camDist,
      height,
      this.pos.y + Math.cos(this.camYaw) * this.camDist,
    );
    if (snap) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, Math.min(1, dt * 8));
    this.camera.lookAt(this.pos.x, 1, this.pos.y);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.ctx.canvas.removeEventListener('wheel', this.onWheel);
    this.chips.dispose();
    this.mixer.stopAllAction();
    this.ctx.scene.remove(this.world);
    this.restore.reverse().forEach((fn) => fn());
  }
}
