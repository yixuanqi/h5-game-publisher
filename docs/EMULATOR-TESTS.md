# Android emulator automation (v0.2.1)

Baseline: b855087, CI 45569991426, all six jobs successful (APK/AAB builds for demo and both games; Linux/Windows 12/12; offline Chromium). Native emulator coverage is a new gate, not implied by those results.

Each emulator job downloads the exact debug APK artifact from the same workflow, checks SHA256, build-info, manifest package/version and APK signature, installs in a fresh Android emulator, disables Wi-Fi/data and enables airplane mode before first launch. Uses ADB and direct WebView CDP. API 34 by default; manual workflow_dispatch can select 29 or 36. KVM required. Software-rendered GPU and no audio output.

Acceptance: native bridge and landscape viewport; actual touch interaction on start and pause resume; native Back, Home/foreground; game remains paused after foreground; storage survives force-stop; demo score persists; no observed application crashes/ANR or uncaught JS exceptions; observed requests limited to local resources. No fake game state injection. The native WebView is debug-only; release debugging must remain disabled. Screenshots and raw evidence archived even when script fails. APK source is unchanged. Test report is JSON, not a visual-quality or device performance certification. Airplane mode plus disabled Wi-Fi/data and observed network events are a practical emulator check, not proof that every possible request is impossible.

Not yet covered: actual save progression for two real games, movement/attack outcome, multi-touch, GPU performance, audio output, extended endurance, devices and API 29/36 runs. Add per-game assertions once baseline is green. Device screenshots are evidence for manual review, not automatic black-screen pixel detection.

Local: use a dedicated, fresh Android emulator with SDK 36 build tools and Node 22. Run node scripts/emulator-smoke.mjs configs/demo.json <downloaded-extracted-apk-artifact> emulator-report. Script changes network state on the test device; do not point ADB at a personal phone. Uses the active ADB device and expects exactly one APK. Debug APK only.

Results: first emulator run 45572525732 failed all three runtime jobs; six existing jobs passed. See incident below. Check Actions artifacts `*-emulator-api-34` for test-results.json, logcat.txt, screenshots and CDP logs. 

## Incident 45572525732 — native lifecycle and system-image isolation

- Demo and Curio: signature/install/offline/boot passed. Curio entered stage 1 and native Back opened pause. Home test failed; Logcat explicitly reports native pause/resume events with no listeners. Short background can skip onStop; appStateChange alone insufficient. Subscribe to pause/resume independently of appStateChange and document visibility. Unit regression models short and full lifecycle, stale initial state, duplicate events. Home acceptance now checks actual native and publisher event counters and same PID, then checks gameplay remains paused. No reduction of assertions.
- Ashen: install passed; native boot test timed out because Android killed app PID 2414 due to dependence on Google Play services FontsProvider in dying GMS persistent process after its ANR. This is established from logcat. Switch default smoke image to AOSP (no GMS), use 720x1280 software-rendered display; Google APIs remains manually selectable for compatibility tests, not declared green. The original failure is not suppressed.
- Added process exit info, provider info, activity state evidence and explicit detection of dependent-provider kills. Corrected reload synchronization to avoid stale boot flags. All emulator acceptance remains pending rerun.
