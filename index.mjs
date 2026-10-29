/**
 * dsh-custom-splash — 给 DeepSeek Harness 加一层「大肥鱼」视频开屏。
 *
 * 素材来自 B 站 BV1AkWA6yEti《deepseek harness大肥鱼开机动画欣赏》（UP：吾为仙修），
 * 取的是其 8 秒开屏片段，仅本机自用。
 *
 * 实现：
 *  1. `connection.fetch.register` 在 /api 下挂一条本地视频路由（支持 Range，Chromium 媒体必需）
 *  2. `webserver/index-inject` 注入一段自包含脚本，在应用外壳挂载前盖一层全屏 <video>
 *  3. 播完自动淡出；Esc / 点击跳过；出错或超时立刻放行，绝不阻塞启动
 */
export const name = 'custom-splash'

export const inject = ['webServer', 'connection']

/** 视频路由前缀（宿主共享 fetch 通道，鉴权后仅 owner 可读）。 */
const PREFIX = '/api/dsh-splash/'
/** 素材文件名 → MIME。只允许读这里列出的文件。 */
const ASSETS = new Map([
  ['stardust.mp4', 'video/mp4'],
  ['datastream.mp4', 'video/mp4'],
  ['gaze.mp4', 'video/mp4']
])
/** 兜底放行时间：无论播到哪，最多遮挡这么久。 */
const MAX_HOLD = 20000

const assetRoot = new URL('./assets/', import.meta.url)

const PLAYER = `
<style>
:host{display:block}
*{box-sizing:border-box}
.wrap{position:absolute;inset:0;display:grid;place-items:center;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:cover;display:block;background:#000;
  filter:url(#dsh-sharpen) contrast(1.03) saturate(1.05)}
.hint{position:absolute;right:22px;bottom:20px;
  font:11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  letter-spacing:.08em;color:rgba(255,255,255,.42);background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:7px 12px;
  opacity:0;animation:in .6s .8s ease forwards;user-select:none}
@keyframes in{to{opacity:1}}
</style>
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="dsh-sharpen" x="0" y="0" width="100%" height="100%"
          color-interpolation-filters="sRGB">
    <feConvolveMatrix order="3" preserveAlpha="true"
      kernelMatrix="0 -0.35 0  -0.35 2.4 -0.35  0 -0.35 0"/>
  </filter>
</svg>
<div class="wrap"><video playsinline muted preload="auto"></video></div>
<div class="hint">Esc 跳过</div>
`

/** 让 Windows 原生标题栏按钮在开屏期间融进画面。
 *  桌面 preload 会读 body 下那个隐藏探针的 background-color / color 去设
 *  setTitleBarOverlay；把它改成透明，按钮底色和图标就都看不见了。
 *  它监听了 document.head 变动，所以插入/移除这个 <style> 会自动触发重发。 */
const CAPTION_CSS =
  '[data-windows-titlebar] body:has(> #dsh-custom-splash)' +
  ' > span[style*="--dsw-specific-sidebar-fill"]' +
  '{background-color:transparent!important;color:transparent!important}'

/**
 * 挂开屏层。必须完全自包含：这段函数会被 toString() 序列化后作为经典脚本注入，
 * 运行时拿不到模块作用域里的任何变量。
 */
function boot(opt) {
  try {
    var w = window
    if (w.__dshCustomSplash) return
    w.__dshCustomSplash = 1

    var host = document.createElement('div')
    host.id = 'dsh-custom-splash'
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:#000;isolation:isolate'
    var shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = opt.html

    var video = shadow.querySelector('video')
    var closed = false
    var timer = null
    var captionStyle = null

    function close() {
      if (closed) return
      closed = true
      try {
        w.removeEventListener('keydown', onKey)
        if (timer) clearTimeout(timer)
        if (video) {
          video.pause()
          video.removeAttribute('src')
          video.load()
        }
        // 移除后 head 变动会触发 preload 重发，按钮配色自动还原
        if (captionStyle) captionStyle.remove()
        host.style.transition = 'opacity ' + opt.fade + 'ms ease'
        host.style.opacity = '0'
        setTimeout(function () {
          if (host.parentNode) host.parentNode.removeChild(host)
        }, opt.fade + 60)
      } catch (e) {}
    }
    function onKey(e) {
      if (e.key === 'Escape') close()
    }

    // 每次加载（= 每次重启）随机打乱一次顺序，播第一个；失败就顺延下一个
    var queue = opt.srcs.slice()
    for (var i = queue.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1))
      var swap = queue[i]
      queue[i] = queue[j]
      queue[j] = swap
    }
    function nextSrc() {
      if (closed) return
      var src = queue.shift()
      if (!src) {
        close()
        return
      }
      video.src = src
      var playing = video.play()
      if (playing && playing.catch) {
        playing.catch(function () {
          if (!closed) close()
        })
      }
    }

    w.addEventListener('keydown', onKey)
    host.addEventListener('pointerdown', close)
    video.addEventListener('ended', close, { once: true })
    // 单个素材坏了就换下一个，全坏了才放行
    video.addEventListener('error', nextSrc)

    document.body.appendChild(host)
    captionStyle = document.createElement('style')
    captionStyle.textContent = opt.captionCss
    document.head.appendChild(captionStyle)

    nextSrc()

    timer = setTimeout(close, opt.maxHold)
  } catch (e) {
    /* 失败就静默退回正常启动 */
  }
}

/** 只有白名单里的文件可读；Range 必须支持，否则 Chromium 播不动。 */
async function serveAsset(request, filename) {
  const type = ASSETS.get(filename)
  if (!type) return new Response(null, { status: 404 })
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  const { readFile } = await import('node:fs/promises')
  let bytes
  try {
    bytes = await readFile(new URL(filename, assetRoot))
  } catch {
    return new Response(null, { status: 404 })
  }
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
    'content-length': String(bytes.length)
  }
  if (request.method === 'HEAD') return new Response(null, { headers })

  const range = request.headers.get('range')
  if (!range) return new Response(bytes, { headers })

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  let start = 0
  let end = bytes.length - 1
  if (match) {
    start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]))
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
  }
  const bad =
    !match ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= bytes.length
  if (bad) {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': 'bytes */' + bytes.length }
    })
  }
  return new Response(bytes.subarray(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      'content-length': String(end - start + 1),
      'content-range': 'bytes ' + start + '-' + end + '/' + bytes.length
    }
  })
}

export function apply(ctx) {
  for (const filename of ASSETS.keys()) {
    ctx.effect(
      () =>
        ctx.connection.fetch.register({
          path: PREFIX + filename,
          methods: ['GET', 'HEAD'],
          requestBody: 'buffered',
          fetch: (request) => serveAsset(request, filename)
        }),
      'custom-splash: ' + filename
    )
  }

  ctx.on('webserver/index-inject', (rows) => {
    const options = JSON.stringify({
      html: PLAYER,
      srcs: [...ASSETS.keys()].map((f) => PREFIX + f),
      captionCss: CAPTION_CSS,
      maxHold: MAX_HOLD,
      fade: 420
    })
    rows.push({
      kind: 'script',
      placement: 'body',
      // 转义 '<' 防止模板里出现 </script> 提前截断脚本标签
      text: '(' + boot.toString() + ')(' + options.replaceAll('<', '\\u003c') + ');'
    })
  })
}
