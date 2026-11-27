# Open-source reuse evaluation — stop expanding bespoke CSS renderer

Goal: retain frozen V46.1 (cdb508594cc610733f248ec5d4123a3b9d954981) game logic, Canvas and original HTML/CSS, use established platform adapters and renderers rather than implement a browser. No upstream game write. Existing self-written renderer remains a regression baseline; official wechatide skill gate stays separate.

## Candidate verification (2026-11-27)
- WeChat team Layout: https://github.com/wechat-miniprogram/minigame-canvas-engine pinned 60b211edc981c7e471eb064652e4df6af50aba39, package 1.0.28, MIT. XML + style objects, not browser DOM/CSS. It provides Canvas rendering, Flex, text, scroll containers, dynamic nodes and event routing, but no documented CSS Grid, general pseudo-elements or CSS gradients; ordinary text letter-spacing is also not a general capability.
- WeChat team float-pigment: https://github.com/wechat-miniprogram/float-pigment pinned 830c70afdc0ee092e74ad928dc9c6e05844ef62a, workspace 0.10.5, MIT. Its layout core supports block/flex/grid/relative/absolute and is designed as a low-level GUI dependency. The layout crate is not a browser and does not paint. The framework now owns only a thin stable WASM ABI; layout algorithms remain upstream.
- Tencent kbone / wechat-miniprogram h5-to-miniprogram: useful DOM/BOM adaptation references for **Mini Program** pages, not direct Mini Game renderers. h5-to-miniprogram is archived and explicitly points users to kbone. Their WXML/WXSS render path cannot be treated as a Mini Game Canvas browser.
- weapp-adapter and engine-specific adapters bridge Canvas/BOM/limited DOM for Canvas/WebGL engines; they do not render arbitrary HTML/CSS.
- Yoga / Taffy are layout-only. Satori is a static image/SVG renderer. html2canvas/rasterizeHTML require browser capabilities. None is a complete arbitrary-H5 Mini Game solution.
- Frozen source audit: original HTML/CSS live menus/settings use Flex/Grid, pseudo-elements, gradients, scroll/forms and dynamic DOM. Save slots are generated at runtime into #save-slots-grid, so a Canvas-only adapter is insufficient.

## Layout executable result — run 45927200860
The pinned 1.0.28 package executed and its real event route worked in the browser Canvas diagnostic, but this is **not visual parity** and not WeChat evidence. Desktop maximum geometry delta was 12.8 px; mobile was 7 px. Both scenarios explicitly omitted linear-gradient, ::before and letter-spacing. Screenshots show the vendor result as a flat text list instead of the original layered dark title menu. The runtime property Layout.version reports 1.0.16 because upstream hard-codes that compatibility value separately from npm package version 1.0.28; it is not evidence that an old package was checked out.

Decision: Layout remains useful as a component renderer/reference, but it is rejected as the sole generic H5 UI renderer for this framework. Do not grow a large source-to-Layout CSS compatibility engine to compensate for these gaps.

## 0.5.2c float-pigment host WASM result — run 45928703245
Commit f8c610774ff824b27fec3054588831328011d869 passed the dedicated renderer-candidate workflow. Artifact 15167259242 (`wechat-upstream-renderer-evaluation-NOT-RELEASE`) has digest `sha256:6037083a0b5cc059ad8566c4ea2a4759d73a3b527bfc15ccbabbaa693cbf425c`.

The pinned float-pigment source compiled with Rust 1.92.0 to an import-free wasm32 module. Probe size was 245,205 bytes. The three-column Grid probe used width 300 and column gap 9; expected second-column x was 103 and actual x was 103 (delta 0). Frozen game source integrity passed. Decision is `host-wasm-proven-wx-pending`; official DevTools and WXWebAssembly were not run, so release/parity remain false.

The same commit's generic Framework checks had hosted Android-emulator infrastructure failures before app exercise: Launcher ANR / stable-home timeout. The diff contains only WeChat vendor-evaluation files, while unit tests, real-game staging and all Android smoke packaging jobs passed. Retrying reproduced system/launcher boot failure. This is recorded as an indepent CI infrastructure blocker; the emulator ANR acceptance rule is not weakened.

## 0.5.2d reusable layout backend
The one-off `3 x 1fr` Rust probe is replaced by a reusable bridge and runtime contract:
- `float-pigment-bridge.rs`: stable ABI v1 for node lifetime/tree operations, block/flex/grid display, width/height, row/column gap, flex alignment, generic Grid track lists, layout execution and geometry queries.
- `float-pigment-build.mjs`: verifies the exact upstream commit/version/license and builds the ABI from source with the pinned Rust toolchain. No forked layout algorithm is copied into this repository.
- `float-pigment-runtime.cjs`: dual loader. In Mini Game, `WXWebAssembly` is authoritative and accepts only a package `.wasm`/`.wasm.br` path; failure is surfaced and never silently falls back to standard WebAssembly. Standard WebAssembly exists only for host tests.
- `wx-wasm-fixture.mjs`: produces a standalone `compileType: game` project containing the exact WASM, MIT license, runtime and a deterministic Grid calculation. The expected global is `__H5PUBLISHER_FLOAT_PIGMENT_WX__` with `phase: "pass"`. This project is intended for the next real WeChat DevTools/wechatide gate and is explicitly NOT a release game.

Passing host CI for this stage means the generic ABI still reproduces the Grid calculation and an importable WeChat fixture was generated. It does **not** count as WXWebAssembly evidence until the fixture actually runs in compatible interactive WeChat DevTools.

## Current architecture direction
Use layers instead of pretending one adapter is a browser:
1. Preserve/extend browser semantics only for APIs actually used by imported games (DOM tree, class/style mutation, events, storage, timers, media/platform shims).
2. Use float-pigment as the preferred block/flex/grid geometry backend after host-WASM and WXWebAssembly gates; do not implement another independent Grid/Flex engine.
3. Reuse established Canvas UI primitives where they fit painting/events, but keep unsupported visual CSS explicit. Painting and text shaping need their own candidate evaluation; do not silently approximate.
4. Keep official WeChat DevTools / wechatide evidence as the release gate. Host Chromium, Node WebAssembly, mocks or CLI handshakes never count as final Mini Game evidence.

The original game repository remains read-only throughout all experiments.
