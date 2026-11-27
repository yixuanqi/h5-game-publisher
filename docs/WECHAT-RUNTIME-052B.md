# V0.5.2b — first real 2D capability slice (not release)

V0.5.2a accepted at fd7b20b4a96148beaef47467b51e2e6db79400af, run 45907239237 job 140206797764, artifact 15158208316. Raw job report: 67 modules, 90 syntactic API candidates, desktop/mobile baseline pass (boot 611/581 ms, headless p95 frame intervals 116.7/216.6 ms, not device performance). Source integrity pass. Bare context failed document is not defined; linkedom parsed title/querySelector but had 0x0 layout, no computed style, no Canvas 2D, storage or audio. First exact error: TypeError: Cannot read properties of null (reading 'createRadialGradient'). Official environment and gameplay parity not run.

## 052b.1 Canvas bridge
Independent original main graph, no source transforms or extracted gameplay. Real DOM candidate nodes get backend-neutral Canvas 2D adapter with independent surface per node, stable context identity, native property/method forwarding, positive bounded bitmap dimensions, resize, cross-canvas drawImage/createPattern. Unsupported context types return null; missing native support errors. Tests reproduce absent context, assert adapter contract, then use actual Skia native raster for gradients, drawImage, pattern, pixel readback and resize reset. Same frozen original entry is evaluated with no bridge (must reproduce exact Red) then with bridge (must reach actual radial gradient and clear exact blocker). The next error is retained rather than papered over. This is synchronous module-init diagnostic only. No fake DOM geometry, audio, storage or game boot markers. No original source writes, no package upload. CI artifacts contain only evidence and raster control, not source or game project.

Current bridge intentionally covers only existing document canvas nodes and createElement/createElementNS, positive integer dimensions up to 16384, 2D context. Canvas created via arbitrary innerHTML, zero-size semantics, all HTML attribute edge cases, context option parity, native wx behavior, image loading and performance remain unverified. Node native raster and linkedom are test-only dependencies, not proposed wx production dependencies. No claim of full DOM/CSS renderer, official DevTools, original HTML inline script boot, or playable game.

Next: review actual first error and counts. Add bounded contract slices with Red/Green against source. In parallel assess real CSS layout/render/hit-test coverage against frozen menu/settings/slots; no fabricated rectangles, no game-specific reimplementation. Do not advance to 052c until agreed 052b contracts and UI feasibility have evidence. Official DevTools authorization remains independently blocked. Existing diagnostic adapters remain untouched. Android smoke failures independent.


## 052b.2 original-entry blocker chain and upstream geometry decision — 2026-11-27

The diagnostic now executes the frozen 67-module original `src/main.js` graph rather than the hand-written `ui.cjs` preview. Each slice preserves the previous Red and adds only the smallest platform capability required to expose the next blocker. The game repository remains unchanged.

Observed sequence:
- no Canvas bridge: `createRadialGradient` on a missing 2D context;
- Canvas bridge: `navigator is not defined`;
- bounded navigator bridge: asynchronous `setTimeout is not defined`;
- host timers in the diagnostic: `fetch is not defined`;
- production packaged-JSON `createLocalFetch`: `performance is not defined`;
- WeChat performance bridge (native microseconds normalized to Web milliseconds): `requestAnimationFrame is not defined`;
- frame scheduler is now isolated in `platforms/wechat/runtime/frame-scheduler.mjs` and queues exactly one frame in the diagnostic. It remains pending full-entry CI execution and real WeChat DevTools verification.

The navigator bridge deliberately does not advertise ServiceWorker, clipboard, gamepad or vibration support. The source already feature-detects these optional paths, so absence is preferable to fake implementations. The packaged fetch reuses the production bootstrap adapter and accepts only packaged `data/**/*.json`.

### Geometry backend evidence
The self-developed Flex/Grid route is no longer the preferred geometry implementation. Pinned float-pigment 0.10.5 has passed:
- real dynamic save-slot Grid: max delta 0.009765625 px desktop/mobile-landscape;
- real settings Flex row: 0 px position delta;
- real title topbar and slot header Flex: 0 px delta when reference child intrinsic sizes are supplied.

Independent text intrinsic measurement was then introduced so the layout path no longer depends on browser child rectangles. The first independent run showed text leaf widths/heights already within roughly 0–1.06 px; the large 364–702 px failures came only from passing viewport height as a required root height. Commit `f6a61465d10b5a7e97ecc31d0efb3d7fbed125dc` changes only the thin WASM ABI so available width/height may be `+Infinity`, matching upstream `NodeCalculateLayout` unconstrained-size semantics. `NaN` and `-Infinity` remain rejected.

### Current verification state
GitHub Actions stopped starting jobs after the above changes: affected runs finish in roughly 2–4 seconds with zero job steps, including reruns. These are recorded as infrastructure/no-execution results, not code-test failures. The current JavaScript bridge modules were additionally executed in the session's Node 22 runtime: performance unit normalization, frame callback timestamp normalization, and float-pigment `height:+Infinity` forwarding all passed; this local evidence does not replace Rust/WASM, Chromium, or official WeChat CI.

Do not mark 052b release-ready from these results. Still required: a successful independent-intrinsic float-pigment run, one-frame original-entry report after the rAF slice, full DOM/CSS paint/event integration, and official DevTools / Android / iOS evidence.
