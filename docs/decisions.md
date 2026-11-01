# Confirmed design and architecture decisions

These decisions describe the approved baseline. Change them explicitly, with
visual and functional evidence, rather than gradually drifting across projects.

| ID | Decision | Consequence |
| --- | --- | --- |
| D-01 | Oxide informs compact floating controls and mechanical exploration | The model remains dominant; controls stay out of its focal region |
| D-02 | Atlas informs crisp, occlusion-aware linework | No lit solid shading in pure linework; no generic triangle wireframe |
| D-03 | Engineering is the default treatment | Components use curated finish families and controlled contrast |
| D-04 | Flat Ember is available alongside pure linework | Selection communicates component identity without bloom or blur |
| D-05 | Ember remains the default accent; brand accent is configurable | Color is a project setting, not a client-specific renderer fork |
| D-06 | Hierarchy represents assembly relationships | Stable semantic IDs support tree, breadcrumbs, selection and focus |
| D-07 | Explosion is explanatory, not physical disassembly | Author offsets; restore exact source rest poses |
| D-08 | Operation uses real authored source clips | Never infer engineering motion or claim physical validity from geometry |
| D-09 | One player coordinates camera, highlight and captions | Pause, seek, chapter access, reduced motion and manual takeover remain available |
| D-10 | Guides use short English text and no default narration | Captions remain concise; the mechanism carries the explanation |
| D-11 | One render loop owns scene and animation time | Hidden-page handling, transition interruption and cleanup remain coherent |
| D-12 | Desktop and mobile share capabilities, with compact disclosure | No hover-only requirement; controls must remain reachable on small screens |
| D-13 | Performance is part of content acceptance | Lazy line data, bounded pixel density and adaptive quality precede new effects |
| D-14 | Public control is JSON and revision-scoped | Hosts do not mutate Three.js objects or embedded DOM |
| D-15 | Reuse is configuration plus prepared packages | A new model must work without adding runtime ID switches |
| D-16 | Customer content stays outside the public starter | Source history, assets and documentation are explicitly allowlisted |

## Skill structure

The repository skill is `.agents/skills/explorer-project/SKILL.md`. It routes an
agent to the task, current contracts and verification commands; it does not
replace those documents with duplicate instructions. It carries no publishing
permission of its own. Additional animation/design skills may help a contributor,
but installing them is not required to build or deploy this template.

Separate content changes from runtime changes. Keep a short record of the
trigger, chosen behavior, affected boundary and evaluation evidence in a PR or
release note. A visible regression should block publication even when static
validation passes.
