# Apollo hatch model

The preview uses the Smithsonian's Project Egress Apollo 11 hatch model. The render-ready Blender source was created by **Andrew Barth**. The Smithsonian download page identifies the model as public domain.

- [Smithsonian object and downloads](https://3d.si.edu/object/3d/hatch-crew-apollo-11-cad-model:936d1822-b237-4431-bb3f-a1f9d39a2e90)
- [Original Blender package](https://3d-api.si.edu/content/document/3d_package:936d1822-b237-4431-bb3f-a1f9d39a2e90/resources/project_egress-blender_model.zip)

## Runtime files

`apollo-hatch.glb` contains 801 individually selectable component meshes and 784,877 triangles (18.5 MB). It uses standard binary glTF without compression extensions or external resources.

`metadata.json` maps component names to six explanatory groups and fifteen perimeter latch assemblies. Geometry retains the original assembled coordinates. Each mesh has its own local origin at its assembled bounding-box center; its node translation restores the original placement. Node extras contain `partId`, `sourceName`, `group`, and `subgroup`.

The glTF coordinate system is Y-up. The interior mechanism faces positive Z. Center and uniformly scale the complete model at runtime; avoid altering individual assembled positions before recording the rest pose.

## Adaptation

The conversion uses the visible assembly from `Hatch.blend` at source frame 571. Hidden library duplicates, floor, staging objects, lights, and cameras are excluded. Large meshes are decimated individually; small components remain detailed. Compact neutral PBR materials replace the source render materials and textures.

Source parent hierarchies identify the repeated latch assemblies. Each of the fifteen latch subgroups contains twenty colocated parts under a unique source assembly parent, verified against its assembled bounding box. These are spatial assemblies, not collections of repeated part types. Material names and spatial clusters organize the remaining components. A visual review also assigns the two central coated surround plates (`part_0185` and `part_0186`) to the window assembly alongside its two viewing-port meshes.

These group labels are for exploration and are **not a verified manufacturer bill of materials**. Exploded-view movement in the application is illustrative; it does not claim to reproduce the hatch's mechanical operation or disassembly procedure.

This template ships the prepared GLB, metadata and derived line data. The original one-off Blender conversion scripts and staging renders are not included. Use the linked source download to revise the geometry, then prepare a new package through the generic importer.
