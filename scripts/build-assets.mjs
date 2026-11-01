/**
 * Prépare les modèles pour le web : ne garde que les animations utilisées,
 * nettoie et compresse (meshopt).
 *
 * Source : Universal Animation Library [Standard] de Quaternius (CC0),
 * fichier Unreal-Godot/UAL1_Standard.glb copié dans assets-src/.
 *
 * Usage : node scripts/build-assets.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const SOURCE = 'assets-src/UAL1_Standard.glb';
const OUTPUT = 'public/assets/models/fighter.glb';

const KEEP = new Set([
  'Idle_Loop',
  'Walk_Loop',
  'Punch_Jab',
  'Punch_Cross',
  'Hit_Chest',
  'Hit_Head',
  'Death01',
  'Crouch_Idle_Loop',
  'Roll',
  'Dance_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
]);

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(SOURCE);
for (const anim of doc.getRoot().listAnimations()) {
  if (!KEEP.has(anim.getName())) anim.dispose();
}
const kept = doc.getRoot().listAnimations().map((a) => a.getName());
const missing = [...KEEP].filter((n) => !kept.includes(n));
if (missing.length) throw new Error(`Animations manquantes : ${missing.join(', ')}`);

await doc.transform(resample(), prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUTPUT, doc);
console.log(`${OUTPUT} : ${kept.length} animations`);
