# H5 Game Publisher

小轩游戏工作室 · H5 游戏统一发行工具链（v0.1.0 / bootstrap）

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

配置字段：`id` 工作区标识、`appId` Android 包名、`name` App 显示名、`versionCode` 递增整数、`versionName` 展示版本、`orientation` 方向、`source` 相对于配置文件的默认源码目录。两个真实游戏配置是初始草案：首次上架前确认包名、显示名、版本和方向；发布后包名不得随意更改。真实游戏资源未包含在本仓库内，也尚未进行实机适配。

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

v0.1.0 是初始骨架：本地 Node 单测与 Demo staging 通过；Android SDK/依赖下载、APK/AAB、签名、真机验证和 GitHub Actions 均尚未完成验证。详见 `docs/ROADMAP.md`。
