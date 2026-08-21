# Security Policy

## Data Boundaries

Crosspost Studio has no cloud service or telemetry. Article content is sent to
target platforms only when the user explicitly initiates a draft task, from a
snapshot of the current note:

- WeChat content is sent by the plugin directly to WeChat's official API.
- Browser-platform content is sent via the localhost bridge to the extension,
  which then writes it into the currently-visible editor.
- The extension persists connection settings and non-body task metadata only.
  Completed job results (at most 100 entries of metadata: job ID, state, error
  code, message, binding, draft URL, completion time) and the cancelled set are
  stored in `browser.storage.local` and restored when the service worker starts.
  A job interrupted by a service-worker restart returns an explicit `unknown`
  result and must be verified manually on the platform; it is never re-executed.
  Article bodies and asset bytes are never persisted.

## Credentials

- WeChat AppSecret and the bridge master key must be stored in Obsidian
  SecretStorage.
- The pairing key in the extension is only readable by the extension's trusted
  context.
- Never commit `.env`, test accounts, access tokens, cookies, private keys, or
  real article body text.
- Logs and error reports must be sanitized with the project's redaction tooling
  or manually before sharing.

## Clipboard

The plugin writes the bridge pairing key to the system clipboard only after the
user clicks **Copy pairing key**. It never reads clipboard contents. Browser
editor adapters construct in-memory paste events for visible editors; they do
not request the browser `clipboardRead` or `clipboardWrite` permissions.

## Local Bridge

The bridge binds only to `127.0.0.1`, rejects non-extension Origins, and uses
protocol versioning, HMAC challenge, message size limits, idempotent Job IDs,
and ten-minute one-shot resource tokens. Resource responses use `no-store`, and
tokens only authorize in-memory resources for a single Job.

## Mermaid SVG

Mermaid is rendered locally through Obsidian's bundled renderer with a
content-derived render ID and a 50,000-character cap. An independent sanitizer
removes scripts, `foreignObject`, event attributes, external links, and embedded
objects; SVGs containing external CSS resources are rejected outright. WeChat
receives a PNG converted from this SVG; other platforms receive the sanitized
SVG image file.

## Reporting Vulnerabilities

Please submit vulnerabilities via GitHub's private security reporting feature.
Do not include credentials, article content, draft URLs, or reusable
reproduction tokens in public issues.

---

## 安全策略 (中文)

### 数据边界

Crosspost Studio 没有云端服务或遥测。文章内容只在用户主动发起草稿任务时，从当前
Obsidian 快照发送到目标平台：

- 微信内容由插件直接发送至微信官方 API。
- 浏览器平台内容通过 localhost bridge 发送给扩展，再填入当前可见编辑器。
- 扩展只保留连接设置和非正文任务元数据。已完成任务的终态结果（最多 100 条元数据：
  jobId、state、errorCode、message、binding、draftUrl、completedAt）与 cancelled
  集合会存入 `browser.storage.local`，并在 service worker 启动时回灌。被 service
  worker 重启中断的任务会返回显式 `unknown` 结果，需要用户到平台手动核实，绝不重新
  执行。文章正文与资产字节永不持久化。

### 凭据

- 微信 AppSecret 与 bridge 主密钥必须保存在 Obsidian SecretStorage。
- 扩展中的配对密钥只允许扩展可信上下文读取。
- 禁止提交 `.env`、测试账号、访问令牌、Cookie、私钥或真实文章正文。
- 日志和错误报告在分享前必须使用项目脱敏工具或人工删除敏感值。

### 剪贴板

插件只会在用户点击 **Copy pairing key** 后把 bridge 配对密钥写入系统剪贴板，从不
读取剪贴板内容。浏览器编辑器适配器只为当前可见编辑器构造内存中的粘贴事件，不申请
浏览器 `clipboardRead` 或 `clipboardWrite` 权限。

### 本地 bridge

bridge 只绑定 `127.0.0.1`，拒绝非扩展 Origin，使用协议版本、HMAC challenge、消息大小
限制、幂等 Job ID 与十分钟一次性资源令牌。资源响应使用 `no-store`，令牌只授权单个
Job 的内存资源。

### Mermaid SVG

Mermaid 通过 Obsidian 内置渲染器在本地渲染，使用内容派生的渲染 ID 和 50,000 字符
上限。独立清洗器会移除脚本、`foreignObject`、事件属性、外部链接与嵌入对象；包含
外部 CSS 资源的 SVG 会直接拒绝。微信公众号收到的是从该 SVG 转换的 PNG，其他平台
收到清洗后的 SVG 图片文件。

### 报告漏洞

请通过 GitHub 的私密安全报告功能提交漏洞，不要在公开 issue 中包含凭据、文章内容、
草稿 URL 或可复用的复现令牌。
