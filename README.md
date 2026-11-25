# H5 Game Publisher

小轩游戏工作室 · H5 游戏统一发行工具链（v0.2.0 / real-game integration）

目标：一份 H5 游戏源码、每款游戏一份配置、一个可复用的 Android 构建入口。游戏不依赖博客在线地址，原始源码不被构建流程改写。当前只实现 Android，iOS、桌面及其他商店留待后续。

## 快速开始（Windows / Linux）

安装 Node.js 22+、Android Studio 2025.2.1+、Android SDK 36、JDK 21（或 Android Studio 自带 JDK，需确保 JAVA_HOME/SDK 路径正确）。Capacitor 固定为 8.0.0，首次构建需要访问 npm/Gradle 仓库。参考 [官方环境配置](https://capacitorjs.com/docs/getting-started/environment-setup)。

```sh
npm test
node scripts/publisher.mjs prepare configs/demo.json
node scripts/publisher.mjs apk configs/demo.json
```

生成：`dist/demo/1-0.1.0/demo-debug.apk`，使用 adb 或手机安装测试。`prepare` 不需要 Android SDK 或 npm 依赖；`apk` 才进行原生构建。CI 在 Windows/Linux 测试脚本，在 Linux 编译 Demo APK。

## 接入自己的游戏

把已经解压、可独立运行的 H5 发布目录（包含 `index.html` 和全部资源）放到 `games/<id>/`，或者将目录作为命令第三个参数。`games/` 不进 Git，框架与游戏源码独立。

```powershell
node scripts/publisher.mjs prepare configs/ashen-bell-vow.json 'D:\games\ashen-bell-vow'
node scripts/publisher.mjs apk configs/ashen-bell-vow.json 'D:\games\ashen-bell-vow'
node scripts/publisher.mjs apk configs/curio-box.json 'D:\games\curio-box'
```

配置字段：`id` 工作区标识、`appId` Android 包名、`name` App 显示名、`versionCode` 递增整数、`versionName` 展示版本、`orientation` 方向、`source` 相对于配置文件的默认源码目录。两个真实游戏配置已接入固定版本，发行身份仍是初始草案：首次上架前确认包名、显示名、版本和方向；发布后包名不得随意更改。真实游戏资源未包含在本仓库内；固定快照已通过导入和 staging，尚未进行真机验收。

构建阶段每次重建 `.work/<id>/`，请勿在其中保存长期改动。会保留同一游戏同一工具链版本的依赖锁；每次原生构建后也将锁文件随产物导出。首次 npm 解析传递依赖后，应将验证通过的锁纳入后续版本控制（当前环境无法生成）。不要并发构建同一个 id。

## AAB 与签名

```sh
node scripts/publisher.mjs aab configs/demo.json
node scripts/publisher.mjs studio configs/demo.json
```

`aab` 生成 **未签名 AAB**，不能直接上传 Google Play。推荐 `studio` 生成原生工程并打开 Android Studio，使用 Build → Generate Signed Bundle / APK → Android App Bundle，选择专用上传密钥，生成签名 AAB。密钥与密码不要提交 Git，做好离线备份；正式版使用 Google Play App Signing。`studio` 会重新生成工作区，故不要在生成工程里做唯一一份手工修改；原生持久化改动未来应进入模板/生成器。

## 生命周期接口

框架给 staging 后的 index 注入本地 runtime，并发出：

```js
window.addEventListener('h5publisher:pause', () => game.pause());
window.addEventListener('h5publisher:back', () => game.openPauseMenu());
window.addEventListener('h5publisher:resume', () => game.showResumePrompt());
```

上面的 game 是示意，实际函数由各游戏实现；不要直接复制未定义对象。请不要在回到前台时自动继续战斗。原生 App 插件的事件须通过实机验证；框架同时监听浏览器可见性。当前没有自动暂停任意游戏逻辑，也没有实现原生沉浸模式、图标生成、自动签名或 Play 上传。大屏 Android 16 可能忽略固定方向，游戏仍需适配。运行资源本地打包不意味着自动离线：CDN/外链、Service Worker、根路径资源等需要逐游戏核验。

## 结构

- `scripts/publisher.mjs`: 校验、资源 staging、Capacitor/Gradle 构建、版本注入、产物输出
- `scripts/runtime.js`: 游戏生命周期事件协议
- `configs/`: 两款游戏和 Demo 的独立配置
- `examples/demo/`: 自测用离线小游戏
- `tests/`: 框架回归测试
- `.github/workflows/ci.yml`: 双平台单测 + Android 编译 smoke test
- `docs/`: 发行检查单、路线图
- `scripts/create-repo.ps1`: 本地通过 GitHub CLI 创建私有仓并推送初始版本

## 建仓

本地安装 Git 与 GitHub CLI（`gh`），执行 `gh auth login` 后，在解压目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-repo.ps1
```

默认创建 `yixuanqi/h5-game-publisher` 私有仓库；不修改博客仓库。如果目标已经存在，脚本停止，不覆盖远端。也可以在 https://github.com/new 创建空的私有仓，然后使用普通 Git push。

## 状态

v0.2.0 已接入固定版本的两款真实游戏；Node 单测与三款游戏 staging 已通过。原生编译、浏览器运行与真机状态以 Actions 和验收记录为准。详见 `docs/ROADMAP.md`。

## v0.2: 固定源码版本、真实游戏接入

回归基线：PhotoGallery commit 5cc1493798b6007c303019003768474bf865c547，灰钟 v45.7、花房 v8.2。CI 从该提交稀疏 checkout 两款游戏，使用 import-blog 复制白名单运行资源（不修改原仓库），在临时构建工作区按游戏特定锚点适配后台暂停与返回键；锚点变更时显式失败，不静默跳过。游戏内容未提交到发行框架仓。

本地接入已有 PhotoGallery checkout（输出目录必须不存在）：

```sh
node scripts/import-blog.mjs ashen-bell-vow ../PhotoGallery
node scripts/import-blog.mjs curio-box ../PhotoGallery
node scripts/publisher.mjs apk configs/ashen-bell-vow.json
node scripts/publisher.mjs aab configs/curio-box.json
```

更新游戏时先记录源码提交、确认版本号递增，使用新输出目录或移走旧导入目录。入口资源静态检查不是完整离线证明；CI 加入禁止外部请求的 Chromium 启动检查，及三个 APK/未签名 AAB 编译任务。Android 真机、触控、音频、存档恢复、签名仍须独立验收。

## v0.2.1 Android emulator gate

API 34 default, manually select API 29 or 36 from Actions workflow dispatch. Exact same-run debug APK artifacts are installed, verified and exercised; reports are archived even on test failure. See `docs/EMULATOR-TESTS.md` for requirements, coverage and limitations. Emulator tests do not replace real-device acceptance.

## v0.2.2 — 源码隔离

原始游戏仓库只读；`games/` 导入保持运行资源字节一致，旁路 `.publisher-source.json` 记录来源。适配仅发生于 `.work/<id>/www`，通过 `configs/<id>.json` 的 `adapter` 显式选择。已知游戏入口变化将失败并要求兼容性复核；旧版已适配的导出需要重新导入至新目录。`build-info.json` 包含原始/适配文件哈希、变更路径、框架提交和适配器身份。详见 `AGENTS.md` 与 `docs/SOURCE-ISOLATION.md`。

## v0.3.1 — Android native and signing foundations

Optional Android branding/splash and immersive native configuration, plus opt-in AAB signing with pinned upload certificate and unchanged-payload verification. Demo CI uses a disposable test key only. See `docs/ANDROID-RELEASE.md` for setup and limits. No automatic production upload.
