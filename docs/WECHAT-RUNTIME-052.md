# V0.5.2a — full H5 entry compatibility study

Freeze Ashen Bell V46.1 at PhotoGallery cdb508594cc610733f248ec5d4123a3b9d954981 and verify the approved main blob. Keep existing bootstrap/render/UI/play/progress/official-tool paths as diagnostic regression baselines. No game repository writes. No changes to game code, UI, rules, save schema or artifacts. This is an audit, not a new runnable WeChat project.

## Independent CI-A/B discovery gate
- Export the approved game byte-for-byte; record SHA, compare original and raw snapshots in finally.
- Bundle full original main.js graph with esbuild without game-specific transforms; use AST observations (not exact free-global analysis) to inventory APIs and inline scripts.
- Real Chromium desktop and mobile baseline: title, settings, slots, gameplay with original UI and real input. Record CSS properties/rules, canvas sizes, visible IDs, storage key names, startup time, headless frame intervals, logs and screenshots; block external network. Service workers disabled by design, not a PWA gate.
- Bare JS negative control and linkedom candidate: actual HTML parsed, real API probes for DOM lookup, CSS geometry, canvas, storage, audio; attempt original main graph, preserve first error. This is not actual WeChat execution, a full HTML bootstrap or a security sandbox. No successful runtime claim even if sync evaluation returns. Third-party DOM candidate is not adopted as production dependency.
- Artifacts are reports/screenshots only; no original source archive, no bundle, no release ZIP.

## Architecture decision and candidate comparison
- Tencent weapp-adapter: wx canvas/image and browser-like API bridges; not a DOM/CSS layout engine. Documentation https://developer.cloud.tencent.com/article/1547589 ; review license and pin exact version before use.
- linkedom 0.18.12: experiment in CI, DOM tree/parser candidate only. Compare its measured geometry and Canvas support against real Chromium. No production adoption until compatibility, dependency licensing and wx bundle size are verified.
- Existing native bridges: retain Canvas, storage, input, file and audio work where behavior matches original contracts. Do not copy legacy UI or extracted gameplay into the full-entry path.
- Full browser engine is out of scope. DOM/CSS renderer feasibility is a decision gate: if an existing implementation does not support the measured CSS features, estimate a bounded renderer spike on real title/settings/slots, rather than invent a full browser or silently simplify UI. No claim of arbitrary H5 compatibility.
- Independent official runtime gate remains blocked pending normal IDE service authorization; no repeated temporary-runner experiments or bypass. Audit and baseline may continue without treating any result as official device evidence.

## Red/Green/Refactor
Unit tests cover static member chains, dynamic access, nested references and count retention; run before the real audit. Bare runtime is the intentional negative control; capture candidate missing capabilities. In CI, actual H5 baseline must pass, source integrity must pass, and audit evidence must be present; a blocked candidate is a valid audit finding, not a compatibility pass. If baseline fails, fix the test harness against genuine original behavior, or report upstream defect. Never fabricate boot markers, screenshots or game state.

## Next gate V0.5.2b
Review actual audit JSON and screenshots. Prioritize first observed entry failures and layout feasibility, define explicit API contracts and test with both synthetic fixtures and the full source. Test actual HTML script order, event semantics, real Canvas, CSS layout and hit testing, touch, file/storage/lifecycle. Preserve original main entry and behavior. Do not proceed to V0.5.3 without demonstrated menu/settings/slot feasibility. Official DevTools, physical Android/iOS and all gameplay parity remain separate mandatory release gates.
