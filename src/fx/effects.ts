import * as THREE from 'three';

interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

const GRAVITY = -9;
const POOL_SIZE = 120;

/** Étincelles d'impact (pool réutilisé, aucune allocation en combat). */
export class Sparks {
  private readonly pool: Spark[] = [];
  private readonly group = new THREE.Group();
  private cursor = 0;

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group);
    const geometry = new THREE.TetrahedronGeometry(0.05, 0);
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  }

  burst(
    x: number,
    y: number,
    dir: number,
    count: number,
    color: THREE.ColorRepresentation,
    speed = 4,
  ): void {
    for (let i = 0; i < count; i++) {
      const spark = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_SIZE;
      spark.mesh.position.set(x, y, 0.1);
      spark.mesh.visible = true;
      (spark.mesh.material as THREE.MeshBasicMaterial).color.set(color);
      const angle = (Math.random() - 0.5) * Math.PI * 0.9;
      const s = speed * (0.5 + Math.random());
      spark.velocity.set(
        Math.cos(angle) * s * dir,
        Math.sin(angle) * s + 1,
        (Math.random() - 0.5) * s,
      );
      spark.maxLife = spark.life = 0.25 + Math.random() * 0.25;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
  }

  update(dt: number): void {
    for (const spark of this.pool) {
      if (!spark.mesh.visible) continue;
      spark.life -= dt;
      if (spark.life <= 0) {
        spark.mesh.visible = false;
        continue;
      }
      spark.velocity.y += GRAVITY * dt;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      spark.mesh.rotation.x += dt * 12;
      const k = spark.life / spark.maxLife;
      spark.mesh.scale.setScalar(0.5 + k);
      (spark.mesh.material as THREE.MeshBasicMaterial).opacity = k;
    }
  }
}

/** Tremblement de caméra qui s'amortit. */
export class ScreenShake {
  private intensity = 0;
  readonly offset = new THREE.Vector3();

  add(amount: number): void {
    this.intensity = Math.min(0.35, this.intensity + amount);
  }

  update(dt: number): void {
    this.intensity *= Math.exp(-10 * dt);
    if (this.intensity < 0.001) this.intensity = 0;
    this.offset.set(
      (Math.random() - 0.5) * this.intensity,
      (Math.random() - 0.5) * this.intensity,
      0,
    );
  }
}
