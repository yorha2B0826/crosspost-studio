import type { ThemeId } from "@crosspost/core";
import { PLATFORM_IDS } from "@crosspost/protocol";
import type { Diagnostic, JobState, PlatformId } from "@crosspost/protocol";
import {
  ItemView,
  MarkdownView,
  Notice,
  sanitizeHTMLToDom,
  TFile
} from "obsidian";
import type { WorkspaceLeaf } from "obsidian";

import type CrosspostStudioPlugin from "./main.js";
import type { PublishStatusUpdate } from "./main.js";

export const CROSSPOST_VIEW_TYPE = "crosspost-studio-view";

const PLATFORMS = PLATFORM_IDS;

const PLATFORM_LABELS: Record<PlatformId, string> = {
  cnblogs: "博客园",
  csdn: "CSDN",
  jianshu: "简书",
  juejin: "掘金",
  oschina: "开源中国",
  wechat: "微信公众号",
  zhihu: "知乎"
};

const PLATFORM_CHANNELS: Record<PlatformId, string> = {
  cnblogs: "浏览器扩展",
  csdn: "浏览器扩展",
  jianshu: "浏览器扩展",
  juejin: "浏览器扩展",
  oschina: "浏览器扩展",
  wechat: "官方 API",
  zhihu: "浏览器扩展"
};

const PLATFORM_PREVIEW_LABELS: Record<PlatformId, string> = {
  cnblogs: "博客园",
  csdn: "CSDN",
  jianshu: "简书",
  juejin: "掘金",
  oschina: "开源中国",
  wechat: "公众号",
  zhihu: "知乎"
};

const THEME_LABELS: Record<ThemeId, string> = {
  academic: "学术",
  minimal: "简约",
  tech: "科技"
};

const STATE_LABELS: Record<JobState, string> = {
  cancelled: "已取消",
  "draft-saved": "已保存",
  failed: "保存失败",
  injecting: "正在写入",
  prepared: "正在准备",
  queued: "等待处理",
  unknown: "结果待确认",
  "waiting-for-login": "等待登录"
};

const DIAGNOSTIC_TITLES: Record<string, string> = {
  "cover-resolution-failed": "封面读取失败",
  "formula-not-rasterized": "公式格式提醒",
  "formula-render-failed": "公式渲染失败",
  "image-not-resolved": "图片尚未打包",
  "image-resolution-failed": "图片读取失败",
  "mermaid-render-failed": "Mermaid 渲染失败",
  "raw-html-escaped": "HTML 已转为安全文本",
  "unsupported-dataview": "Dataview 将保留为代码块",
  "unsupported-embed": "暂不支持该嵌入内容",
  "unsupported-mermaid": "Mermaid 将保留为代码块",
  "wechat-cover-required": "公众号需要封面",
  "wechat-image-format-unsupported": "公众号不支持该图片格式",
  "wechat-image-too-large": "图片超过上传限制",
  "wechat-summary-truncated": "摘要将被截断",
  "wechat-title-too-long": "公众号标题过长"
};

function localizeStatusMessage(message: string): string {
  const messages: Record<string, string> = {
    "Draft saved successfully.": "草稿已成功保存。",
    "Filling the visible editor and waiting for save confirmation.":
      "正在写入可见编辑器，并等待平台确认保存。",
    "Loading one-time article assets from Obsidian.":
      "正在从 Obsidian 读取本次任务所需资源。",
    "Opening the visible platform draft editor.":
      "正在打开可见的草稿编辑器，请保持平台登录。",
    "Preparing an immutable source snapshot…":
      "正在冻结本次源稿快照，后续改动不会混入当前任务。",
    "Sending the draft job to the browser extension…":
      "正在将草稿任务交给浏览器扩展。",
    "Uploading images and saving the WeChat draft…":
      "正在上传图片并保存公众号草稿。"
  };
  return messages[message] ?? message;
}

