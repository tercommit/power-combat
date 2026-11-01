import * as THREE from 'three';

/** Matériau low poly : facettes visibles, pas de texture. */
function flat(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
}

function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#2b1b4a') },
      horizon: { value: new THREE.Color('#ff9a5a') },
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
        gl_FragColor = vec4(mix(horizon, top, smoothstep(-0.05, 0.45, vHeight)), 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(150, 16, 12), material);
}

function createArena(): THREE.Group {
  const arena = new THREE.Group();

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.6, 0.6, 10), flat('#a0673c'));
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  arena.add(floor);

  const hill = new THREE.Mesh(new THREE.CylinderGeometry(14, 22, 4, 9), flat('#4f6b3a'));
  hill.position.set(0, -2.6, -4);
  hill.receiveShadow = true;
  arena.add(hill);

  // Piliers façon torii au fond du dojo.
  const wood = flat('#8c2f2f');
  for (const x of [-7.5, 7.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 4.2, 6), wood);
    post.position.set(x, 2.1, -5);
    post.castShadow = true;
    arena.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.4, 0.5), wood);
  beam.position.set(0, 4.3, -5);
  beam.castShadow = true;
  arena.add(beam);

  // Montagnes en arrière-plan.
  const mountainColors = ['#5b3f6e', '#6d4a78', '#4a3460'];
  for (let i = 0; i < 9; i++) {
    const h = 10 + ((i * 7) % 5) * 3;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(8 + (i % 3) * 3, h, 5),
      flat(mountainColors[i % 3]),
    );
    mountain.position.set(-48 + i * 12, h / 2 - 4, -45 - (i % 2) * 12);
    mountain.rotation.y = i;
    arena.add(mountain);
  }

  // Quelques arbres.
  for (const [x, z] of [
    [-11, -7],
    [12, -8],
    [-14, -11],
    [15, -12],
  ]) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 5), flat('#5a3b24'));
    trunk.position.y = 0.7;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), flat('#d9688a'));
    crown.position.y = 2.1;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    tree.traverse((o) => (o.castShadow = true));
    arena.add(tree);
  }

  return arena;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c9786a', 40, 110);
  scene.add(createSky(), createArena());

  scene.add(new THREE.HemisphereLight('#ffd2b0', '#3a2a4a', 1.1));

  const sun = new THREE.DirectionalLight('#ffb070', 2.4);
  sun.position.set(-8, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -4, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Lumière de contour pour détacher les silhouettes du fond.
  const rim = new THREE.DirectionalLight('#9fb8ff', 1.2);
  rim.position.set(4, 4, -8);
  scene.add(rim);

  return scene;
}
