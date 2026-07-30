# Crosspost Studio

Crosspost Studio 是一个本地优先的 Obsidian 桌面插件与 Chromium 扩展，用同一篇
Markdown 源稿创建或更新微信公众号、知乎、掘金、CSDN、开源中国和博客园草稿。它只
保存草稿，不执行最终发布。

> 当前状态：可构建的 MVP。DOM 适配器已用离线 fixture 测试；真实平台草稿仍应使用专用
> 测试账号逐项验收后再用于正式内容。

> 社区插件状态：首个公开版本正在提交 Obsidian 社区目录。在审核完成前，可从 GitHub
> Release 手动安装。

## 设计边界

- Obsidian 笔记始终是唯一源稿。
- 微信公众号通过官方素材与草稿 API；AppSecret 存在 Obsidian SecretStorage。
- 知乎、掘金、CSDN、开源中国和博客园只操作用户已登录的可见编辑器，不调用私有 API，
  也不读取 Cookie。
- 插件与扩展仅通过 `127.0.0.1` 通信；没有云端中转、遥测或文章正文持久化。
- 任何平台失败都不会回滚其他平台草稿。
- 创建请求结果不确定时记录为 `unknown` 并锁住自动重建，防止重复草稿。

## 仓库结构

```text
apps/
  obsidian-plugin/   Obsidian ItemView、预览、SecretStorage、微信 API、本地 bridge
  browser-extension/ WXT/MV3 扩展、按需权限、五个平台的可见编辑器适配
packages/
  core/              Markdown AST、Obsidian 嵌入、MathJax、图片去重、主题与 CSS 内联
  protocol/          版本化消息 schema、HMAC 配对、运行时校验与脱敏
test-vault/          与主 Vault 隔离的验收样例（不包含 .obsidian 状态）
```

## 支持范围

- Obsidian Desktop 1.11.5+，macOS 或 Windows
- Chromium 116+，Chrome 或 Edge
- GFM、Obsidian 图片嵌入、代码块、表格、Mermaid、行内与行间 LaTeX
- Minimal、Academic、Tech 三套内置主题
- Vault 内自定义 CSS；仅接受以 `#crosspost-root` 作用域开头且位于白名单内的属性

知乎通过可见的官方编辑器“公式”工具写入原生 LaTeX 节点，保留可编辑的 `data-tex`
源。其他平台使用 MathJax SVG 源生成透明高清 PNG；行内公式按 `1em` 逻辑高度和基线显示，
实际像素密度更高。公众号素材接口不接受 SVG 图片，因此不能把 SVG 作为最终微信素材上传。
公式和普通图片都按 SHA-256 内容哈希去重。

CSDN、开源中国和博客园首版使用各站可见的 Markdown 编辑器。扩展把本地图片和公式图片
作为文件粘贴到编辑器，并等待编辑器把一次性占位符替换为远程图片 URL；任一图片未被确认
上传时，任务会停止并标记为结果待确认，不会自动再建一篇草稿。

Mermaid 代码块会在本地以严格安全模式渲染为经过清洗的确定性 SVG；浏览器平台使用 SVG
图片，微信公众号自动转换为透明高清 PNG。SVG 和 PNG 都参与 SHA-256 去重。语法错误、
外部 SVG 资源或超过 50,000 字符的图表会阻止保存草稿并给出明确诊断。

Dataview、PDF、视频和嵌入笔记在 MVP 中只显示兼容性警告，不会静默丢弃。

## 本地开发

需要 Node.js 24 和 pnpm 11.18。依赖全部安装在项目内：

```bash
pnpm install
pnpm check
pnpm release:package
```

发布物位于：

- `dist/obsidian/main.js`
- `dist/obsidian/manifest.json`
- `dist/obsidian/styles.css`
- `dist/chromium/*.zip`

