# AGENTS.md — H5 Game Publisher

## Authority boundary (mandatory)
- This repository owns platform adapters, native containers, build/signing, CI and release metadata. PhotoGallery / other game repositories are independent, read-only inputs. Never write, commit, push, open a modification PR, reset, or clean files in a game checkout without separate explicit user authorization.
- Never change gameplay, combat, art, maps, progression, save schema or performance algorithms to make a release test pass. Report upstream game defects with exact source commit, repro and logs; game development agents own their fixes.
- Import selected runtime files byte-for-byte into games/ (ignored). The original checkout and raw import must remain unchanged. Only disposable .work/<id>/www receives runtime injection and explicitly approved adapters. No reverse sync, no game source vendoring.
- Configuration selects adapter explicitly (none by default); adapter/game mismatch, unknown adapter, or changed main.js Git blob must fail. Review source version, update compatibility metadata and adapter version as appropriate, then rerun tests. Do not weaken guards or silently accept arbitrary replacement.
- Keep platform-specific code in adapters/ and generic runtime in scripts/runtime.js. Do not add game-specific branches to publisher.mjs. Keep common adapter utilities separate.
- Keep source SHA, framework SHA, adapter version and file hashes in build-info.json. No signing secrets or source archives in public artifacts. Do not represent a dirty/unverified build as a reproducible release.
- CI uses contents: read; upstream checkout does not persist credentials. Source verification and baseline comparison are acceptance gates, not substitutes for permission restrictions on humans or other agents.

## Workflow
1. Record clean framework HEAD, game source commit, approved adapter blob and green baseline.
2. Add a failing regression where feasible, implement minimal fix, run npm test.
3. For behavior-preserving refactors compare actual runtime files against approved baseline. CI tests Chromium plus real APK install/launch/touch/Back/Home/storage/relaunch. No skipped failing checks or false claims about pending runs.
4. Never write to source checkout, sign with unknown keys, or publish production without separate authorization.
5. Report exact commit, job results, artifacts, exceptions and outstanding device/compatibility tests.
