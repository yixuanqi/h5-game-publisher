# V0.2 render slice — Ashen Bell Vow V46.1

Pinned cdb508594cc610733f248ec5d4123a3b9d954981, V0.1 kept intact. Builds separate engineering project in .work/wechat-render-46.1; imports original renderer, camera, entity factories, ambience, terrain and VFX. Three fixture scene buttons, no player control or progression. New frame scheduler uses native rAF, clamps delta, cancels on hide, resets on show, fences stale callbacks, reports fatal errors. Does not execute browser main.js nor port full combat loop, DOM UI or audio. No changes to original source, no production save writes.

Node 22:
```sh
npm install --no-save --no-package-lock esbuild@0.25.12 @napi-rs/canvas@0.1.80
node --test tests/wechat-bootstrap.test.mjs tests/wechat-render.test.mjs
node platforms/wechat/bootstrap/build.mjs /path/to/PhotoGallery touristappid --render
node platforms/wechat/render/smoke.mjs
```
CI executes real renderer on native Skia raster backend through simulated wx APIs and compares exact pixels with an untransformed original renderer reference using the same fixture, seeded RNG and raster backend. This is not full H5-browser or WeChat-device visual parity. Three PNGs are engineering captures, never review evidence. Import only project/ into WeChat DevTools; local AppID can be configured. Validate three scenes, animate, rotate/resize and background/foreground. Actual DevTools / Android / iOS not run by CI. Next: touch and original gameplay frame integration, full UI port, audio and physical device regression; no formal release.
