# Architecture

[中文版本](#architecture-中文)

## Snapshots & Transformation

When the user clicks save, the plugin immediately reads the body, frontmatter,
theme, custom CSS, and asset resolver to form an **immutable snapshot**. All
conversions and platform tasks use this snapshot. After the task completes the
current source hash is recomputed; if different, the result is marked "source
changed" but the in-flight task is not altered.

A unified Markdown AST handles GFM, Obsidian image embeds, formulas, code, and
compatibility diagnostics. Zhihu formulas are handed to the visible editor to
generate native LaTeX nodes. WeChat receives sanitized MathJax SVG markup
directly inside the article HTML; it is not an uploaded image, and its
`currentColor` follows the surrounding text in light and dark modes. Other
platforms without native formula support receive high-resolution PNGs
rasterized from the same SVG output. Intrinsic dimensions and inline baseline
metadata keep formulas aligned with surrounding text. Output includes platform
HTML, platform Markdown, a content hash, and content-addressed asset descriptors;
asset bytes live only in memory.

## Platform Boundaries

- The WeChat adapter uploads body images and the cover via the official API
  inside Obsidian, then creates or updates a draft.
- Manual WeChat handoff offers two derived clipboard formats: rich HTML for a
  normal editor paste, and literal HTML source for source-editor helpers that
  read plain clipboard text and apply it to the editor DOM. Markdown remains
  the canonical source in both cases.
- Browser-platform jobs are handed to the extension over the local bridge. The
  extension fetches one-shot assets, opens or reuses a strictly allowlisted draft
  URL, injects a runtime content script, and waits for the platform to display an
  explicit save status.
- A successful create is bound only after the resulting URL contains a reusable
  draft identifier. A generic create URL is treated as `unknown`, preventing a
  retry from creating a duplicate draft.
- There is no transaction or rollback across platforms; each platform
  independently writes its binding and task state.

## Protocol

All JSON messages carry `protocolVersion: 1` and are validated against shared
Zod schemas:

1. `pair` / `pair-response` / `pair-result`
2. `capabilities`
3. `enqueue-job`
4. `job-progress` / `job-result`
5. `cancel-job`

The server generates a 256-bit nonce; the extension replies with
`HMAC-SHA256(pairingKey, nonce)`. Article resources never travel over the
WebSocket; the extension fetches them from `127.0.0.1` using a per-job bearer
token that expires after ten minutes with caching disabled.

The extension maintains an in-memory idempotency ledger for Job IDs: duplicate
messages for an active job are suppressed, and the last 100 completed results
can be replayed. Completion metadata does not include the article body. A
service-worker restart loses in-progress body jobs; the user must resend.

## Unknown State

When initial creation times out or lacks a clear save signal, the state is
`unknown`. The plugin persists this non-body state and blocks auto-recreation;
the user must first check the platform for an existing draft, then explicitly
clear the lock from the task panel. Updating a known binding that fails does not
delete the original binding.

## Formula Marker Encoding

Zhihu formula markers encode LaTeX source in a hex string, wrapped in a
discriminator with a fixed UUID prefix:

```
CROSSPOST_FORMULA_a7b3c9d1_BLOCK_<hex>_END
```

The UUID prefix (`a7b3c9d1`) prevents collisions with user-authored text.
Markdown processors may escape underscores; both forms are matched during
reconstruction. WeChat uses a separate fixed-prefix placeholder while the
trusted, sanitized inline SVG is carried out-of-band during Markdown-to-HTML
serialization. Active SVG content, links, event handlers, and external URLs are
rejected before insertion.

---

# Architecture (中文)

## 快照与转换

用户点击保存后，插件立即读取正文、frontmatter、主题、自定义 CSS 和资源解析器，形成不可变
快照。转换与所有平台任务都使用这个快照。任务结束后再次计算当前源稿哈希；若不同，结果标记
"源稿已更新"，但不会改变正在执行的任务。

统一 Markdown AST 负责 GFM、Obsidian 图片嵌入、公式、代码和兼容性诊断。知乎公式交给
可见编辑器生成原生 LaTeX 节点。微信使用 Obsidian 内置 MathJax 生成经过安全检查的 SVG，
直接嵌入文章 HTML；它不是上传图片，并通过 `currentColor` 跟随正文在亮色/夜间模式下换色。
其他不支持原生公式的平台仍将同一 SVG 栅格化为高清 PNG。固有尺寸与行内基线信息用于保持
公式和正文对齐。生成物包含平台 HTML、平台 Markdown、内容哈希和内容寻址资源描述；资源
字节只存在内存映射中。

## 平台边界

- 微信适配器在 Obsidian 中用官方 API 上传正文图片与封面，然后新增或更新草稿。
- 微信手工交付提供两种派生剪贴板格式：用于普通粘贴的富 HTML，以及供
  “读取纯文本剪贴板并写入编辑器 DOM”类源码助手使用的 HTML 源码。两种情况下
  Markdown 仍是唯一源稿。
- 浏览器平台 Job 经本地 bridge 交给扩展。扩展获取一次性资源、打开或复用经过严格白名单
  校验的草稿页、注入运行时内容脚本并等待平台显示明确保存状态。
- 首次创建只有在结果 URL 含有可复用的草稿标识后才会写入 binding；仍停留在通用新建页时
  按 `unknown` 处理，避免重试造成重复草稿。
- 平台之间没有事务或回滚；每个平台独立写入 binding 和任务状态。

## 协议

所有 JSON 消息都含 `protocolVersion: 1` 并经过共享 Zod schema 校验：

1. `pair` / `pair-response` / `pair-result`
2. `capabilities`
3. `enqueue-job`
4. `job-progress` / `job-result`
5. `cancel-job`

服务端生成 256-bit nonce，扩展返回 `HMAC-SHA256(pairingKey, nonce)`。文章资源不进入
WebSocket 消息；扩展持任务级 bearer token 从 `127.0.0.1` 获取，十分钟过期且禁用缓存。

扩展对 Job ID 使用内存幂等 ledger：运行中重复消息不会再执行，最近 100 个完成结果可以重放。
完成元数据不包含正文。service worker 重启后无法恢复中断正文任务，用户必须重新发送。

## 未知状态

首次创建发生超时或缺少明确保存信号时，状态为 `unknown`。插件持久化这类非正文状态并阻止
再次创建；用户必须先到平台检查是否已有草稿，再在任务面板显式解除锁定。更新已知 binding
失败不会删除原 binding。

## 公式标记编码

知乎公式标记将 LaTeX 源码以 hex 编码，包裹在带固定 UUID 前缀的鉴别器中：

```
CROSSPOST_FORMULA_a7b3c9d1_BLOCK_<hex>_END
```

UUID 前缀（`a7b3c9d1`）防止与用户正文的意外碰撞。Markdown 处理器可能会转义下划线；
重建时会同时匹配两种形式。微信使用另一种固定前缀占位符，在 Markdown 转 HTML 期间于
AST 外保存可信且已清洗的内联 SVG；插入前会拒绝活动 SVG 内容、链接、事件处理器和外部 URL。
