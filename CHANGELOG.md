# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.1] - 2026-10-29

### 变更

- 素材文件改为语义化命名，不再用序号：
  - `clip-1.mp4` → `stardust.mp4`（柔光星尘 · 闭眼特写）
  - `clip-3.mp4` → `datastream.mp4`（DEEPSEEK 字标 · 数据流）
  - `clip-5.mp4` → `gaze.mp4`（字标 · 青色瞳孔特写）

> 升级后请重新安装一次（`remove` + `add`），旧文件名不再被引用。

## [0.2.0] - 2026-10-29

视频开屏版本。

### 新增

- **视频开屏**：`assets/` 下三段 mp4，每次启动随机播放一段
- **随机挑选**：浏览器端 Fisher–Yates 洗牌，每次页面加载抽一次；不用服务端随机，避免 `Range` 请求命中不同文件导致播放失败
- **随时跳过**：`Esc` 或点击画面立即淡出；正常播完自动淡出
- **隐藏 Windows 标题栏按钮**：DSH 桌面用 `titleBarStyle: "hidden"` + `titleBarOverlay`，按钮由系统绘制在网页之上，`z-index` 无效。改为注入 `<style>` 把 preload 的配色探针改成 `transparent`，主进程 `setTitleBarOverlay()` 随之透明；移除后自动还原
- **实时锐化**：SVG `feConvolveMatrix`（核值 `2.4 / -0.35`）补偿低码率源的糊感，可按需调强度
- **降级链**：单个素材加载失败自动换下一个 → 全部失败 / 解码报错 / 播放被拒 / 超过 20 秒，任一条件成立立刻放行，绝不阻塞启动

### 变更

- 素材替换为更高码率的同内容版本（1155 → 2659 kbps），锐化强度相应从 2.6 降到 2.4，避免大屏出现白边
- 插件从应用安装目录迁移到 `~/.dsh/plugins/`，与应用卸载/更新解耦
- `package.json` 补充 `engines`、`exports`、`files`、`keywords`，版本升至 0.2.0

### 移除

- 0.1.0 的纯 CSS 鲸鱼动画（由视频开屏替代）

## [0.1.0] - 2026-10-29

首个可用版本。

### 新增

- 全屏遮罩 + 旋转圆环 + 文字淡入的纯 CSS 开屏动画，3.4 秒后自动淡出
- 通过宿主扩展点 `webserver/index-inject` 注入 `kind: "script"` / `placement: "body"` 的自包含脚本
- 以 `dsh.bundle.patch` → `cordis.patch.yml` 的 `insert` 声明装配为 profile bundle

---

## 兼容性

已验证环境：

| 项目 | 版本 |
|---|---|
| DeepSeek Harness（桌面版） | 0.2.1-rc.3 |
| Electron | 44.7.0 |
| 平台 | Windows 11 x64 |

依赖的两个宿主接口：

- `webserver/index-inject`（注入播放器脚本）
- `connection.fetch.register()`（提供带 `Range` 的视频路由）

macOS / Linux 上标题栏那一步会自动跳过（`[data-windows-titlebar]` 不存在），其余功能正常，但未实测。

## 已知问题

- **首次安装较慢**：实测约 6 分钟。原因含 pnpm 初始化内容寻址存储、git 克隆 7MB 素材、网络状况。不是卡死，pnpm 会持续输出进度
- **素材非 MIT**：`assets/` 内三段为第三方动画素材，版权归原作者；仓库附带仅作效果演示，公开分发或商用前请替换为自己的素材
- **开屏时长浮动**：三段时长不一致（8.06s / 7.05s / 7.05s），随机到哪段决定这次遮挡多久
- **素材需 faststart**：`moov` 必须在 `mdat` 之前，否则浏览器要下完整个文件才能播。修复：`ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`
