# Crosspost Studio

[中文版本](#crosspost-studio-中文)

Crosspost Studio is a local-first desktop plugin and Chromium extension that creates
or updates drafts on WeChat Official Account, Zhihu, Juejin, CSDN, OSChina,
BlogsCN, Jian Shu, SegmentFault, 51CTO, Baijiahao, and Toutiao — all from a
single Markdown source note. Bilibili Columns and Tencent Cloud Developer
Community are supported as well. It saves drafts only; it does not publish.

> Status: buildable MVP. DOM adapters have been tested with offline fixtures; real
> platform drafts should still be verified with dedicated test accounts before
> production use.

## Design Boundaries

- The Obsidian note is always the single source of truth.
- WeChat Official Account uses the official Material & Draft APIs; AppSecret is
  stored in Obsidian SecretStorage.
- All browser platforms only operate on the user's already-logged-in visible
  editor — no private APIs, no cookie reading.
- The plugin and extension communicate exclusively over `127.0.0.1`; no cloud
  relay, telemetry, or persistent article body storage.
- Failure on any platform does not roll back drafts on others.
- When creation outcome is uncertain the task is recorded as `unknown` and
  auto-rebuild is locked to prevent duplicate drafts.

## Repository Structure

```text
apps/
  obsidian-plugin/   ItemView, preview, SecretStorage, WeChat API, local bridge
  browser-extension/ WXT/MV3 extension, on-demand permissions, visible-editor adapters
packages/
  core/              Markdown AST, embeds, image dedup, themes, CSS inlining, render adapters
  protocol/          Versioned message schemas, HMAC pairing, runtime validation & sanitization
test-vault/          Acceptance samples isolated from your main vault (no .obsidian state)
```

## Supported Range

- Obsidian Desktop 1.11.5+, macOS or Windows
- Chromium 116+, Chrome or Edge
- GFM, Obsidian image embeds, code blocks, tables, Mermaid, inline & block LaTeX
- Three built-in themes: Minimal, Academic, Tech
- Vault-level custom CSS; only properties scoped under `#crosspost-root` and on an
  allowlist are accepted

## Local Development

Requires Node.js 24 and pnpm 11.18. All dependencies are installed in the project:

```bash
pnpm install
pnpm check
pnpm release:package
```

Release artifacts:

- `dist/main.js`, `dist/manifest.json`, `dist/styles.css` (build-verifier copies)
- `dist/obsidian/main.js`
- `dist/obsidian/manifest.json`
- `dist/obsidian/styles.css`
- `dist/chromium/*.zip`

When developing the plugin, create a dedicated test vault — do not develop directly
against your main vault. Place the three Obsidian files above into
`.obsidian/plugins/crosspost-studio/` of the test vault, then enable the plugin.
Chromium extension dev builds live in `apps/browser-extension/.output/chrome-mv3/`;
load them as an unpacked extension in your browser's extensions page.

## First-Time Setup

1. Open Crosspost Studio settings in Obsidian.
2. Select or create a WeChat AppSecret in SecretStorage; general settings only store
   the key name.
3. For WeChat, fill in the AppID and confirm the account has material/draft
   permissions and the current public IP is allowlisted.
4. Click "Copy pairing key" and paste it into the extension popup.
5. Click the "Enable" button only for platforms you need. The browser will request
   the corresponding host permission at that point.
6. Log into the platforms and keep the visible draft editor accessible, then save
   drafts from the workbench.

## Installation

Once the Obsidian community directory review is complete, search for
"Crosspost Studio" under **Settings → Community plugins → Browse**. During review
you can download `main.js`, `manifest.json`, and `styles.css` from
[GitHub Releases](https://github.com/yorha2B0826/crosspost-studio/releases) and
place them in `<Vault>/.obsidian/plugins/crosspost-studio/`.

WeChat Official Account requires only the Obsidian plugin. The version-numbered
Obsidian Release intentionally contains only `main.js`, `manifest.json`, and
`styles.css`. The other twelve platforms also need the Chromium extension ZIP from
the separate `browser-<version>` Release; unzip it and load it as an unpacked
extension in Chrome or Edge.

Tag builds generate GitHub provenance attestations for every release asset. For
example, verify a downloaded plugin bundle with:

```bash
gh attestation verify main.js -R yorha2B0826/crosspost-studio
```

WeChat direct connections access:

- `https://api.weixin.qq.com/cgi-bin/token`
- `https://api.weixin.qq.com/cgi-bin/media/uploadimg`
- `https://api.weixin.qq.com/cgi-bin/material/add_material`
- `https://api.weixin.qq.com/cgi-bin/draft/add`
- `https://api.weixin.qq.com/cgi-bin/draft/update`

The extension only requests `storage`, `scripting`, `tabs`, and
`http://127.0.0.1/*` (to read one-shot local resources); the twelve browser-platform
hosts are optional permissions requested on demand — no `cookies`. CI audits the
final manifest and common secret patterns.

## Note Frontmatter

```yaml
crosspost:
  title: optional, defaults to file name
  author: optional
  summary: optional
  cover: "[[cover.png]]"
  targets: [wechat, zhihu, juejin, csdn, oschina, cnblogs, jianshu, segmentfault, 51cto, baijiahao, toutiao, bilibili, tencentcloud]
  bindings:
    wechat:
      draftId: ""
      sourceHash: ""
      updatedAt: ""
    zhihu:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    juejin:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    csdn:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    oschina:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    cnblogs:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    jianshu:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    segmentfault:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    51cto:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    baijiahao:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    toutiao:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    bilibili:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    tencentcloud:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
```

After a successful save only the target platform binding is updated via
`FileManager.processFrontMatter`; other frontmatter fields and platform bindings
are preserved.

## Acceptance

[`test-vault/验收文章.md`](test-vault/%E9%AA%8C%E6%94%B6%E6%96%87%E7%AB%A0.md)
contains Chinese text, headings, lists, tables, code, local/remote images,
inline/block formulas, and a Mermaid flowchart.

Real acceptance should use dedicated test accounts, verifying first draft creation,
draft-link write-back, and second-save update for each platform in sequence. Login
and draft saving must be explicitly authorized by the account holder; final
publishing is always manual. CSDN, OSChina, BlogsCN, Jian Shu, SegmentFault,
51CTO, Baijiahao, Toutiao, Bilibili Columns, and Tencent Cloud Developer
Community have passed offline DOM fixture, image-paste
state-machine, and build checks but have not yet claimed real account verification.

## Security & Privacy

See [SECURITY.md](SECURITY.md). This project collects no telemetry, does not write
credentials into the repository, does not read browser cookies, and does not
restore or persist article body text across extension restarts.

### Network & Account Disclosure

- WeChat publishing sends the current article, cover, and images to the WeChat
  official API; it requires your own Official Account AppID, AppSecret, draft
  interface permissions, and IP allowlisting.
- Browser platforms only send the current article snapshot over `127.0.0.1` to the
  local extension when the user explicitly saves a draft; the extension then writes
  into the visible editor where the user is already logged in.
- Remote images in notes are downloaded from their original URLs during preview or
  publishing preparation in order to be packaged as platform resources.
- All platforms only create or update drafts; final publishing, platform login, and
  account authorization are always completed by the user.

## License

[MIT](LICENSE). This project is an independent implementation — it does not fork
mdnice and does not copy its GPL-3.0 code.

## Open-Source References & Licensing Boundaries

The platform list, Markdown/HTML output differences, and draft-idempotency approach
were informed by [wechatsync/Wechatsync](https://github.com/wechatsync/Wechatsync).
That project is GPL-3.0 and some of its adapters work via cookies, private
interfaces, and request-header rewriting; Crosspost Studio has not copied those
implementations and uses only independently-written visible-editor DOM adapters to
remain compliant with the MIT license and the zero-cookie/zero-private-interface
boundary. Platform entry URLs and strict draft URL allowlists are verified
independently before an adapter is enabled.

## Official References

- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage)
- [Obsidian 1.11.5 Changelog](https://obsidian.md/changelog/2026-01-20-desktop-v1.11.5/)
- [WXT](https://wxt.dev/)
- [Chrome Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Bilibili Creator Center column editor](https://member.bilibili.com/platform/upload/text/apply)
- [Tencent Cloud: Publish a developer article](https://cloud.tencent.com/document/product/1212/42695)

---

# Crosspost Studio (中文)

Crosspost Studio 是一个本地优先的桌面插件与 Chromium 扩展，用同一篇 Markdown
源稿创建或更新微信公众号、知乎、掘金、CSDN、开源中国、博客园、简书、思否、
51CTO、百家号、今日头条、B站专栏和腾讯云开发者社区草稿。它只保存草稿，不执行最终发布。

> 当前状态：可构建的 MVP。DOM 适配器已用离线 fixture 测试；真实平台草稿仍应使用
> 专用测试账号逐项验收后再用于正式内容。

## 设计边界

- Obsidian 笔记始终是唯一源稿。
- 微信公众号通过官方素材与草稿 API；AppSecret 存在 Obsidian SecretStorage。
- 所有浏览器平台只操作用户已登录的可见编辑器，不调用私有 API，也不读取 Cookie。
- 插件与扩展仅通过 `127.0.0.1` 通信；没有云端中转、遥测或文章正文持久化。
- 任何平台失败都不会回滚其他平台草稿。
- 创建请求结果不确定时记录为 `unknown` 并锁住自动重建，防止重复草稿。

## 仓库结构

```text
apps/
  obsidian-plugin/   ItemView、预览、SecretStorage、微信 API、本地 bridge
  browser-extension/ WXT/MV3 扩展、按需权限、可见编辑器适配
packages/
  core/              Markdown AST、嵌入、图片去重、主题、CSS 内联与渲染适配器
  protocol/          版本化消息 schema、HMAC 配对、运行时校验与脱敏
test-vault/          与主 Vault 隔离的验收样例（不包含 .obsidian 状态）
```

## 支持范围

- Obsidian Desktop 1.11.5+，macOS 或 Windows
- Chromium 116+，Chrome 或 Edge
- GFM、Obsidian 图片嵌入、代码块、表格、Mermaid、行内与行间 LaTeX
- Minimal、Academic、Tech 三套内置主题
- Vault 内自定义 CSS；仅接受以 `#crosspost-root` 作用域开头且位于白名单内的属性

## 本地开发

需要 Node.js 24 和 pnpm 11.18。依赖全部安装在项目内：

```bash
pnpm install
pnpm check
pnpm release:package
```

发布物位于：

- `dist/main.js`、`dist/manifest.json`、`dist/styles.css`（供构建审核发现）
- `dist/obsidian/main.js`
- `dist/obsidian/manifest.json`
- `dist/obsidian/styles.css`
- `dist/chromium/*.zip`

开发插件时请创建独立测试 Vault，不要直接在主 Vault 开发。将上面三个文件放入测试
Vault 的 `.obsidian/plugins/crosspost-studio/`，再启用插件。Chromium 扩展开发构建
位于 `apps/browser-extension/.output/chrome-mv3/`，可在浏览器扩展页面以
"加载已解压的扩展"方式加载。

## 首次配置

1. 在 Obsidian 中打开 Crosspost Studio 设置。
2. 选择或创建 SecretStorage 中的微信 AppSecret；普通设置只保留密钥名称。
3. 如需微信，填写 AppID，并确认账号具备素材/草稿权限且当前公网 IP 已加入白名单。
4. 点击"Copy pairing key"，把密钥粘贴到扩展弹窗。
5. 仅为需要的平台点击对应"启用"按钮。浏览器会在此时请求该站域名权限。
6. 登录平台并保持可见草稿编辑器可访问，然后从工作台保存草稿。

## 安装

Obsidian 社区目录审核完成后，可在 **设置 → 第三方插件 → 浏览** 中搜索
"Crosspost Studio"。审核期间可以从
[GitHub Releases](https://github.com/yorha2B0826/crosspost-studio/releases)
下载 `main.js`、`manifest.json` 和 `styles.css`，放入
`<Vault>/.obsidian/plugins/crosspost-studio/`。

微信公众号只需要 Obsidian 插件。版本号对应的 Obsidian Release 会刻意只包含
`main.js`、`manifest.json` 和 `styles.css`。其余十二个平台还需要独立的
`browser-<version>` Release 中的 Chromium 扩展 ZIP；解压后在 Chrome 或 Edge
的扩展管理页面选择“加载已解压的扩展”。

标签构建会为每个发布物生成 GitHub provenance attestation。例如可这样验证下载的
插件文件：

```bash
gh attestation verify main.js -R yorha2B0826/crosspost-studio
```

微信直连会访问：

- `https://api.weixin.qq.com/cgi-bin/token`
- `https://api.weixin.qq.com/cgi-bin/media/uploadimg`
- `https://api.weixin.qq.com/cgi-bin/material/add_material`
- `https://api.weixin.qq.com/cgi-bin/draft/add`
- `https://api.weixin.qq.com/cgi-bin/draft/update`

扩展只申请 `storage`、`scripting`、`tabs` 和 `http://127.0.0.1/*`（读取一次性本地
资源）；十个浏览器平台的域名都是按需申请的可选权限，不申请 `cookies`。CI 会审计
最终 manifest 以及常见密钥特征。

## 笔记 frontmatter

```yaml
crosspost:
  title: 可选，默认使用文件名
  author: 可选
  summary: 可选
  cover: "[[cover.png]]"
  targets: [wechat, zhihu, juejin, csdn, oschina, cnblogs, jianshu, segmentfault, 51cto, baijiahao, toutiao, bilibili, tencentcloud]
  bindings:
    wechat:
      draftId: ""
      sourceHash: ""
      updatedAt: ""
    zhihu:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    juejin:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    csdn:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    oschina:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    cnblogs:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    jianshu:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    segmentfault:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    51cto:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    baijiahao:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    toutiao:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    bilibili:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
    tencentcloud:
      draftUrl: ""
      sourceHash: ""
      updatedAt: ""
```

保存成功后只通过 `FileManager.processFrontMatter` 更新对应平台 binding，其他
frontmatter 字段和平台 binding 会保留。

## 验收

[`test-vault/验收文章.md`](test-vault/%E9%AA%8C%E6%94%B6%E6%96%87%E7%AB%A0.md)
包含中文、标题、列表、表格、代码、本地/远程图片、行内/行间公式和 Mermaid 流程图。

真实验收应使用专用测试账号，依次验证各平台首次建稿、草稿链接回写，以及第二次保存
更新原草稿。登录与草稿保存必须由账号持有人明确授权；最终发布始终人工完成。CSDN、
开源中国、博客园、简书、思否、51CTO、百家号、今日头条、B站专栏和腾讯云开发者社区目前已通过离线 DOM fixture、
图片粘贴状态机和构建检查，尚未宣称完成真实账号验收。

## 安全与隐私

参见 [SECURITY.md](SECURITY.md)。本项目不收集遥测，不把凭据写入仓库，不读取浏览器
Cookie，也不会在扩展重启后恢复或持久化文章正文。

### 网络与账号披露

- 微信发布会把当前文章、封面和图片发送到微信官方 API，需要用户自己的公众号 AppID、
  AppSecret、草稿接口权限和 IP 白名单。
- 浏览器平台只在用户主动保存草稿时，把当前文章快照经 `127.0.0.1` 发送到本机扩展，
  再写入用户已登录的可见编辑器。
- 笔记中的远程图片会在预览或发布准备阶段从其原始 URL 下载，以便打包为平台资源。
- 所有平台只创建或更新草稿；最终发布、平台登录和账号授权始终由用户完成。

## 许可证

[MIT](LICENSE)。本项目是独立实现，不 fork mdnice，也不复制其 GPL-3.0 代码。

## 开源实现参考与许可边界

平台清单、Markdown/HTML 输出差异和草稿幂等思路参考了
[wechatsync/Wechatsync](https://github.com/wechatsync/Wechatsync)。该项目使用
GPL-3.0，且其部分适配器通过 Cookie、私有接口与请求头改写工作；Crosspost Studio
没有复制这些实现，只采用独立编写的可见编辑器 DOM 适配器，以继续满足 MIT 许可和
零 Cookie/零私有接口边界。启用适配器前会独立验证平台写作入口和严格的草稿 URL
白名单。

## 官方参考

- [Obsidian 插件模板](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage)
- [Obsidian 1.11.5 更新说明](https://obsidian.md/changelog/2026-01-20-desktop-v1.11.5/)
- [WXT](https://wxt.dev/)
- [Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome 扩展 WebSocket 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [B站创作中心专栏编辑器](https://member.bilibili.com/platform/upload/text/apply)
- [腾讯云开发者社区：发表文章](https://cloud.tencent.com/document/product/1212/42695)
