# Original bench-vise example

This is a new Annora-authored model for the Explorer template. It uses no Apollo or Kinetic geometry, downloaded CAD, textures, or manufacturer branding. Geometry, the animation clip, presentation metadata and the English tour are MIT-licensed under Copyright (c) 2026 Annora. The generator uses the project's pinned Three.js dependency; Blender and external executables are unnecessary.

The model has 58 named rigid meshes, 12,174 triangles and six curated groups: base, fixed jaw, moving jaw, lead screw, handle and guideways. Beveled cast bodies, replaceable dark steel jaw plates, bright guideways, a continuous helical thread, bronze bearing inserts and a rotating tommy bar distinguish the assembly's roles. Finishes are illustrative.

## Reproduce and import

Run from the repository root after installing its dependencies:

```sh
node examples/bench-vise/generate.mjs
npm run import:model -- --source examples/bench-vise/model.glb --definition examples/bench-vise/import-definition.json --out content/models/bench-vise
```

The generator writes `model.glb`, `import-definition.json`, `authored-tour.json` and `source-metrics.json` in this example folder. The importer prepares an independent package through the same generic path used for another supported rigid assembly. It must not add vise branches to the renderer or controller. Register the resulting package through the template configuration as described in the main README.

`model.glb` contains the original rigid transform hierarchy and one `ViseOpenClose` animation. `import-definition.json` maps exact mesh names to stable semantic IDs, groups, finish families and curated separation vectors. `authored-tour.json` defines a 60-second explanation, including structural separation, a fixed-nut close-up, a coached operating pass and an uninterrupted pass. Separation offsets describe assembly relationships, not a physical disassembly sequence.

## What the motion means

The 5.5-second source clip starts open, closes, pauses, reverses and returns to its original pose. A translating carriage carries the moving jaw, spindle and handle. The spindle rotates within that carriage; the nut, base, fixed jaw and guideways remain fixed.

The authored relation is `travel = lead × angle / (2π)`: 48 mm of linear travel accompanies four spindle turns at an illustrative 12 mm lead. The visible helix uses the same lead. The clip includes two tracks, each with 331 keys: carriage translation and spindle quaternion rotation. The handle inherits the spindle transform rather than running a separate animation.

This is illustrative authored kinematics, not manufacturer CAD, a joint solver, collision/contact analysis, a clamping-force simulation or manufacturing guidance. Dimensions describe this generated study only. The moving jaw deliberately stops with an open gap; no workpiece contact or applied force is simulated. Curated navigation groups may span source transform branches: the stationary nut and rotating screw form one explanatory drive group.

## Recorded source checks

The generator removes degenerate extrusion faces, then exports and reloads the GLB before writing it. It checks unique mesh identities, finite positions, strictly positive triangle areas, clip validity and the screw/travel relation over 661 samples, including between stored keys.

| Check | Recorded result |
| --- | --- |
| Rigid meshes / curated groups | 58 / 6 |
| Triangles | 12,174 |
| Smallest source triangle area | 1.98 × 10⁻⁸ m²; no zero-area triangles |
| Source GLB | 848,488 bytes |
| GLB SHA-256 | `40427624bc9844818508fa07bef612154d44ae92880f717c557caa81468fe623` |
| Clip / duration | `ViseOpenClose` / 5.5 seconds |
| Maximum sampled travel deviation from the authored easing function | 0.00000248 m (keyframe interpolation) |
| Maximum normalized quaternion dot error against the sampled lead relation | 1.13 × 10⁻¹³ |
| Deterministic regeneration | Two consecutive runs produced identical GLB hashes. |

`source-metrics.json` carries machine-readable values from the latest regeneration. These checks establish source consistency only. The generic importer must also verify its generated line caches and metadata; actual Explorer appearance, mobile layout and target-device performance require separate review.
