/** Décor et ressources du mode récolte, en low poly. */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { FARM, type ResourceNode } from './state';

const materials = new Map<string, THREE.MeshStandardMaterial>();
export function flat(color: string): THREE.MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
    materials.set(color, m);
  }
  return m;
}

function shadows(o: THREE.Object3D): THREE.Object3D {
  o.traverse((c) => {
    c.castShadow = true;
    c.receiveShadow = true;
  });
  return o;
}

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#4a8fe0') },
      horizon: { value: new THREE.Color('#d8f0ff') },
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying float vHeight;
      void main() {
        gl_FragColor = vec4(mix(horizon, top, smoothstep(-0.05, 0.5, vHeight)), 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(150, 16, 12), material);
}

export function createTerrain(): THREE.Group {
  const group = new THREE.Group();
  const rng = new Rng(7);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(FARM.worldRadius + 1, FARM.worldRadius + 3, 1, 24),
    flat('#6fae4a'),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  group.add(ground);

  // Plaine extérieure, plus sombre, pour marquer la limite.
  const outer = new THREE.Mesh(new THREE.CircleGeometry(120, 24), flat('#4f8a3a'));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.9;
  group.add(outer);

  // Clairière de terre au centre, avec un feu de camp.
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(FARM.clearing - 0.6, 10), flat('#b48a5a'));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.01;
  dirt.receiveShadow = true;
  group.add(dirt);
  const fire = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), flat('#8a8a8a'));
    stone.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    fire.add(stone);
  }
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5), flat('#6b4527'));
    log.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI);
    log.position.y = 0.1;
    fire.add(log);
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.55, 5),
    new THREE.MeshBasicMaterial({ color: '#ffb23a' }),
  );
  flame.name = 'flame';
  flame.position.y = 0.38;
  fire.add(flame);
  fire.position.set(1.6, 0, -1.2);
  group.add(shadows(fire));

  // Touffes d'herbe et fleurs.
  const tuft = new THREE.ConeGeometry(0.08, 0.3, 3);
  for (let i = 0; i < 160; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = FARM.clearing + rng.next() * (FARM.worldRadius - FARM.clearing);
    const m = new THREE.Mesh(tuft, flat(rng.pick(['#5d9a3c', '#7cc052', '#8fd05e'])));
    m.position.set(Math.cos(a) * d, 0.12, Math.sin(a) * d);
    m.rotation.z = (rng.next() - 0.5) * 0.5;
    group.add(m);
    if (rng.chance(0.25)) {
      const f = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.06, 0),
        flat(rng.pick(['#ffe14d', '#ff7aa8', '#ffffff'])),
      );
      f.position.set(m.position.x + 0.15, 0.2, m.position.z);
      group.add(f);
    }
  }

  // Collines et montagnes au loin.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.next() * 0.3;
    const d = 55 + rng.next() * 25;
    const h = 10 + rng.next() * 16;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(10 + rng.next() * 8, h, 5),
      flat(rng.pick(['#5f8f6a', '#6f9a78', '#7a8fa6'])),
    );
    m.position.set(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d);
    m.rotation.y = rng.next() * 3;
    group.add(m);
  }

  return group;
}

/** Visuel d'un arbre ou d'un rocher, avec ses animations de coup, chute et repousse. */
export class NodeView {
  readonly root = new THREE.Group();
  /** Partie récoltable (tronc + feuillage, ou rocher). */
  private readonly body = new THREE.Group();
  /** Ce qui reste une fois récolté (souche, gravats). */
  private readonly remains = new THREE.Group();
  private shake = 0;
  private fall = -1;
  private fallDir = 1;
  private grow = 1;

  constructor(
    readonly node: ResourceNode,
    seed: number,
  ) {
    const rng = new Rng(seed);
    if (node.kind === 'wood') this.buildTree(rng);
    else this.buildRock(rng);
    this.root.position.set(node.x, 0, node.z);
    this.root.rotation.y = rng.next() * Math.PI * 2;
    this.root.scale.setScalar(node.size);
    this.root.add(shadows(this.body), shadows(this.remains));
    this.remains.visible = false;
    this.root.userData.nodeId = node.id;
  }

