# V0.5.4a continuation — Taffy generic geometry ABI v1 (diagnostic only)

## Status / scope
- Framework main observed 391b977aa7f35b8e24205903a622366a616a4e0f; experimental Canvas observed 8990651049df1fb09c4b50f88a9b0ffad4768d15. This delivery is additive and is not integrated into either runtime branch.
- Taffy candidate 0.16.0 at DioxusLabs/taffy `497de49c200daee81a18ce627bec98d5340ae57a` (MIT), Rust 1.92.0. Upstream API reviewed at exact pin (Style, GridTemplateTracks, TaffyTree, CSS parse features). The Rust bridge itself has not been compiled in this environment.
- Previous one-off title-grid spike stays independent. The new ABI supports arbitrary bounded node trees, not a hardcoded title layout. No game source, existing runtime, workflows or release changes. No GitHub push or dispatch.

## ABI v1
All integer handles/statuses are u32; handle 0 and status 0 are errors. Exported status 1 denotes success. Coordinates and dimensions use f32 logical pixels; percentage/style syntax uses CSS strings. One instance owns one tree/handle namespace; handles are never recycled in that instance, including reset. No concurrent/reentrant access. All mutation attempts invalidate the last computed geometry. Rectangles are relative to the layout parent, not world or paint coordinates; query only nodes reachable from the last root. A failed computation cannot reuse an old rectangle. Host rejects errors and nonfinite results; no silent approximation.

| Export | Contract |
|---|---|
| TlAbiVersion() | 1 |
| TlReset() | clear tree/handles, retain monotonic handle sequence |
| TlNodeNew() | allocate a node (max 8192 live) |
| TlNodeFree(h) | free detached leaf only |
| TlAppend(parent, child) | append detached child; reject cycle / existing parent |
| TlDetach(parent, child) | detach direct child |
| TlInputBegin(length), TlInputByte(index, value) | bounded ASCII buffer, max 4096 bytes, no raw host pointers |
| TlSetStyle(h, propertyId) | parse one longhand using upstream Taffy parse, apply only after successful parse |
| TlCompute(root, width, height) | detached root, finite nonnegative viewport, depth gate 128 |
| TlRect(h, field) | x/y/width/height for fields 0/1/2/3; NaN on invalid/stale |

Property identifiers 1–42 are defined in `taffy-runtime.cjs` and mirrored by the Rust dispatcher. They cover block/flex/grid/none, dimensions, min/max, gap, flex direction/wrap/alignment/grow/shrink/basis, Grid tracks and explicit placement, relative/absolute/static positioning and inset, padding/margin/border widths, box-sizing and normalized numeric aspect ratio. The bridge accepts CSS longhands in a controlled subset, not arbitrary stylesheet text. `order`, `calc`, `var`, fixed/sticky, inline formatting, font/intrinsic text measurements, scroll/overflow, transforms, painting, event hit testing, CSS cascade and pseudo-elements are NOT supported by this diagnostic ABI; no capability promotion is implied. Aspect-ratio input is normalized numeric (e.g. `2`), not raw `16 / 9`. Intrinsic leaf sizing requires a later measurement interface; default empty leaf metrics are not browser text metrics. Grid auto-repeat, full Flex, and other accepted values remain unverified until dedicated executable evidence. No untrusted CSS inputs should be passed; resource/track complexity and WASM trap recovery need further hardening before shipping.

## Real verification workflow (local, no CI)
From the framework root after applying both patches (or the cumulative patch), with Node 22 and git:

```sh
node --test tests/wechat-taffy-wx-gate.test.mjs tests/wechat-taffy-abi.test.mjs
rustup toolchain install 1.92.0
rustup target add --toolchain 1.92.0 wasm32-unknown-unknown
git clone https://github.com/DioxusLabs/taffy.git vendor-taffy
git -C vendor-taffy checkout --detach 497de49c200daee81a18ce627bec98d5340ae57a
# output parent must already exist; output directory must not exist
node platforms/wechat/ui-layout/taffy-build.mjs vendor-taffy .work/taffy-abi-054a
```
Create `.work` first if missing. The script rejects a dirty/wrong vendor checkout, checks MIT/version, compiles actual upstream Taffy to import-free WASM, records toolchain and SHA-256, runs eight analytical/lifecycle cases under Node WebAssembly, and generates `wx-project` only after the host gate passes. Dependencies are resolved by Cargo on the first build; retain generated Cargo.lock and artifact digest for reproduction (not yet independently locked across machines).

Host case IDs: grid-800, grid-400, flex-space-between, mutation, grid-explicit-placement, absolute-percent, aspect-ratio, lifecycle. Numeric geometry threshold 0.5 logical px. `report.json` must show `host: pass` and all cases passing. Import the generated `wx-project` into the official WeChat Developer Tools, supplying your permitted AppID if required. Check `__H5PUBLISHER_TAFFY_ABI__` phase pass, runtime wx, every case and artifact digest; capture logs and screenshots. Native path requires WXWebAssembly and never falls back to standard WebAssembly. Repeat on real phone. Run the separate frozen-game Chromium title-grid spike from previous notes to compare actual game geometry; synthetic cases do not replace it. Do not promote until native and actual-source gates pass.

## Local evidence and remaining gates
- Node 22.16.0: 20/20 isolated JS tests passed (11 previous and 9 new), including interface, lifecycle and failure handling using test doubles. No real Taffy execution. JS syntax checks passed.
- Network resolution to github.com failed; rustc and cargo unavailable. No vendored Taffy or compiled Taffy WASM available in this container. Thus Rust ABI compilation, actual Taffy host geometry, frozen game browser comparison, and native official DevTools/phone are NOT RUN. The full framework suite was not available in the local partial checkout. Do not mark V0.5.4a complete or update the backend capability matrix yet.
- Next: compile pinned bridge, fix any compiler/API mismatch without widening capabilities, run host+native gates and source comparison, then add real text measurement and integrate DOM/CSS plan before V0.5.4b. Preserve V0.5.3b/c gameplay acceptance separately.
