# Workshop proof-project review

## GitHub template provenance

GitHub generated `kyle-annora/annora-explorer-bench-vise` from `kyle-annora/annora-explorer`. The repository API reports that template relationship. The generated initial commit is `dd22cdf3efa135efee1216f964675f9376b1bc0a`; template source commit is `889ded549867540fa45abe95e631acd0b1ea0cb4`.

This proof used a fresh clone of the generated GitHub repository. It did not reuse the earlier local onboarding copy. The reviewer followed the inherited English README, AGENTS, repository skill and referenced configuration/model/deployment guides.

## Project changes

Changed project configuration to `workshop-vise`, `WORKSHOP / MECHANISM LAB`, Ember, and one newly imported package at `content/models/my-vise`. Themes are disabled; quality, all rendering styles, explosion, authored operation and guided tour remain enabled.

The sample source was imported through the generic CLI. No files under `src/explorer/` changed. Generated catalog/configuration files were produced by the normal preparation command. The shared-runtime tree from the generated template is recorded in `onboarding-evidence.json`.

## Local verification

- `npm ci` succeeded with zero reported vulnerabilities.
- Generic import succeeded without warnings: 58 meshes, 12,174 triangles and 29 unique geometries.
- Source SHA-256 remains `40427624bc9844818508fa07bef612154d44ae92880f717c557caa81468fe623`.
- `npm run verify` passed package validation, **247 tests**, and the production build.
- The source model is 848,488 bytes; its prepared gzip is 141,781 bytes. The build contains one configured model package.
- Original source, license, definitions, tour and deterministic preparation report are included.

## Live review

Deployment and live browser review are pending. This record will be updated with the deployed commit, workflow run, desktop/mobile inspection, full guided-tour completion and separate-origin integration results.

## Limits

The model is an original MIT-licensed illustrative assembly. Its authored screw-to-jaw relation does not establish collision/contact, clamping force or manufacturability. The importer accepts prepared rigid, untextured GLB rather than arbitrary CAD.

The public integration boundary is a versioned iframe/JSON interface, not a same-document SDK or remote MCP service. No backend is included. Physical-phone and ordinary-laptop GPU/thermal performance qualification remains open; viewport inspection must not be presented as that hardware evidence.
