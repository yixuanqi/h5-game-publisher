# V0.5.4a — UI layout engine feasibility / native WASM gate (not release)

## Scope and baseline
- Framework main observed: `391b977aa7f35b8e24205903a622366a616a4e0f`.
- Canvas experimental branch observed: `8990651049df1fb09c4b50f88a9b0ffad4768d15`. V0.5.3b native touch gameplay acceptance remains open.
- Existing frozen Ashen Bell Vow 46.1: `cdb508594cc610733f248ec5d4123a3b9d954981` (PhotoGallery).
- Existing Taffy candidate: 0.16.0, `497de49c200daee81a18ce627bec98d5340ae57a`. Reuse existing `taffy-title-grid-spike.mjs` and Rust probe; do not implement Grid algorithms in JS. Float-pigment remains baseline for its measured subset. Taffy is not yet selected for shipping.
- This patch only adds a host/native diagnostic gate and fixture generator. It does not alter game files, existing rendering, workflows, or release paths.

## Local test and native validation
1. Apply additive patch on a clean framework checkout. Run `node --test tests/wechat-taffy-wx-gate.test.mjs` (Node 22). Existing `npm test` discovers this file automatically.
2. With the pinned upstream game and Taffy checkouts, Rust 1.92.0 + wasm32-unknown-unknown and existing pinned Playwright dependency installed, run the existing `node platforms/wechat/vendor-eval/taffy-title-grid-spike.mjs upstream vendor-taffy` on a local authorized machine (no CI required). Retain its original Chromium evidence, source integrity and WASM digest. Require `mobile-title-grid-parity-proven` before using the output. The fixture generator does not independently establish the WASM's provenance: use the exact same artifact/digest from that spike.
3. Generate the standalone project from that same compiled probe (output parent must exist; destination must not exist):

```sh
node platforms/wechat/vendor-eval/taffy-wx-fixture.mjs .work/wechat-taffy-052g/probe/target/wasm32-unknown-unknown/release/h5publisher_taffy_probe.wasm vendor-taffy/LICENSE .work/taffy-wx-054a
```

4. Import `.work/taffy-wx-054a` into official WeChat DevTools with permitted AppID if required. Verify `__H5PUBLISHER_TAFFY_WX__.phase === 'pass'`, `runtime === 'wx'`, two scenario records, and same fixture WASM SHA-256 as host report. Capture log and screenshot. Do not count a Node test double as native evidence. Repeat on phone before promoting native runtime. Neither this fixture nor a successful Grid probe establishes whole-game UI parity or a production release.

## Gates
Two synthetic viewports exercise `minmax(0, 1.04fr) minmax(248px, 0.96fr)`: 800px (fractional) and 400px (minimum binds), 12px gap. Exact expected track sizes and coordinates, maximum 0.5 logical px. Native errors, missing exports, non-finite results and mismatches fail closed; no standard WebAssembly fallback. MIT license and binary digest are recorded. No test changes the game or weakens the existing real-title Chromium threshold.

## Next work after verified native gate
- Design generic Taffy node lifecycle, style input and geometry ABI (not the one-off probe API); verify source CSS capability matrix one feature at a time, including Grid placements, auto-repeat, intrinsic text, percentage/calc, aspect ratio/order and Flex.
- Reuse the existing source CSS plan and DOM layer; route geometry behind explicit backend selection. No hardcoded game selectors or invented fallback coordinates in the shipping adapter.
- V0.5.4b: original title / save slots / settings rendering with Chromium geometry and screenshot comparisons; V0.5.4c: mutations and HUD; V0.5.4d: real hit tests and native touch. Preserve source SHA/hash and independent V0.5.3c gameplay gate.

## Local delivery status
Node 22.16.0: 11/11 isolated tests pass (including a synthetic WASM binary and simulated WX host for fixture packaging; not Taffy). Existing full framework suite, actual Taffy Rust/WASM build, original Chromium title, official WX and device tests are not run in this environment. Network checkout and Rust toolchain unavailable. No commits, CI dispatches or game changes.
