# Contributing

1. Use Node 24 and the pnpm version declared in the repository; do not install
   global project dependencies.
2. Use a dedicated test vault; never copy your real vault's `.obsidian`, plugin
   data, accounts, or articles into the repository.
3. Run `pnpm check`, and add the narrowest regression test for any transform,
   protocol, or DOM-selector change.
4. Platform adapters may only operate on the visible DOM and public page
   behavior; do not add cookie permissions or private APIs.
5. Never treat "editor populated" as "draft saved". Success must come from an
   explicit save signal and an identifiable draft URL.
6. Stop on page-structure mismatch, missing login, or uncertain creation outcome
   — do not silently recreate drafts.

Real-platform testing must use dedicated test accounts; final publishing is
always manual.

## Adding a platform adapter

Registering a new platform touches every item below. When one is missed,
`audit-build` blocks CI — that failure is expected and points at the skipped
step:

1. `apps/browser-extension/src/lib/platforms.ts` — add the entry to
   `PLATFORM_ORIGINS` and register its draft URL pattern. Draft URL patterns
   must be anchored regular expressions (e.g. matching `/write/…` or `/md/…`
   from the origin), so generic create pages are never accepted as saved
   drafts.
2. `apps/browser-extension/src/lib/i18n.ts` — user-visible strings.
3. `scripts/platform-origins.json` — the single source of truth for platform
   origins, shared by the WXT manifest build and `audit-build`; do not
   duplicate origin lists anywhere else.
4. `apps/browser-extension/src/lib/dom/definitions.ts` — the visible-editor
   adapter definition.
5. The popup enable flow — the platform appears as an opt-in toggle that
   requests its host permission only when enabled.
6. Optionally, a draft-verification module returning `{ verified, diagnostic }`
   so a save can be confirmed against the platform after the fact.
7. An offline fixture in `dom-adapter.test.ts` covering the editor flow.
8. The README targets and bindings lists.

---

## 贡献指南 (中文)

1. 使用 Node 24 与仓库声明的 pnpm 版本，不安装全局项目依赖。
2. 使用独立测试 Vault；不要把真实 Vault 的 `.obsidian`、插件数据、账号或文章复制进仓库。
3. 运行 `pnpm check`，并为转换、协议或 DOM 选择器变更添加最窄的回归测试。
4. 平台适配器只能操作可见 DOM 和公开页面行为；不得添加 Cookie 权限或私有 API。
5. 不得把"编辑器已填充"当作"草稿已保存"。成功必须来自明确的保存信号和可识别草稿 URL。
6. 页面结构不匹配、登录态缺失或创建结果不确定时应停止，不能静默重建草稿。

真实平台测试必须使用专用账号，最终发布保持人工操作。

## 新增平台适配器

登记一个新平台需要完成下面每一项；漏掉任何一项时 `audit-build` 会在 CI 拦下——
这类失败是预期行为，用于指出遗漏的步骤：

1. `apps/browser-extension/src/lib/platforms.ts` — 在 `PLATFORM_ORIGINS` 中加入
   平台并登记草稿 URL 模式。草稿 URL 模式必须是锚定正则（例如从域名起匹配
   `/write/…` 或 `/md/…`），保证通用新建页不会被当作已保存草稿。
2. `apps/browser-extension/src/lib/i18n.ts` — 用户可见文案。
3. `scripts/platform-origins.json` — 平台 origin 的单一来源，WXT manifest 构建
   与 `audit-build` 共用；不要在其他位置重复维护 origin 清单。
4. `apps/browser-extension/src/lib/dom/definitions.ts` — 可见编辑器适配器定义。
5. popup 启用流程——平台以按需开关形式出现，仅在启用时请求对应域名权限。
6. 可选的草稿校验模块，返回 `{ verified, diagnostic }`，用于保存后向平台核实结果。
7. `dom-adapter.test.ts` 中的离线 fixture，覆盖编辑器流程。
8. README 的 targets 与 bindings 列表。