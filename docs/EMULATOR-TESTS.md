# Android emulator automation (v0.2.1)

Baseline: b855087, CI 45569991426, all six jobs successful (APK/AAB builds for demo and both games; Linux/Windows 12/12; offline Chromium). Native emulator coverage is a new gate, not implied by those results.

Each emulator job downloads the exact debug APK artifact from the same workflow, checks SHA256, build-info, manifest package/version and APK signature, installs in a fresh Android emulator, disables Wi-Fi/data and enables airplane mode before first launch. Uses ADB and direct WebView CDP. API 34 by default; manual workflow_dispatch can select 29 or 36. KVM required. Software-rendered GPU and no audio output.

Acceptance: native bridge and landscape viewport; actual touch interaction on start and pause resume; native Back, Home/foreground; game remains paused after foreground; storage survives force-stop; demo score persists; no observed application crashes/ANR or uncaught JS exceptions; observed requests limited to local resources. No fake game state injection. The native WebView is debug-only; release debugging must remain disabled. Screenshots and raw evidence archived even when script fails. APK source is unchanged. Test report is JSON, not a visual-quality or device performance certification. Airplane mode plus disabled Wi-Fi/data and observed network events are a practical emulator check, not proof that every possible request is impossible.

Not yet covered: actual save progression for two real games, movement/attack outcome, multi-touch, GPU performance, audio output, extended endurance, devices and API 29/36 runs. Add per-game assertions once baseline is green. Device screenshots are evidence for manual review, not automatic black-screen pixel detection.

Local: use a dedicated, fresh Android emulator with SDK 36 build tools and Node 22. Run node scripts/emulator-smoke.mjs configs/demo.json <downloaded-extracted-apk-artifact> emulator-report. Script changes network state on the test device; do not point ADB at a personal phone. Uses the active ADB device and expects exactly one APK. Debug APK only.

Results: pending first emulator run. Check Actions artifacts `*-emulator-api-34` for test-results.json, logcat.txt, screenshots and CDP logs. 
