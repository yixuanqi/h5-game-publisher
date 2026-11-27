# Open-source reuse evaluation — stop expanding bespoke CSS renderer

Goal: retain frozen V46.1 (cdb508594cc610733f248ec5d4123a3b9d954981) game logic, Canvas and original HTML/CSS, use established platform adapters and renderers rather than implement a browser. No production dependency approved by these spikes, no upstream game write. Existing self-written renderer remains a regression baseline; official wechatide skill gate stays separate.

## Candidate verification (2026-11-27)
- WeChat team Layout: https://github.com/wechat-miniprogram/minigame-canvas-engine pinned 60b211edc981c7e471eb064652e4df6af50aba39, package 1.0.28, MIT. XML + style objects, not browser DOM/CSS. It provides Canvas rendering, Flex, text, scroll containers, dynamic nodes and event routing, but no documented CSS Grid, general pseudo-elements or CSS gradients; ordinary text letter-spacing is also not a general capability.
- WeChat team float-pigment: https://github.com/wechat-miniprogram/float-pigment pinned 830c70afdc0ee092e74ad928dc9c6e05844ef62a, workspace 0.10.5, MIT. Its layout core supports block/flex/grid/relative/absolute and is designed as a low-level GUI dependency. The layout crate is not a browser and does not paint. The forest crate provides a node tree/C ABI; this repository validates a minimal WASM binding rather than forking its algorithms.
- Tencent kbone / wechat-miniprogram h5-to-miniprogram: useful DOM/BOM adaptation references for **Mini Program** pages, not direct Mini Game renderers. h5-to-miniprogram is archived and explicitly points users to kbone. Their WXML/WXSS render path cannot be treated as a Mini Game Canvas browser.
- weapp-adapter and engine-specific adapters bridge Canvas/BOM/limited DOM for Canvas/WebGL engines; they do not render arbitrary HTML/CSS.
- Yoga / Taffy are layout-only. Satori is a static image/SVG renderer. html2canvas/rasterizeHTML require browser capabilities. None is a complete arbitrary-H5 Mini Game solution.
- Frozen source audit: original HTML/CSS live menus/settings use Flex/Grid, pseudo-elements, gradients, scroll/forms and dynamic DOM. Save slots are generated at runtime into #save-slots-grid, so a Canvas-only adapter is insufficient.

## Layout executable result — run 45927200860
The pinned 1.0.28 package executed and its real event route worked in the browser Canvas diagnostic, but this is **not visual parity** and not WeChat evidence. Desktop maximum geometry delta was 12.8 px; mobile was 7 px. Both scenarios explicitly omitted linear-gradient, ::before and letter-spacing. Screenshots show the vendor result as a flat text list instead of the original layered dark title menu. The runtime property Layout.version reports 1.0.16 because upstream hard-codes that compatibility value separately from npm package version 1.0.28; it is not evidence that an old package was checked out.

Decision: Layout remains useful as a component renderer/reference, but it is rejected as the sole generic H5 UI renderer for this framework. Do not grow a large source-to-Layout CSS compatibility engine to compensate for these gaps.

## 0.5.2c float-pigment gate
The next executable gate checks the frozen source contract without modifying it, then generates a tiny Rust cdylib wrapper against the pinned float-pigment checkout. CI compiles that wrapper to wasm32-unknown-unknown and executes a three-column Grid calculation through JavaScript WebAssembly. Passing this gate proves **layout core -> WASM -> JS** on the host only. It does not prove WXWebAssembly, DOM/BOM, painting, text shaping, touch or real DevTools operation.

A pass therefore yields decision `host-wasm-proven-wx-pending`, not release readiness. The next allowed step is a thin reusable runtime binding plus WXWebAssembly fixture; the next forbidden step is implementing another independent Flex/Grid engine.

## Current architecture direction
Use layers instead of pretending one adapter is a browser:
1. Preserve/extend the existing browser-semantics runtime only for APIs actually used by imported games (DOM tree, class/style mutation, events, storage, timers, media/platform shims).
2. Prefer float-pigment for block/flex/grid geometry if the WASM and WX runtime gates pass.
3. Reuse established Canvas UI primitives where they fit painting/events, but keep unsupported visual CSS explicit. Painting and text shaping need their own candidate evaluation; do not silently approximate.
4. Keep official WeChat DevTools / wechatide evidence as the release gate. Host Chromium, Node WebAssembly, mocks or CLI handshakes never count as final Mini Game evidence.

The original game repository remains read-only throughout all experiments.
