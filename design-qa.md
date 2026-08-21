# Design QA

## Target

- Reference: [`docs/design-audit/2026-07-31/03-obsidian-redesigned.jpg`](docs/design-audit/2026-07-31/03-obsidian-redesigned.jpg)
- Requested change: align the bottom of the platform preview panel with the bottom of the right-hand status column.
- Verification surface: Obsidian 1.12.7 using the repository's isolated `test-vault`.

## Comparison

- The original desktop layout left unused space below the preview panel while the status column continued lower.
- The updated desktop layout stretches both grid children to the same row height.
- The preview stage fills the added height and keeps its own scrolling behavior.
- The final screenshot shows the preview panel and status panel sharing the same bottom baseline.
- The responsive stacked layouts remain unchanged because flex growth has no extra parent height there.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: none.

Final result: passed.

---

## 2026-08-21 显示优化（布局与信息密度 + 视觉风格）

- Reference: [`docs/design-audit/2026-08-21/`](docs/design-audit/2026-08-21/)（01/02 基线 vs 03/04 改后，亮暗各一）
- Verification surface: Obsidian 1.13.7（test-vault），主区域标签页打开 Crosspost studio，验收文章预览就绪后截图对比（3024×1898 Retina）。

### Changes

- `apps/obsidian-plugin/src/view.ts`（renderShell 结构微调，仅 2 处）
  - hero 标题区：eyebrow 与 h2 收进 `crosspost-hero-title` 同一行容器。
  - 平台 chip：移除 `crosspost-platform-copy`（strong+small 两行文案），通道信息改挂 `title` 属性（悬停提示），平台名改为单个 `crosspost-platform-name` span。
- `apps/obsidian-plugin/styles.css`
  - 标题区：`crosspost-hero-title` flex baseline 对齐，h2 margin 归零。
  - 平台 chip：`border-radius: 999px` 单行圆角 pill；去掉 `min-width: 8.75rem`；padding 收紧；平台名 semibold + nowrap。
  - 预览区高度：`crosspost-main` `flex: 0 0 auto` → `flex: 1 1 auto`；`crosspost-preview-stage` `height: clamp(18rem, 34vh, 22rem)` → `min-height: 18rem`（移除 22rem 上限，吃满可用高度）。
  - 预览 tabs：去掉 `min-width: 5rem`，padding 由 `size-2-2` 收紧为 `size-2-1`，加 nowrap。
  - 暗色适配：新增 `.theme-dark .crosspost-preview-frame`（边框 `rgba(255,255,255,.16)`，阴影 `0 12px 36px rgba(0,0,0,.45)`），白色预览卡片在暗色下边框阴影自然。
  - 变量化：`.crosspost-preview-loading` 硬编码 `#6a737d` → `var(--text-muted)`；删除重复的 `.crosspost-css-snippet-field` 规则。

### Findings（截图对比，03/04 vs 01/02）

1. 标题区变紧凑：eyebrow「LOCAL-FIRST PUBLISHING」与「发布工作台」基线同行，hero 纵向占用明显减小。✅
2. 平台选择 pill 化：13 个平台单行圆角 pill（复选框 + 平台名），无通道小字（通道信息保留在 title 悬停提示，AX 树以 Description 承载，无信息丢失）。✅
3. 预览区变高：移除 22rem 上限后预览纵向展示 1.1 列表至 1.6 Mermaid 全部小节，右侧状态列与预览同底对齐。✅
4. 预览 tabs 更紧凑：去掉 min-width + 收紧 padding，tabs 行与宽度切换/放大按钮同排。✅
5. 暗色主题：白色预览卡片新增暗色专属边框与深阴影，无生硬白边或晕染。✅
- P0–P3: none。

Final result: passed.

### Addendum 2026-08-21 · 操作按钮分组重排（05/06 实测）

- Reference: `docs/design-audit/2026-08-21/05-actions-light.jpg` / `06-actions-dark.jpg`
- `view.ts`：renderShell 内将操作按钮包进两个 `crosspost-action-group`（左侧：排版主题 + 刷新预览；右侧：复制分段控件 + 保存主按钮）；两个复制按钮收进 `crosspost-copy-group`。
- `styles.css`：控制卡改为纵向布局，操作行整行显示并以 border-top 与平台选择区分隔；`space-between` 拉开左右两组；排版主题标签与下拉框同行；复制双按钮合并为带竖分割线的分段控件（去独立边框/圆角，hover 高亮）。
- 实测确认（亮/暗双主题）：6 个控件单行排布无换行错位，主按钮居最右醒目，分段控件视觉为一体。

Final result: passed.