  private buildTree(rng: Rng): void {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6), flat('#7a4e2c'));
    trunk.position.y = 0.8;
    this.body.add(trunk);
    const green = rng.pick(['#3f8f3a', '#4ea145', '#2f7a3a']);
    const pine = rng.chance(0.5);
    if (pine) {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1 - i * 0.25, 1.3, 7), flat(green));
        cone.position.y = 1.6 + i * 0.7;
        this.body.add(cone);
      }
    } else {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 0), flat(green));
      crown.position.y = 2.2;
      const side = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), flat(green));
      side.position.set(0.6, 1.9, 0.2);
      this.body.add(crown, side);
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.3, 6), flat('#7a4e2c'));
    stump.position.y = 0.15;
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.2, 6), flat('#d9b07a'));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.301;
    this.remains.add(stump, ring);
  }

  private buildRock(rng: Rng): void {
    const grey = rng.pick(['#8d8f94', '#9a9a9a', '#7e8088']);
    const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), flat(grey));
    main.scale.set(1, 0.7 + rng.next() * 0.3, 0.9);
    main.position.y = 0.4;
    main.rotation.set(rng.next(), rng.next(), rng.next());
    const small = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), flat(grey));
    small.position.set(0.6, 0.2, 0.3);
    this.body.add(main, small);
    // Quelques éclats de minerai.
    for (let i = 0; i < 3; i++) {
      const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), flat('#e8d9a8'));
      const a = rng.next() * Math.PI * 2;
      ore.position.set(Math.cos(a) * 0.6, 0.45 + rng.next() * 0.25, Math.sin(a) * 0.55);
      this.body.add(ore);
    }
    for (let i = 0; i < 4; i++) {
      const bit = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), flat(grey));
      const a = rng.next() * Math.PI * 2;
      bit.position.set(Math.cos(a) * 0.4, 0.08, Math.sin(a) * 0.4);
      this.remains.add(bit);
    }
  }

  hit(): void {
    this.shake = 1;
  }

  /** Lance la chute (arbre) ou l'éclatement (rocher), loin du joueur. */
  deplete(fromX: number, fromZ: number): void {
    this.fall = 0;
    // Direction de chute exprimée dans le repère local du nœud.
    const away = Math.atan2(this.node.x - fromX, this.node.z - fromZ) - this.root.rotation.y;
    this.fallDir = away;
    this.remains.visible = true;
  }

  respawn(): void {
    this.fall = -1;
    this.grow = 0;
    this.body.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.remains.visible = false;
  }

  update(dt: number): void {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 5);
      const s = Math.sin(this.shake * 30) * this.shake;
      this.body.rotation.z = s * 0.06;
      this.body.position.x = s * 0.05;
    }
    if (this.fall >= 0 && this.body.visible) {
      this.fall += dt;
      if (this.node.kind === 'wood') {
        // L'arbre bascule autour de sa base puis disparaît.
        const t = Math.min(1, this.fall / 0.9);
        const angle = (t * t * Math.PI) / 2;
        this.body.rotation.set(Math.cos(this.fallDir) * angle, 0, -Math.sin(this.fallDir) * angle);
        if (this.fall > 1.2) this.body.scale.setScalar(Math.max(0, 1 - (this.fall - 1.2) * 3));
      } else {
        this.body.scale.setScalar(Math.max(0, 1 - this.fall * 4));
      }
      if (this.body.scale.x <= 0) this.body.visible = false;
    }
    if (this.grow < 1) {
      this.grow = Math.min(1, this.grow + dt * 1.5);
      const t = this.grow;
      // Petit rebond à la repousse.
      this.body.scale.setScalar(
        t < 1 ? 1 - Math.pow(1 - t, 3) * 1 + Math.sin(t * Math.PI) * 0.15 : 1,
      );
    }
  }
}

/** Éclats de bois ou de pierre projetés à chaque coup. */
export class Chips {
  private readonly pool: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private readonly geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);

  constructor(private readonly parent: THREE.Object3D) {}

  burst(x: number, y: number, z: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      let p = this.pool.find((c) => c.life <= 0);
      if (!p) {
        p = { mesh: new THREE.Mesh(this.geometry, flat(color)), vel: new THREE.Vector3(), life: 0 };
        this.parent.add(p.mesh);
        this.pool.push(p);
      }
      p.mesh.material = flat(color);
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.vel.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
      p.life = 0.7 + Math.random() * 0.4;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.04) {
        p.mesh.position.y = 0.04;
        p.vel.multiplyScalar(0.4);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const p of this.pool) this.parent.remove(p.mesh);
  }
}

/** Hache ou pioche, à tenir dans la main droite. */
export function createTool(kind: 'wood' | 'stone'): THREE.Group {
  const tool = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 5), flat('#8a5a32'));
  handle.position.y = 0.25;
  tool.add(handle);
  if (kind === 'wood') {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.2), flat('#c9ced6'));
    head.position.set(0, 0.55, 0.09);
    tool.add(head);
  } else {
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), flat('#9ea6b0'));
    head.scale.set(0.4, 0.5, 3);
    head.position.set(0, 0.58, 0);
    tool.add(head);
  }
  return shadows(tool) as THREE.Group;
}
