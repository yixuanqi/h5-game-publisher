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


## Evidence-backed route decision — V0.5.2d

The open-source geometry evaluation is now strong enough to stop treating float-pigment as a speculative candidate. It is approved for **runtime geometry integration behind explicit capability gates**, not for release readiness.

Verified against the frozen Ashen Bell Vow V46.1 source without modifying it:

- Host WASM/runtime backend: run 45930652844, commit `9a533150268936439855bcf1f83fd67917ed57f9`, success. The pinned float-pigment 0.10.5 / `830c70afdc0ee092e74ad928dc9c6e05844ef62a` source builds to a 248,936-byte import-free WASM. Synthetic three-column Grid returns x=103 exactly. Source integrity passed; official DevTools remained not-run.
- Real dynamic save-slot Grid: run 45931056094, commit `27dd7e7af5f051fcc7f8594598202f3aa8551fd1`, success, artifact 15168587753. Desktop and mobile-landscape both compare the original runtime-generated `#save-slots-grid` against float-pigment. Maximum geometry delta is **0.009765625 px** under a 1 px gate.
- Real settings Flex row: run 45931493280, commit `b9eb94474feb1f0d22a5f7bc1e50402a78c81a55`, success, artifact 15168868434, artifact SHA-256 `65f5284d3f046d63ddbcd4fd5ea215e05de02358c6e40b941c23aae90e1f04f4`. The first live `.settings-row` uses authored `space-between + center + gap`; desktop and mobile-landscape both have **0 px** position delta when browser-measured child intrinsic sizes are supplied to the upstream layout engine.
- Real title Flex parents: run 45931583520, commit `397f5d1c3c57a08c31789ff495e820c9b4cc909c`, success, artifact 15168588841, artifact SHA-256 `2a59c0ffff0fd2ff060a5d2332a33dddf19fc02df1efb6e2eebaa87548e62915`. `.title-topbar` and `.title-slots-head` are **0 px** delta on desktop and mobile-landscape.

The old self-written title-row raster diagnostic still has its pre-existing desktop footer failure (6.5006 px versus a 4 px gate). Its gate is not weakened. The successful upstream Flex comparisons instead provide a migration path away from maintaining that geometry logic ourselves.

### Explicit upstream boundary
The pinned float-pigment type system exposes Grid tracks as MinContent / MaxContent / Fr / Length. Its own test roadmap still marks `repeat()` and `minmax()` incomplete. The framework therefore accepts only a proven semantics-preserving normalization such as the tested `repeat(3, minmax(0, 1fr))` -> three `1fr` tracks. A non-zero constraint such as `minmax(220px, 1fr)` is rejected; it must not be silently approximated.

### Architecture decision
1. Keep the framework's bounded DOM/BOM/event/storage/media compatibility layer as browser-semantics glue.
2. Replace self-developed Flex/Grid geometry with the pinned float-pigment WASM backend wherever the source style is inside the verified capability subset.
3. Treat text shaping/intrinsic measurement as a separate subsystem, matching float-pigment's own external-text-layout model. Diagnostic Chromium measurements are reference evidence only, not the shipping implementation.
4. Treat painting (gradients, pseudo-elements, SVG/images, borders, text raster) and event hit testing as a separate candidate layer. minigame-canvas-engine may remain useful there, but it is not the browser/runtime.
5. Fail closed on unsupported layout features instead of falling back to invented coordinates or semantic approximations.
6. Promotion beyond host geometry still requires the standalone WXWebAssembly fixture to pass through official WeChat DevTools/wechatide on an authorized interactive Windows/macOS host. No host test substitutes for that gate.
