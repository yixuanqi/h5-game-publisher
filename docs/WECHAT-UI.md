# V0.3.0 UI preview — Ashen Bell Vow V46.1

Pinned original SHA cdb508594cc610733f248ec5d4123a3b9d954981. This is the first Canvas UI slice, not a playable or reviewable candidate. Reuses V0.2 real scene renderer and frame clock, V0.1 storage/loader. Original save reader, settings serialization, locale dictionary and state are imported; a single reviewed build-only transform removes the DOM-only applyStaticI18n call in setLocale. Original checkout and raw export unchanged. UI is an explicitly new platform presentation; no promise of CSS pixel equivalence.

Scope: title, three slots read/select only, settings (language, lighting, haptic and volume preferences), preview HUD, read-only room map, paginated codex tabs, altar read-only status, pause, help, scene switching. Combat buttons disabled. Full menu styling, actual save/resume/create/delete, map pins/zoom/warp, equipment/refine/upgrade, NPC/shop, progression, gameplay simulation, real touch controls, audio/haptics effects and real-device testing remain outstanding. No game progression writes; settings use isolated ui-test namespace. Codex/map show fixture data for engineering only, not proof of unlocked progression. No screenshot is review evidence.

Build with Node 22:
```sh
npm install --no-save --no-package-lock esbuild@0.25.12 @napi-rs/canvas@0.1.80
node --test tests/wechat-bootstrap.test.mjs tests/wechat-render.test.mjs tests/wechat-ui.test.mjs
node platforms/wechat/bootstrap/build.mjs /path/to/PhotoGallery touristappid --ui
node platforms/wechat/ui/smoke.mjs
```
Fresh workspace .work/wechat-ui-46.1. Import only project/ into DevTools as game. Do not upload for review. CI uses native Skia raster and simulated wx; tests route transitions via actual hitboxes, persistent settings and language, write failure rollback, actual save reader without modifying fixture, disabled controls, stale touch guard, resize and pause. Screenshots are diagnostic only.
