# dsh-custom-splash

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加一段开屏动画：**每次启动随机播放一段视频**，播完自动淡出。

![preview](docs/preview.png)

## 安装

```sh
dsh plugin --profile desktop add github:muning0214/dsh-custom-splash
```

- 桌面版用 `--profile desktop`，Web 版用 `--profile web`
- 装完**完全退出 DSH 再重开**（bundle 在启动时装配）
- 仓库里没有构建产物依赖、也没有 `prepare` / `postinstall` 脚本，`pnpm add` 不会编译任何东西，不会触发构建授权

## 特性

- **随机播放**：`assets/` 下三段视频，每次加载（= 每次重启）用 Fisher–Yates 洗牌取一段
- **随时跳过**：`Esc` 或点击画面；播完自动淡出
- **隐藏标题栏按钮**：Windows 右上角那三个按钮是系统画的，CSS 盖不住，这里改成让它们融进画面
- **实时锐化**：SVG `feConvolveMatrix` 补偿低码率源的糊感，可在 `index.mjs` 里调强度
- **绝不卡启动**：素材坏一个自动换下一个；全部失败、解码报错、播放被拒、超过 20 秒，都立刻放行

## 换成你自己的视频

1. 把 mp4 放进 `assets/`
2. 改 `index.mjs` 顶部的 `ASSETS` 表：

```js
const ASSETS = new Map([
  ['clip-1.mp4', 'video/mp4'],
  ['clip-3.mp4', 'video/mp4'],
  ['clip-5.mp4', 'video/mp4']
])
```

加一行就多一段，删一行就少一段。

> 视频需要 **faststart**（`moov` 在 `mdat` 之前），否则浏览器要下完整个文件才能播。
> 修复：`ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`

## 可调参数

| 位置 | 作用 | 默认 |
|---|---|---|
| `MAX_HOLD` | 最多遮挡多久（毫秒），兜底放行 | `20000` |
| `fade` | 淡出时长（毫秒） | `420` |
| `kernelMatrix` | 锐化卷积核，中心值越高越锐，超过 3.2 开始出白边 | `2.4 / -0.35` |
| `CAPTION_CSS` | 标题栏按钮透明规则 | 见源码 |

## 实现

只用了宿主的三个公开扩展点，没有改任何打包文件。

**1. 视频路由** — `connection.fetch.register()`

```js
ctx.connection.fetch.register({
  path: '/api/dsh-splash/clip-1.mp4',
  methods: ['GET', 'HEAD'],
  requestBody: 'buffered',
  fetch: (request) => serveAsset(request, 'clip-1.mp4')
})
```

必须支持 `Range`，否则 Chromium 无法流式解码视频。只读白名单里的文件，路径不可穿越。

**2. 注入播放器** — `webserver/index-inject`

往 `index.html` 的 body 开头注入一段自包含脚本，在应用外壳挂载之前用 Shadow DOM 盖一层全屏 `<video>`。样式与页面完全隔离，卸载时随宿主一起消失。

**3. 隐藏标题栏按钮** — 借用 preload 的色探针

DSH 桌面用 `titleBarStyle: "hidden"` + `titleBarOverlay`，按钮由系统绘制在网页之上，`z-index` 再高也盖不住。但 preload 里有一个隐藏 `span`，其 `background-color` / `color` 被读出来，经 IPC `dsh-desktop:windows-appearance` 交给主进程 `setTitleBarOverlay()`。

preload 监听 `document.head` 的变动，所以注入一条把该探针改成 `transparent` 的 `<style>` 就会自动触发重发：

```css
[data-windows-titlebar] body:has(> #dsh-custom-splash)
  > span[style*="--dsw-specific-sidebar-fill"]{
    background-color: transparent !important;
    color: transparent !important;
}
```

移除这条 `<style>` 时，按钮配色自动还原。

## 已知限制

- 素材是 720P（B 站未登录能拿到的最高档），大屏上靠锐化补偿，不是真高清
- 只在 **Windows 桌面版**验证过；macOS / Linux 上标题栏处理会跳过，其余功能照常
- 三段的时长不一致（8.06s / 7.05s / 7.05s），所以开屏时长会略有浮动

## 素材来源与许可

代码以 **MIT** 发布。

但 `assets/` 里的动画片段**不在此许可范围内**：它们来自 B 站视频 `BV1AkWA6yEti`（UP：吾为仙修），仅供本机开屏自用。如需分发本项目，请把 `assets/` 替换为你自己的素材。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-custom-splash
```
