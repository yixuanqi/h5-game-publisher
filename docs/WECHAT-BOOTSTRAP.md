# WeChat bootstrap 0.1.0 — Ashen Bell Vow 46.1.0

Source: PhotoGallery `cdb508594cc610733f248ec5d4123a3b9d954981`; approved entry blob b7ec66093bb03ccd498b75b500f968b3af7c04ed. Independent of Android adapter and promotion contract. No upstream modifications. This slice closes the missing game.json/game.js structural gap and exercises actual world loader and storage code through wx API bridges. It is **not the playable game**. Canvas displays a labeled engineering room-layout diagnostic, not a screenshot of gameplay. Never upload it for review or promote it via wechat-evidence.

## Local build / CI

Use Node 22, clean publisher checkout, and byte-preserving clean PhotoGallery checkout at the pinned SHA (core.autocrlf=false). In publisher root:

```sh
npm install --no-save --no-package-lock esbuild@0.25.12
node --test tests/wechat-bootstrap.test.mjs
node platforms/wechat/bootstrap/build.mjs /path/to/PhotoGallery
node platforms/wechat/bootstrap/smoke.mjs
```

Use a fresh .work/wechat-bootstrap-46.1 directory; builder refuses existing workspace. Optional third argument to build is the actual wx AppID; default touristappid, replace in DevTools locally. Import project/ in WeChat DevTools as **小游戏**, do not select the original H5. Expected diagnostic displays NG1/NG2/NG3 room counts 25/25/26; tapping buttons switches the real loaded world. Test hide/show on device; collect actual console and screenshot only for engineering. No release upload. wx mock checks use actual game modules, not a device. Package manifest hashes, exact source and framework identities and browser-reference audit are outside project/; do not import the surrounding directory. Main code dependency graph is bundled in memory for static validation, not run. No production data is touched; probe storage uses its own namespace.

## Next slices and gates

1. Native rendering surface/offscreen canvas and game loop: use original renderer and state, verify real scene against H5 visual baseline; no gameplay changes.
2. UI platform port: inventory DOM/CSS dependencies; implement canvas-rendered UI and actual event routing for title/slots/HUD/maps/altar/NPC/settings, text/layout and scrolling. No empty DOM stubs that falsely pass.
3. Input and lifecycle: native touch multitouch/cancel, pause on hide, resume timing and original save schema; test attacks, parry, spells and grapple against H5.
4. Audio: verify wx.createWebAudioContext capabilities, pre-bake or adapt graph where needed, no silent fallbacks. Test real device audio.
5. Package budget, startup performance, privacy inventory and DevTools/Android/iOS physical acceptance; only then use real candidate evidence contract. New 46.1 evidence cannot be attached to old 45.7 materials without explicit version update.
