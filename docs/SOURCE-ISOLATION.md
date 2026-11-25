# V0.2.2 — Source isolation and adapter architecture

Baseline: framework d05464e, CI 45577715385 (9/9 green), upstream PhotoGallery 5cc1493798b6007c303019003768474bf865c547.

## Contract
- upstream/docs/<game>: read-only source, original full file-tree SHA256 checked before/after import and after CI browser/native builds.
- games/<game>: selected H5 runtime bytes copied unchanged; metadata in sibling <game>.publisher-source.json, not packaged. Re-import prior V0.2.1 adapted exports into a fresh directory (do not overwrite them).
- .work/<game>/www: only location for platform modifications; allowed files index.html, __publisher/runtime.js and explicitly selected adapter's src/main.js. All other runtime bytes must match raw export. No gameplay changes.
- Adapter compatibility JSON records reviewed entry Git blob, version and allowed changed files. New entry revisions fail explicitly; inspect source and review adapter metadata before enabling. Windows checkouts with CRLF changes can fail the exact blob guard; use byte-preserving checkout (core.autocrlf=false).
- Direct web directory without sidecar may build; source commit is null rather than invented. Known adapters still require approved main.js bytes. Local Git commit does not authenticate a hand-edited sidecar; CI checks the actual upstream checkout. Manifest records source and staged digests, framework commit/dirty status and adapter hashes. This is a traceability mechanism, not a signed attestation.
- Existing Android adapter behavior is deliberately retained exactly. No rewrite of original games. Baseline comparison excludes only legacy generated publisher-source.json (now outside runtime); all other files must match byte-for-byte.
- Future games can use adapter none when generic runtime suffices; custom internal lifecycle integration may need an approved separate adapter. No assumption that arbitrary game will automatically pause.
- Guard rejects overlapping source/destination including symlinked parent paths; input and output are separate. CI read-only checkout and no persistent upstream credentials; code guards cannot prevent a privileged unrelated process from modifying files.

## Acceptance
Unit: pristine export, manifest mutation/add/remove, source/workspace overlap, exact staged change allowlist, provenance mismatch, adapter mismatch and unreviewed revisions.
CI: both real games baseline payload equality, original SHA256 and raw export verification after browser and APK/AAB stages, all existing nine jobs green. No relaxation of emulator assertions. Android API 34 AOSP / swangle baseline; real-device, API29/36, optional reload stress remain pending.
