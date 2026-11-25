# 迭代路线与验收标准

## v0.1 — Android bootstrap
- [x] 独立多游戏配置、资源 staging、构建清单 SHA256、基础版本校验
- [x] Demo、回归测试、Capacitor/Gradle 构建命令、CI 配置
- [ ] 在实际环境生成并验证依赖锁；CI 两个 OS 单测和 Android smoke 均绿
- [ ] Demo APK 真机运行，断网能进入，点击与存档重启通过，后台/返回键暂停事件生效
- [ ] 生成未签名 AAB，使用测试上传密钥签名，验证 bundletool/Play 内部测试

## v0.2 — 两款真实游戏接入（P0）
- 接入灰钟残誓与 Curio Box 的独立 web export，不复制进公开 Git。
- 资源相对路径检查、外部依赖检查、横屏/大屏、刘海和系统导航栏、多点触控、音频中断、本地存档、后台与返回键行为。
- 基线：原 Web 版本保持可玩；离线首次启动、重启、前后台切换、触屏连续操作和存档恢复在真机通过。
- APK 连续运行 30 分钟无崩溃；记录帧时间、内存、设备和 OS，按游戏制定性能阈值，不凭主观宣称达标。

## v0.3 — 可重复正式构建
- 固化原生模板与依赖锁、稳定的包名/版本号历史、应用图标和启动图生成、原生沉浸与 Insets。
- 安全签名脚本/CI secrets、AAB 验证、构建摘要和校验和、失败时不发布旧包。
- 以独立游戏配置输出 APK/AAB、商店文案与图标/截图尺寸检查；签名密钥不进入仓库或产物日志。
- 验收：同一提交可重建，两个应用可同时安装互不覆盖；更高 versionCode 可升级且保留存档。

## v0.4 — Google Play 发行
- Store listing、隐私政策、Data Safety、年龄分级、目标 SDK 和当前 Play 规则核验；内部测试与封闭测试。
- 可选 Play Developer API 上传至内部测试轨道，默认不自动生产发布；正式发布必须经人工授权。
- 将实际构建、签名、提交、测试和审核状态分别记录，不能以上传成功代替审核通过。

## v1.0+ — 其他平台
Web/itch.io 构建、iOS（需要 macOS/Xcode 与苹果账号）、Windows/Steam（独立封装与审核）、其他国内平台按需求实现，不在 v0.1 假设已经支持。

## v0.2.1 — Android emulator gate
- [x] API 34 exact APK install/start/offline touch/Back/Home/relaunch checks green for all three apps (d05464e, CI 45577715385).
- [ ] API 29/36 compatibility runs; real-game save and combat progression assertions; real-device acceptance.
- Reports: screenshots, signature, logcat, CDP console/network/errors, test-results.json.

## v0.2.2 — 源码隔离与独立适配器
- [x] 原始导入保持字节一致；独立适配器仅在构建工作区生效；源码与产物追溯、AGENTS.md。
- [ ] 新版完整 CI 通过，真实游戏运行资源与 d05464e 基线逐文件一致。

## v0.3.1 — Android native/signing foundations
- [x] Configurable native immersion (demo opt-in), icon and splash branding (demo/Ashen), certificate-pinned offline signing tool.
- [ ] CI build and disposable test-signing verification; existing emulator gate must remain unchanged. Real-game immersion, adaptive icons, Curio artwork, bundletool, release approval and stable lock remain outstanding.
- [ ] Ashen intro low-FPS issue remains game-side investigation; 1fcfb0f is 8/9, not accepted full green.

## v0.3.2 — Release quality gate
- [x] Pin official bundletool and validate actual AAB structure, manifest identity/SDK/flags/orientation, bundled web asset hashes and accepted npm lock digest. Registry records immutable package identity and version floors.
- [x] Full CI evidence for three unsigned bundles and Demo signed bundle (ede08da / 45607386685).
- [ ] Full Gradle locking and Play version history sync remain pending.
- [ ] Existing two real-game emulator issues must be resolved separately; no production release authorization.

## v0.3.3 — Approved artifact promotion and upgrades
- [x] Committed approved npm lock, version bump debug upgrade tests, candidate evidence binding and manual rehearsal/upload-key signing workflow.
- [ ] Fresh CI all nine jobs green, all three same-signer upgrade tests and candidate reports; manual release rehearsal with actual CI candidate.
- [ ] Per-game protected environment/reviewer/secret setup and approved real signing (operator action); real-device validation and cross-source save migration remain separate.
