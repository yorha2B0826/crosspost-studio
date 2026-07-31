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

---

## 贡献指南 (中文)

1. 使用 Node 24 与仓库声明的 pnpm 版本，不安装全局项目依赖。
2. 使用独立测试 Vault；不要把真实 Vault 的 `.obsidian`、插件数据、账号或文章复制进仓库。
3. 运行 `pnpm check`，并为转换、协议或 DOM 选择器变更添加最窄的回归测试。
4. 平台适配器只能操作可见 DOM 和公开页面行为；不得添加 Cookie 权限或私有 API。
5. 不得把"编辑器已填充"当作"草稿已保存"。成功必须来自明确的保存信号和可识别草稿 URL。
6. 页面结构不匹配、登录态缺失或创建结果不确定时应停止，不能静默重建草稿。

真实平台测试必须使用专用账号，最终发布保持人工操作。