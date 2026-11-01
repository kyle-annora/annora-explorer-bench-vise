# Evaluation matrix

Run `npm run verify` for every release. Record browser/device evidence separately;
this document defines acceptance, not a claim that every possible device passed.

| Gate | Acceptance | Evidence |
| --- | --- | --- |
| CFG-01 | Brand, default model and model list come from configuration | Configuration tests; changed-brand preview |
| CFG-02 | Disabled features cannot be re-enabled by URL, host or tour | Policy/controller tests; narrowed-feature project |
| MOD-01 | A third model imports without changing runtime files | Generic importer, source hash and independent onboarding |
| MOD-02 | Input rejection is atomic and clear | Unsafe/malformed input tests; overwrite refusal |
| MOD-03 | Source, derived geometry, compression and license agree | `npm run check`; package report and hashes |
| VIS-01 | Engineering, linework and flat highlights preserve approved treatment | Same-camera desktop and mobile screenshots |
| NAV-01 | Selection, hierarchy, focus, isolate, separation and restoration are coherent | Runtime tests and browser interaction |
| ANI-01 | Authored motion remains tied to source time | Clip samples, pause/scrub/restore inspection |
| TOUR-01 | Camera/highlight/caption timing and takeover remain coherent | Tour tests; complete playback and manual takeover |
| API-01 | Capability discovery and rejected commands are truthful | Controller and policy tests |
| API-02 | Cancellation and rapid supersession cannot commit stale state | Controller/scene transition tests |
| API-03 | Bookmarks are JSON and exact-revision compatible | Capture/restore and mismatch tests |
| API-04 | Origin, source, protocol and session are enforced | Transport tests; separate-origin host review |
| LIFE-01 | Dispose and remount do not leak listeners or late work | Lifecycle tests; repeated host remount |
| MOB-01 | No horizontal overflow; touch controls and captions remain usable | At least 390×844 and compact landscape inspection |
| PERF-01 | Hidden tabs stop advancing; reduced motion and quality limits hold | Runtime tests; declared hardware/quality observations |
| DEP-01 | A fresh template repository builds and publishes under its own path | Clean checkout, workflow run and live URL |
| PUB-01 | Public artifact contains redistributable content and no customer files | Source allowlist, license review and built artifact scan |
| DOC-01 | A developer/agent can follow English instructions without undocumented setup | Independent onboarding report and fixes |

## Report performance honestly

Capture model/triangle/draw-call counts, compressed transfer sizes, chosen quality,
viewport, device/browser and observed responsiveness. Simulated narrow viewports
do not establish phone GPU performance. A fast workstation does not establish an
ordinary laptop baseline. Keep untested device coverage explicit and schedule it
before a production performance promise.

Apollo is intentionally heavy. The smaller crank and bench-vise samples exercise
lower-cost paths. Quality modes and lazy linework remain available; import limits
are safety guards rather than frame-rate guarantees.

## Release evidence

See `release-review.md` for the published template/proof repository, commits,
actual validation counts, browser review and remaining limitations. When using
this template for a new project, replace that report with your own evidence.