function localizeDiagnosticMessage(diagnostic: Diagnostic): string {
  const messages: Record<string, string> = {
    "formula-not-rasterized": "公式仍为 SVG；保存草稿前建议确认目标平台是否支持。",
    "mermaid-render-failed": "Mermaid 代码无法渲染，请检查语法后重试。",
    "raw-html-escaped": "为保证输出安全稳定，原始 HTML 已转为普通文本。",
    "unsupported-dataview": "Dataview 暂不渲染，发布时会保留为代码块。",
    "unsupported-mermaid": "Mermaid 暂不渲染，发布时会保留为代码块。",
    "wechat-cover-required": "请在 frontmatter 的 crosspost.cover 中设置封面图片。",
    "wechat-summary-truncated": "公众号只会使用摘要的前 120 个字符。",
    "wechat-title-too-long": "公众号标题最多支持 64 个字符。"
  };
  return messages[diagnostic.code] ?? diagnostic.message;
}

export class CrosspostView extends ItemView {
  private activeFileEl?: HTMLElement;
  private activePlatform: PlatformId = "wechat";
  private bridgeActivityEl?: HTMLElement;
  private diagnosticsEl?: HTMLElement;
  private diagnosticSummaryEl?: HTMLElement;
  private isPublishing = false;
  private previewEl?: HTMLElement;
  private previewGeneration = 0;
  private previewMetaEl?: HTMLElement;
  private previewTitleEl?: HTMLElement;
  private publishButton?: HTMLButtonElement;
  private refreshTimer?: number;
  private readonly platformCheckboxes = new Map<PlatformId, HTMLInputElement>();
  private readonly platformLabels = new Map<PlatformId, HTMLElement>();
  private readonly platformTabs = new Map<PlatformId, HTMLButtonElement>();
  private selectedPlatforms = new Set<PlatformId>(["wechat", "zhihu", "juejin"]);
  private sourceFile?: TFile;
  private readonly statusCards = new Map<PlatformId, HTMLElement>();
  private statusesEl?: HTMLElement;
  private theme: ThemeId;
  private unsubscribeBridge?: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: CrosspostStudioPlugin
  ) {
    super(leaf);
    this.theme = plugin.settings.theme;
  }

  getViewType(): string {
    return CROSSPOST_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Crosspost Studio";
  }

  getIcon(): string {
    return "send";
  }

  async onOpen(): Promise<void> {
    this.renderShell();
    this.syncTargetsFromFile();
    this.renderStoredStatuses();
    this.unsubscribeBridge = this.plugin.onBridgeProgress((progress) => {
      if (!this.bridgeActivityEl) {
        return;
      }
      this.bridgeActivityEl.dataset.state = progress.state;
      this.bridgeActivityEl.setText(localizeStatusMessage(progress.message));
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.syncTargetsFromFile();
        this.renderStoredStatuses();
        void this.refreshPreview();
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path !== this.getActiveFile()?.path) {
          return;
        }
        this.syncTargetsFromFile();
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.path !== this.getActiveFile()?.path) {
          return;
        }
        if (this.refreshTimer !== undefined) {
          window.clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = window.setTimeout(() => {
          void this.refreshPreview();
        }, 500);
      })
    );
    await this.refreshPreview();
  }

  onClose(): Promise<void> {
    this.unsubscribeBridge?.();
    if (this.refreshTimer !== undefined) {
      window.clearTimeout(this.refreshTimer);
    }
    return Promise.resolve();
  }

  private renderShell(): void {
    const root = this.containerEl.children[1];
    if (!(root instanceof HTMLElement)) {
      return;
    }
    root.empty();
    root.addClass("crosspost-view");

    const hero = root.createDiv({ cls: "crosspost-hero" });
    const heroCopy = hero.createDiv();
    heroCopy.createDiv({ cls: "crosspost-eyebrow", text: "LOCAL-FIRST PUBLISHING" });
    heroCopy.createEl("h2", { text: "发布工作台" });
    this.activeFileEl = heroCopy.createDiv({ cls: "crosspost-active-file" });
    hero.createDiv({ cls: "crosspost-draft-badge", text: "仅保存草稿" });

    const controls = root.createDiv({ cls: "crosspost-controls" });
    const targetGroup = controls.createDiv({ cls: "crosspost-control-group" });
    targetGroup.createDiv({ cls: "crosspost-control-label", text: "发布到" });
    const platforms = targetGroup.createDiv({ cls: "crosspost-platforms" });
    for (const platform of PLATFORMS) {
      const chip = platforms.createEl("label", { cls: "crosspost-platform-chip" });
      this.platformLabels.set(platform, chip);
      const checkbox = chip.createEl("input", {
        attr: { "aria-label": `将草稿保存到${PLATFORM_LABELS[platform]}` },
        type: "checkbox"
      });
      this.platformCheckboxes.set(platform, checkbox);
      checkbox.checked = this.selectedPlatforms.has(platform);
      const copy = chip.createDiv({ cls: "crosspost-platform-copy" });
      copy.createEl("strong", { text: PLATFORM_LABELS[platform] });
      copy.createEl("small", { text: PLATFORM_CHANNELS[platform] });
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedPlatforms.add(platform);
        } else {
          this.selectedPlatforms.delete(platform);
        }
        this.updatePlatformControls();
      });
    }

    const actions = controls.createDiv({ cls: "crosspost-actions" });
    const themeField = actions.createEl("label", { cls: "crosspost-theme-field" });
    themeField.createSpan({ text: "排版主题" });
    const themeSelect = themeField.createEl("select", {
      attr: { "aria-label": "排版主题" }
    });
    for (const [value, label] of Object.entries(THEME_LABELS)) {
      const option = themeSelect.createEl("option", {
        text: label,
        value
      });
      option.selected = value === this.theme;
    }
    themeSelect.addEventListener("change", () => {
      this.theme = themeSelect.value as ThemeId;
      void this.refreshPreview();
    });

    const refreshButton = actions.createEl("button", {
      attr: { type: "button" },
      cls: "crosspost-secondary-action",
      text: "刷新预览"
    });
    refreshButton.addEventListener("click", () => {
      void this.refreshPreview();
    });

    this.publishButton = actions.createEl("button", {
      attr: { type: "button" },
      cls: "mod-cta crosspost-publish-action"
    });
    this.publishButton.addEventListener("click", () => {
      if (this.publishButton) {
        void this.publishSelected(this.publishButton);
      }
    });

    const main = root.createDiv({ cls: "crosspost-main" });
    const previewPanel = main.createDiv({ cls: "crosspost-preview-panel" });
    const previewHeader = previewPanel.createDiv({ cls: "crosspost-preview-header" });
    const previewHeading = previewHeader.createDiv();
    previewHeading.createDiv({ cls: "crosspost-section-label", text: "平台预览" });
    this.previewTitleEl = previewHeading.createEl("h3");
    this.previewMetaEl = previewHeading.createDiv({ cls: "crosspost-preview-meta" });
    const previewTabs = previewHeader.createDiv({
      attr: { "aria-label": "选择预览平台", role: "tablist" },
      cls: "crosspost-preview-tabs"
    });
    for (const platform of PLATFORMS) {
      const tab = previewTabs.createEl("button", {
        attr: {
          "aria-selected": String(this.activePlatform === platform),
          role: "tab",
          type: "button"
        },
        text: PLATFORM_LABELS[platform]
      });
      this.platformTabs.set(platform, tab);
      tab.addEventListener("click", () => {
        this.activePlatform = platform;
        this.updatePlatformControls();
        void this.refreshPreview();
      });
    }
    const previewStage = previewPanel.createDiv({ cls: "crosspost-preview-stage" });
    const previewFrame = previewStage.createDiv({ cls: "crosspost-preview-frame" });
    this.previewEl = previewFrame.createDiv({ cls: "crosspost-preview" });

    const side = main.createDiv({ cls: "crosspost-side" });
    const diagnosticPanel = side.createDiv({ cls: "crosspost-panel" });
    const diagnosticHeading = diagnosticPanel.createDiv({
      cls: "crosspost-panel-heading"
    });
    diagnosticHeading.createDiv({ cls: "crosspost-section-label", text: "发布前检查" });
    diagnosticHeading.createEl("h3", { text: "兼容性" });
    this.diagnosticSummaryEl = diagnosticPanel.createDiv({
      cls: "crosspost-diagnostic-summary"
    });
    this.diagnosticsEl = diagnosticPanel.createDiv({
      cls: "crosspost-diagnostics"
    });

    const statusPanel = side.createDiv({ cls: "crosspost-panel" });
    const statusHeading = statusPanel.createDiv({ cls: "crosspost-panel-heading" });
    statusHeading.createDiv({ cls: "crosspost-section-label", text: "最近任务" });
    statusHeading.createEl("h3", { text: "草稿状态" });
    this.bridgeActivityEl = statusPanel.createDiv({
      cls: "crosspost-bridge-activity",
      text: "浏览器扩展空闲"
    });
    this.statusesEl = statusPanel.createDiv({ cls: "crosspost-statuses" });

    root.createDiv({
      cls: "crosspost-safety-note",
      text: "Obsidian 笔记始终是唯一源稿。Crosspost Studio 只创建或更新平台草稿，不会执行最终发布。"
    });
    this.updatePlatformControls();
  }

  private getActiveFile(): TFile | undefined {
    const file = this.app.workspace.getActiveFile();
    if (file instanceof TFile) {
      this.sourceFile = file;
      return file;
    }
    if (this.sourceFile && this.app.vault.getAbstractFileByPath(this.sourceFile.path)) {
      return this.sourceFile;
    }
    let openFile: TFile | undefined;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (openFile) {
        return;
      }
      const viewState = leaf.getViewState();
      const path = viewState.type === "markdown" ? viewState.state?.file : undefined;
      if (typeof path !== "string") {
        return;
      }
      const candidate = this.app.vault.getAbstractFileByPath(path);
      if (candidate instanceof TFile) {
        openFile = candidate;
      }
    });
    if (openFile) {
      this.sourceFile = openFile;
      return openFile;
    }
    for (const path of this.app.workspace.getLastOpenFiles()) {
      const recent = this.app.vault.getAbstractFileByPath(path);
      if (recent instanceof TFile && recent.extension === "md") {
        this.sourceFile = recent;
        return recent;
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file instanceof TFile) {
        this.sourceFile = leaf.view.file;
        return leaf.view.file;
      }
    }
    return undefined;
  }

  private async refreshPreview(): Promise<void> {
    const generation = ++this.previewGeneration;
    const file = this.getActiveFile();
    this.updateFileContext(file);
    if (!file || !this.previewEl || !this.diagnosticsEl) {
      this.renderPreviewEmpty("打开一篇 Markdown 笔记后即可检查并预览草稿。");
      return;
    }
    this.previewEl.empty();
    this.previewEl.dataset.state = "loading";
    this.previewEl.createDiv({ cls: "crosspost-preview-loading", text: "正在生成预览…" });
    this.diagnosticsEl.empty();
    this.diagnosticSummaryEl?.setText("正在检查平台兼容性…");
    try {
      const prepared = await this.plugin.prepare(file, this.activePlatform, this.theme);
      if (generation !== this.previewGeneration) {
        return;
      }
      this.previewEl.dataset.state = "ready";
      this.previewEl.replaceChildren(sanitizeHTMLToDom(prepared.previewHtml));
      this.previewTitleEl?.setText(
        `${PLATFORM_PREVIEW_LABELS[this.activePlatform]}预览`
      );
      this.previewMetaEl?.setText(
        `${THEME_LABELS[this.theme]} · ${prepared.publication.artifact.assets.length} 个资源`
      );
      this.renderDiagnostics(prepared.publication.artifact.diagnostics);
    } catch (error) {
      if (generation !== this.previewGeneration) {
        return;
      }
      this.renderPreviewEmpty(
        error instanceof Error ? error.message : "预览生成失败，请重试。"
      );
      this.diagnosticSummaryEl?.setText("预览生成失败");
      this.diagnosticSummaryEl?.setAttribute("data-tone", "error");
    }
  }

  private renderPreviewEmpty(message: string): void {
    if (!this.previewEl) {
      return;
    }
    this.previewEl.empty();
    this.previewEl.dataset.state = "empty";
    const empty = this.previewEl.createDiv({ cls: "crosspost-empty-state" });
    empty.createEl("strong", { text: "暂时没有可预览内容" });
    empty.createDiv({ text: message });
  }

  private renderDiagnostics(diagnostics: Diagnostic[]): void {
    if (!this.diagnosticsEl || !this.diagnosticSummaryEl) {
      return;
    }
    this.diagnosticsEl.empty();
    const errors = diagnostics.filter((item) => item.severity === "error").length;
    const warnings = diagnostics.filter((item) => item.severity === "warning").length;
    if (errors > 0) {
      this.diagnosticSummaryEl.setText(`${errors} 个问题会阻止保存草稿`);
      this.diagnosticSummaryEl.dataset.tone = "error";
    } else if (warnings > 0) {
      this.diagnosticSummaryEl.setText(`可以保存草稿，另有 ${warnings} 个兼容提醒`);
      this.diagnosticSummaryEl.dataset.tone = "warning";
    } else {
      this.diagnosticSummaryEl.setText("检查通过，可以保存草稿");
      this.diagnosticSummaryEl.dataset.tone = "success";
    }
    if (diagnostics.length === 0) {
      this.diagnosticsEl.createDiv({
        cls: "crosspost-diagnostic-empty",
        text: "当前平台没有发现兼容性问题。"
      });
      return;
    }
    for (const diagnostic of diagnostics) {
      const item = this.diagnosticsEl.createDiv({ cls: "crosspost-diagnostic" });
      item.dataset.severity = diagnostic.severity;
      const heading = item.createDiv({ cls: "crosspost-diagnostic-heading" });
      heading.createEl("strong", {
        text: DIAGNOSTIC_TITLES[diagnostic.code] ?? "兼容性提醒"
      });
      heading.createEl("code", { text: diagnostic.code });
      item.createDiv({
        cls: "crosspost-diagnostic-message",
        text: localizeDiagnosticMessage(diagnostic)
      });
      if (diagnostic.source) {
        item.createEl("small", {
          cls: "crosspost-diagnostic-source",
          text: diagnostic.source
        });
      }
    }
  }

  private async publishSelected(button: HTMLButtonElement): Promise<void> {
    const file = this.getActiveFile();
    if (!file) {
      new Notice("请先打开一篇 Markdown 笔记。");
      return;
    }
    const platforms = PLATFORMS.filter((platform) =>
      this.selectedPlatforms.has(platform)
    );
    if (platforms.length === 0) {
      new Notice("请至少选择一个草稿平台。");
      return;
    }
    this.isPublishing = true;
    button.setAttribute("aria-busy", "true");
    this.updatePublishButton();
    try {
      await this.plugin.publish(file, platforms, this.theme, (update) => {
        this.renderTargetStatus(update);
      });
      await this.refreshPreview();
    } finally {
      this.isPublishing = false;
      button.removeAttribute("aria-busy");
      this.updatePublishButton();
    }
  }

  private renderTargetStatus(
    update: PublishStatusUpdate,
    updatedAt?: string
  ): void {
    if (!this.statusesEl) {
      return;
    }
    this.statusesEl.querySelector(".crosspost-empty-state")?.remove();
    let item = this.statusCards.get(update.platform);
    if (!item) {
      item = this.statusesEl.createDiv({ cls: "crosspost-status-card" });
      this.statusCards.set(update.platform, item);
    }
    item.empty();
    item.dataset.state = update.state;
    const header = item.createDiv({ cls: "crosspost-status-header" });
    header.createEl("strong", { text: PLATFORM_LABELS[update.platform] });
    header.createSpan({
      cls: "crosspost-status-badge",
      text: STATE_LABELS[update.state]
    });
    item.createDiv({
      cls: "crosspost-status-message",
      text: localizeStatusMessage(update.message)
    });
    if (updatedAt) {
      item.createEl("time", {
        cls: "crosspost-status-time",
        text: new Date(updatedAt).toLocaleString()
      });
    }
    if (update.state === "failed") {
      const retry = item.createEl("button", {
        attr: { type: "button" },
        cls: "crosspost-status-action",
        text: `重试${PLATFORM_LABELS[update.platform]}`
      });
      retry.addEventListener("click", () => {
        void this.retryPlatform(update.platform, retry);
      });
    }
    if (update.state === "unknown") {
      const unlock = item.createEl("button", {
        attr: { type: "button" },
        cls: "crosspost-status-action",
        text: "已人工检查，允许重试"
      });
      unlock.addEventListener("click", () => {
        void (async () => {
          const file = this.getActiveFile();
          if (!file) {
            return;
          }
          await this.plugin.clearUnknownState(file, update.platform);
          unlock.disabled = true;
          new Notice("结果锁已解除。请确认平台没有重复草稿后再重试。");
        })();
      });
    }
  }

  private renderStoredStatuses(): void {
    this.statusesEl?.empty();
    this.statusCards.clear();
    const file = this.getActiveFile();
    if (!file || !this.statusesEl) {
      return;
    }
    const states = this.plugin.getPublicationStates(file);
    let count = 0;
    for (const platform of PLATFORMS) {
      const record = states[platform];
      if (!record) {
        continue;
      }
      count += 1;
      this.renderTargetStatus(
        {
          message: record.message,
          platform,
          state: record.state
        },
        record.updatedAt
      );
    }
    if (count === 0) {
      const empty = this.statusesEl.createDiv({ cls: "crosspost-empty-state" });
      empty.createEl("strong", { text: "还没有草稿任务" });
      empty.createDiv({ text: "保存后会在这里显示每个平台的结果与重试入口。" });
    }
  }

  private syncTargetsFromFile(): void {
    const file = this.getActiveFile();
    const targets = file
      ? new Set(this.plugin.getTargets(file))
      : new Set<PlatformId>();
    this.selectedPlatforms = targets;
    for (const [platform, checkbox] of this.platformCheckboxes) {
      checkbox.checked = targets.has(platform);
    }
    this.updateFileContext(file);
    this.updatePlatformControls();
  }

  private updateFileContext(file: TFile | undefined): void {
    this.activeFileEl?.setText(
      file ? `当前文章：${file.basename}` : "尚未选择 Markdown 笔记"
    );
  }

  private updatePlatformControls(): void {
    for (const platform of PLATFORMS) {
      const selected = this.selectedPlatforms.has(platform);
      this.platformLabels.get(platform)?.toggleClass("is-selected", selected);
      const tab = this.platformTabs.get(platform);
      const active = this.activePlatform === platform;
      tab?.toggleClass("is-active", active);
      tab?.setAttribute("aria-selected", String(active));
    }
    this.updatePublishButton();
  }

  private updatePublishButton(): void {
    if (!this.publishButton) {
      return;
    }
    const count = this.selectedPlatforms.size;
    this.publishButton.disabled = this.isPublishing || count === 0;
    this.publishButton.setText(
      this.isPublishing
        ? "正在保存草稿…"
        : count === 0
          ? "选择发布平台"
          : `保存 ${count} 个平台草稿`
    );
  }

  private async retryPlatform(
    platform: PlatformId,
    button: HTMLButtonElement
  ): Promise<void> {
    const file = this.getActiveFile();
    if (!file) {
      return;
    }
    button.disabled = true;
    try {
      await this.plugin.publish(file, [platform], this.theme, (update) => {
        this.renderTargetStatus(update);
      });
      await this.refreshPreview();
    } finally {
      button.disabled = false;
    }
  }
}
