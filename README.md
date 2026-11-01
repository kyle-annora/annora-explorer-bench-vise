# Workshop · Bench vise Explorer

A new branded project created from the [Annora Explorer template](https://github.com/kyle-annora/annora-explorer), using its documented model importer and configuration. No shared renderer, controller or player changes were needed.

**[Open the Explorer](https://kyle-annora.github.io/annora-explorer-bench-vise/)** · **[Open the integration example](https://kyle-annora.github.io/annora-explorer-bench-vise/examples/embed/)** · **[Create your own project](https://github.com/new?template_name=annora-explorer&template_owner=kyle-annora)**

The original bench-vise study has 58 components in six groups. Explore its assembly hierarchy, separate and restore parts, switch between Engineering, Linework and flat Ember, or follow its 60-second guided explanation. The authored 5.5-second operating clip shows the screw, handle and jaw moving together.

![Bench vise in the shared Explorer](docs/images/bench-vise.png)

## What this project demonstrates

- `WORKSHOP / MECHANISM LAB` branding and Ember accent come from `project.config.json`.
- Only the newly imported `bench-vise` package is included in the application build.
- Theme switching is disabled; quality selection, all three rendering styles, explosion, operation and tours remain enabled.
- Another website can use the same Explorer through its iframe and JSON controller.

This is a static demonstration with original, MIT-licensed presentation geometry. Its motion is illustrative authored kinematics, not a force/contact simulation or manufacturer CAD. There is no backend, account system or customer data.

## Run locally

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:8095/`. Run `npm run verify` before publishing. The GitHub Actions workflow validates, tests and builds the site, then deploys `dist/` to GitHub Pages.

## Reproduce the model import

Starting with a fresh template repository, run:

```sh
npm run import:model -- --source examples/bench-vise/model.glb --definition examples/bench-vise/import-definition.json --out content/models/my-vise
```

This repository already contains that imported package. To repeat the command here, choose a new empty output directory; the importer refuses overwrite. Register its manifest in `project.config.json` and keep the model ID `bench-vise` distinct from the output folder name.

## Handoff

- [Release review](docs/release-review.md) and [recorded onboarding evidence](docs/onboarding-evidence.json)
- [Configuration](docs/configuration.md), [model preparation](docs/models.md), and [original source model](examples/bench-vise/)
- [Integration](docs/integration.md), [JSON API](docs/api.md), and [deployment](docs/deployment.md)
- [Decisions](docs/decisions.md), [architecture](docs/architecture.md), [evaluation](docs/evaluation.md), and [licenses](THIRD_PARTY_NOTICES.md)

The inherited Apollo and Kinetic files remain regression fixtures in source. They are not registered or included in this application's model bundle.