开发插件时请创建独立测试 Vault，不要直接在主 Vault 开发。将上面三个 Obsidian 文件放入
测试 Vault 的 `.obsidian/plugins/crosspost-studio/`，再启用插件。Chromium 扩展开发构建
位于 `apps/browser-extension/.output/chrome-mv3/`，可在浏览器扩展页面以“加载已解压的扩展”
方式加载。

## 首次配置

1. 在 Obsidian 中打开 Crosspost Studio 设置。
2. 选择或创建 SecretStorage 中的微信 AppSecret；普通设置只保留密钥名称。
3. 如需微信，填写 AppID，并确认账号具备素材/草稿权限且当前公网 IP 已加入白名单。
4. 点击“Copy pairing key”，把密钥粘贴到扩展弹窗。
5. 仅为需要的平台点击对应“启用”按钮。浏览器会在此时请求该站域名权限。
6. 登录平台并保持可见草稿编辑器可访问，然后从工作台保存草稿。

## 安装

Obsidian 社区目录审核完成后，可在 **设置 → 第三方插件 → 浏览** 中搜索
“Crosspost Studio”。审核期间可以从
[GitHub Releases](https://github.com/yorha2B0826/crosspost-studio/releases)
下载 `main.js`、`manifest.json` 和 `styles.css`，放入
`<Vault>/.obsidian/plugins/crosspost-studio/`。

微信公众号只需要 Obsidian 插件。知乎、掘金、CSDN、开源中国和博客园还需要同一
Release 中的 Chromium 扩展 ZIP；解压后在 Chrome 或 Edge 的扩展管理页面选择
“加载已解压的扩展”。

微信直连会访问：

- `https://api.weixin.qq.com/cgi-bin/token`
- `https://api.weixin.qq.com/cgi-bin/media/uploadimg`
- `https://api.weixin.qq.com/cgi-bin/material/add_material`
- `https://api.weixin.qq.com/cgi-bin/draft/add`
- `https://api.weixin.qq.com/cgi-bin/draft/update`

扩展只申请 `storage`、`scripting`、`tabs` 和
`http://127.0.0.1/*`（读取一次性本地资源）；五个浏览器平台的域名都是按需申请的可选
权限，不申请 `cookies`。CI 会审计最终 manifest 以及常见密钥特征。

## 笔记 frontmatter

```yaml
crosspost:
  title: 可选，默认使用文件名
  author: 可选
  summary: 可选
  cover: "[[cover.png]]"
  targets: [wechat, zhihu, juejin, csdn, oschina, cnblogs]
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
```

保存成功后只通过 `FileManager.processFrontMatter` 更新对应平台 binding，其他 frontmatter
字段和平台 binding 会保留。

## 验收

[`test-vault/验收文章.md`](test-vault/%E9%AA%8C%E6%94%B6%E6%96%87%E7%AB%A0.md)
包含中文、标题、列表、表格、代码、本地/远程图片、行内/行间公式和 Mermaid 流程图。

真实验收应使用专用测试账号，依次验证各平台首次建稿、草稿链接回写，以及第二次保存更新
原草稿。登录与草稿保存必须由账号持有人明确授权；最终发布始终人工完成。CSDN、开源中国
和博客园目前已通过离线 DOM fixture、图片粘贴状态机和构建检查，尚未宣称完成真实账号验收。

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
[wechatsync/Wechatsync](https://github.com/wechatsync/Wechatsync)。该项目使用 GPL-3.0，
且其部分适配器通过 Cookie、私有接口与请求头改写工作；Crosspost Studio 没有复制这些实现，
只采用独立编写的可见编辑器 DOM 适配器，以继续满足 MIT 许可和零 Cookie/零私有接口边界。
SegmentFault 的历史写作入口在 2026-07-31 的匿名探测中返回 HTTP 410，因此本次未加入。

## 官方参考

- [Obsidian 插件模板](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage)
- [Obsidian 1.11.5 更新说明](https://obsidian.md/changelog/2026-01-20-desktop-v1.11.5/)
- [WXT](https://wxt.dev/)
- [Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome 扩展 WebSocket 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
