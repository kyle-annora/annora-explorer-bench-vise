# Kinetic 01 — crank-slider asset

A published, openly licensed mechanism with an authored operating cycle. The original model contains a rotating crank, a connecting rod and a carriage that moves along two fixed rails. It provides a small, inspectable example of loading a complete assembly with saved movement into the Explorer.

This is a procedural visualization study, an independent illustrative mechanism or manufacturer CAD. The original study was produced with an AI agent and published by **Pradeep Kaushik**. It is not an asset invented for this integration and presented as a downloaded machine.

## Source and permission

- [Original project and mechanism](https://github.com/pr9868/scene-acceptance/tree/c361b9ad46f91ba960c708c2510aa204ad45605b/examples/astra-mechanical-assembly)
- [Author's article and interactive presentation](https://roughcut.dev/projects/astra-animated-mechanical-assembly/)
- [Original GLB](https://raw.githubusercontent.com/pr9868/scene-acceptance/c361b9ad46f91ba960c708c2510aa204ad45605b/examples/astra-mechanical-assembly/submission/output/crank_slider.glb)
- [Editable Blender source](https://github.com/pr9868/scene-acceptance/blob/c361b9ad46f91ba960c708c2510aa204ad45605b/examples/astra-mechanical-assembly/submission/output/crank_slider.blend)
- [Original build and verification notes](https://github.com/pr9868/scene-acceptance/blob/c361b9ad46f91ba960c708c2510aa204ad45605b/examples/astra-mechanical-assembly/submission/README.md)
- [MIT license](LICENSE), copyright 2026 Pradeep Kaushik. The example's README explicitly places project-authored material under the repository MIT license.

The pinned revision is `c361b9ad46f91ba960c708c2510aa204ad45605b`. `model.glb` is the byte-identical original `crank_slider.glb`; its SHA-256 is `5356cb1e7dcf85874c1f2152795b7011f43f01c2bfc899a5fa75a198687204ad`. The original `build_scene.py` is retained, unchanged, under `source/` for provenance and future authoring. It is not executed by the website or our preparation script. Consult the upstream instructions before deliberately rebuilding in a separate workspace.

Retain this credit and the MIT license with publication:

> Kinetic 01 by Pradeep Kaushik, MIT. Engineering presentation finishes, assembly navigation and technical edges adapted for Annora Explorer.

## Preserved asset

| Property | Value |
| --- | --- |
| Source nodes / mesh components | 114 / 107 |
| Triangles / source materials | 74,572 / 7 |
| Authored clip | `Animation`, four seconds |
| Animated transforms | `Crank_Rotation`, `Connecting_Rod_Pose`, `Slider_Translation` |
| Sampling | 241 samples at 60 Hz, including the loop endpoint |
| Crank radius / rod pin spacing / carriage stroke | 35 mm / 110 mm / 70 mm |
| Coordinate system | Metres, Y-up; carriage travel along X; motion in the XZ plane |
| GLB bytes / gzip transfer bytes | 2,574,332 / 595,025 |
| Technical-edge bytes / gzip transfer bytes | 211,320 / 53,084 |

The GLB keeps its original geometry, named hierarchy, pivots, materials and animation channels. Its single clip synchronizes four tracks across three moving transforms. Playback must evaluate that clip against the complete source hierarchy. Separately applying its tracks to flattened mesh components would lose inherited movement.

`metadata.json` contains source-node indices and paths, exact Three.js-resolved mesh names, original names, rest bounds, sampled full-cycle bounds and presentation groups. Each part's `cycleBounds` is a source-world envelope sampled at 961 poses (240 Hz) with 0.001 mm padding. Running close-ups can frame this envelope so a component stays visible across its stroke; paused inspection can frame its exact current geometry. These sampled boxes are presentation aids, not mathematical collision bounds. IDs refer to this pinned source revision; they are not a promise of CAD-stable IDs across future revisions. The five navigation groups are crank, rod, carriage, guide and frame. The first three follow the source's animated parents; guide and frame are editorial groupings of named fixed components. They do not replace the source hierarchy.

`finishFamily` selects the Explorer's approved engineering finishes. For example, the broad structure becomes structural satin, linkage remains silver, the carriage uses the warm coated finish and bearing seats use bronze. These are presentation choices, not independently verified material properties. Original materials remain present in the GLB.

Per-part `explode` vectors are original presentation offsets in source metres, authored for the root assembly. They are not part of the source operating animation, a disassembly order or a collision-checked procedure. The runtime must keep operation and exploded inspection separate.

## Technical edges and integration

`edges.bin` contains Float32 little-endian line-segment positions in mesh-local coordinates at a 25-degree crease threshold. `edge-metadata.json` uses the existing `meshes[loadedMeshName]` contract: `byteOffset`, `vertexCount`, `segmentCount`, and `geometryId`. Its 46 shared geometry ranges contain 8,805 unique segments and cover all 107 meshes, referencing 19,253 crease segments in total. Shared arrays must not be mutated. Apply each source mesh's sampled world matrix followed by the common normalization, exactly as for the solid geometry.

The source uses three-segment bevels with normal changes of about 30 degrees. A 25-degree threshold retains their cap and body boundaries so the mechanism remains readable in technical mode. Coplanar triangle seams and the small facets of smoothly rounded cylinders remain excluded. This is not a silhouette generator; selected-object contours remain the renderer's responsibility. Apollo retains its separate 35-degree threshold.

Suggested first view: `[0.55, 1.2, 1.35]`, looking down obliquely onto the operating plane. `metadata.operation.stages` uses normalized `at` values (0, 0.25, 0.5, 0.75) and also supplies explicit seconds (0, 1, 2, 3). Each phase describes the saved animation without claiming dynamic simulation.

## Reproduce and verify

From the template repository root:

```sh
node scripts/verify-kinetic.mjs
node --test tests/runtime/kinetic-asset.test.js
```

Preparation checks the pinned model hash, derives metadata and edges, and creates deterministic gzip copies. It never rewrites the source GLB. Verification checks exact source bytes and notices, all component names and memberships, source animation tracks and loop endpoints, original local crease positions and decompression parity.

The loaded Three.js animation is independently sampled at **961 frames and subframes** over the full cycle. Checks cover the fixed crank center, 35 mm radius, 110 mm rod pin spacing, fixed guide, 70 mm stroke, rod endpoints and analytic path. The observed maximum rod/pin separation was **0.00301 mm**; maximum analytic path deviation was **0.00396 mm**. The acceptance bound is 0.01 mm, accounting for the source's sampled linear animation. These are numerical readback checks of the delivered animation. They do not verify forces, friction, real-world tolerances, collision clearance, fabrication or physical safety.

These asset checks do not establish browser frame rate, phone performance or the final Explorer interaction quality. The host application must separately review those concerns.
