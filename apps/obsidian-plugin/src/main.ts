import { sha256Hex } from "@crosspost/core/hash";
import { renderMathSvg } from "@crosspost/core/math";
import { renderMermaidSvg } from "@crosspost/core/mermaid";
import { browserSvgToPng } from "@crosspost/core/rasterize";
import { computeContentHash } from "@crosspost/core/renderer";
import type { MermaidEngine } from "@crosspost/core/mermaid";
import type {
  PublicationAsset,
  RenderedPublication,
  ThemeId
} from "@crosspost/core/types";
import { generateSecretHex } from "@crosspost/protocol";
import type {
  DraftBinding,
  JobState,
  PlatformId
} from "@crosspost/protocol";
import {
  getFrontMatterInfo,
  loadMermaid,
  Notice,
  parseYaml,
  Plugin,
  TFile
} from "obsidian";

import { ObsidianAssetResolver } from "./assets.js";
import {
  UnknownBridgeDraftStateError,
  BridgeServer
} from "./bridge-server.js";
import type {
  BridgeProgress
} from "./bridge-server.js";
import {
  getWeChatCopyBlockingDiagnostics,
  writeHtmlSourceToClipboard,
  writeRichHtmlToClipboard
} from "./clipboard.js";
import {
  readCrosspostMetadata,
  writeDraftBinding
} from "./frontmatter.js";
import type {
  CrosspostMetadata
} from "./frontmatter.js";
import {
  CrosspostSettingTab,
  DEFAULT_SETTINGS
} from "./settings.js";
import type {
  CrosspostSettings
} from "./settings.js";
import {
  CrosspostView,
  CROSSPOST_VIEW_TYPE
} from "./view.js";
import {
  UnknownDraftStateError,
  WeChatClient
} from "./wechat-client.js";

interface SourceSnapshot {
  customCss?: string;
  customCssSnippets: Record<string, string>;
  activeCssSnippetId: string;
  file: TFile;
  metadata: CrosspostMetadata;
  resolver: ObsidianAssetResolver;
  source: string;
}

export interface PreparedPlatform {
  publication: RenderedPublication;
  previewHtml: string;
}

export interface PublishStatusUpdate {
  message: string;
  platform: PlatformId;
  state: JobState;
}

export interface PublishOutcome {
  binding?: DraftBinding;
  message: string;
  platform: PlatformId;
  sourceChanged: boolean;
  state: JobState;
}

export interface WeChatDraftRoundTripResult {
  academicThemePreserved: boolean;
  currentColorPreserved: boolean;
  expectedFormulaCount: number;
  mediaId: string;
  persistedFormulaCount: number;
  svgPreserved: boolean;
  title: string;
}

function hasAcademicThemeMarkup(html: string): boolean {
  return (
    html.includes("PART 01") &&
    /color:\s*#17364a/i.test(html) &&
    /text-indent:\s*2em/i.test(html) &&
    /border-left:\s*4px\s+solid\s+#315b71/i.test(html)
  );
}

export type StoredPublicationStates = Partial<
  Record<
    PlatformId,
    {
      message: string;
      state: JobState;
      updatedAt: string;
    }
  >
>;

function toDataUrl(asset: PublicationAsset): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}

function renderObsidianMermaidSvg(source: string) {
  return renderMermaidSvg(source, async () => {
    const engine: unknown = await loadMermaid();
    return engine as MermaidEngine;
  });
}

function renderBundledMathSvg(
  latex: string,
  display: boolean,
  color: "fixed" | "inherit" = "fixed"
): Promise<string> {
  return Promise.resolve(renderMathSvg(latex, display, color));
}

function parseSourceFrontmatter(source: string): unknown {
  const info = getFrontMatterInfo(source);
  if (!info.exists) {
    return undefined;
  }
  try {
    return parseYaml(info.frontmatter) as unknown;
  } catch {
    return undefined;
  }
}

export default class CrosspostStudioPlugin extends Plugin {
  settings: CrosspostSettings = { ...DEFAULT_SETTINGS };

  private bridge?: BridgeServer;
  private readonly bridgeProgressListeners = new Set<(progress: BridgeProgress) => void>();
  private readonly weChatClient = new WeChatClient();
  get weChat(): WeChatClient {
    return this.weChatClient;
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.ensurePairingSecret();
    this.registerView(CROSSPOST_VIEW_TYPE, (leaf) => new CrosspostView(leaf, this));
    this.addSettingTab(new CrosspostSettingTab(this));

    this.addRibbonIcon("send", "Open publishing studio", () => {
      void this.activateView();
    });
    this.addCommand({
      callback: () => {
        void this.activateView();
      },
      id: "open-publishing-studio",
      name: "Open publishing studio"
    });
    this.addCommand({
      checkCallback: (checking) => {
        const active = this.app.workspace.getActiveFile();
        if (!active) {
          return false;
        }
        if (!checking) {
          void this.activateView();
        }
        return true;
      },
      id: "publish-active-note",
      name: "Prepare active note for publishing"
    });
    this.addCommand({
      checkCallback: (checking) => {
        const active = this.app.workspace.getActiveFile();
        if (!active) {
          return false;
        }
        if (!checking) {
          void this.copyWeChatLayout(active, this.settings.theme)
            .then(() => {
              new Notice("公众号排版已复制，可直接粘贴到公众号编辑器。");
            })
            .catch((error: unknown) => {
              new Notice(
                error instanceof Error ? error.message : "复制公众号排版失败。"
              );
            });
        }
        return true;
      },
      id: "copy-active-note-for-wechat",
      name: "Copy active note layout for publishing"
    });
    this.addCommand({
      checkCallback: (checking) => {
        const active = this.app.workspace.getActiveFile();
        if (!active) {
          return false;
        }
        if (!checking) {
          void this.updateAndVerifyExistingWeChatDraft(
            active,
            this.settings.theme
          )
            .then((result) => {
              const themeStatus = result.academicThemePreserved
                ? "参考学术主题的标题、颜色、段首缩进及左边框均已保留。"
                : "微信回读未完整保留参考学术主题的关键样式。";
              const formulaStatus =
                result.expectedFormulaCount === 0
                  ? "源稿中没有公式。"
                  : result.svgPreserved && result.currentColorPreserved
                    ? `微信回读保留了 ${result.persistedFormulaCount}/${result.expectedFormulaCount} 个公式及 currentColor。`
                    : `草稿已更新，但微信回读未完整保留公式 SVG。`;
              new Notice(
                `已更新既有公众号草稿。${themeStatus}${formulaStatus}`,
                10_000
              );
            })
            .catch((error: unknown) => {
              new Notice(
                error instanceof Error
                  ? error.message
                  : "既有公众号草稿测试失败。",
                10_000
              );
            });
        }
        return true;
      },
      id: "update-verify-existing-wechat-draft",
      name: "Update and verify existing wechat draft by title"
    });

    this.addCommand({
      checkCallback: (checking) => {
        const active = this.app.workspace.getActiveFile();
        if (!active) {
          return false;
        }
        if (!checking) {
          void this.createAndVerifyNewWeChatDraft(active, this.settings.theme)
            .then((result) => {
              const themeStatus = result.academicThemePreserved
                ? "参考学术主题的标题、颜色、段首缩进及左边框均已保留。"
                : "微信回读未完整保留参考学术主题的关键样式。";
              const formulaStatus =
                result.expectedFormulaCount === 0
                  ? "源稿中没有公式。"
                  : result.svgPreserved && result.currentColorPreserved
                    ? `微信回读保留了 ${result.persistedFormulaCount}/${result.expectedFormulaCount} 个公式及 currentColor。`
                    : "草稿已创建，但微信回读未完整保留公式 SVG。";
              new Notice(
                `已新建公众号草稿。${themeStatus}${formulaStatus}`,
                10_000
              );
            })
            .catch((error: unknown) => {
              new Notice(
                error instanceof Error
                  ? error.message
                  : "新建公众号草稿测试失败。",
                10_000
              );
            });
        }
        return true;
      },
      id: "create-verify-new-wechat-draft",
      name: "Create and verify new wechat draft"
    });

    this.app.workspace.onLayoutReady(() => {
      void this.startBridge();
    });
  }

  onunload(): void {
    if (this.bridge) {
      void this.bridge.stop();
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<CrosspostSettings> | null)
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onBridgeProgress(listener: (progress: BridgeProgress) => void): () => void {
    this.bridgeProgressListeners.add(listener);
    return () => {
      this.bridgeProgressListeners.delete(listener);
    };
  }

  getPublicationStates(file: TFile): StoredPublicationStates {
    return this.settings.publicationStates[file.path] ?? {};
  }

  getTargets(file: TFile): PlatformId[] {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return readCrosspostMetadata(file, frontmatter).targets;
  }

  async prepare(
    file: TFile,
    platform: PlatformId,
    theme: ThemeId
  ): Promise<PreparedPlatform> {
    return this.renderSnapshot(await this.createSnapshot(file), platform, theme);
  }

  async copyWeChatLayout(file: TFile, theme: ThemeId): Promise<PreparedPlatform> {
    const prepared = await this.prepare(file, "wechat", theme);
    await this.copyPreparedWeChatLayout(prepared);
    return prepared;
  }

  async copyPreparedWeChatLayout(prepared: PreparedPlatform): Promise<void> {
    const blocking = getWeChatCopyBlockingDiagnostics(
      prepared.publication.artifact.diagnostics
    );
    if (blocking.length > 0) {
      throw new Error(blocking.map((diagnostic) => diagnostic.message).join("\n"));
    }
    await writeRichHtmlToClipboard(prepared.previewHtml);
  }

  async copyPreparedWeChatHtmlSource(prepared: PreparedPlatform): Promise<void> {
    const blocking = getWeChatCopyBlockingDiagnostics(
      prepared.publication.artifact.diagnostics
    );
    if (blocking.length > 0) {
      throw new Error(blocking.map((diagnostic) => diagnostic.message).join("\n"));
    }
    await writeHtmlSourceToClipboard(prepared.previewHtml);
  }

  async updateAndVerifyExistingWeChatDraft(
    file: TFile,
    theme: ThemeId
  ): Promise<WeChatDraftRoundTripResult> {
    const appSecret = this.app.secretStorage.getSecret(
      this.settings.wechatAppSecretId
    );
    if (!this.settings.wechatAppId || !appSecret) {
      throw new Error("请先配置微信公众号 AppID 和 AppSecret。");
    }
    const snapshot = await this.createSnapshot(file);
    const prepared = await this.renderSnapshot(snapshot, "wechat", theme);
    const blockingBeforeLookup = prepared.publication.artifact.diagnostics.filter(
      (diagnostic) =>
        diagnostic.severity === "error" &&
        diagnostic.code !== "wechat-cover-required"
    );
    if (blockingBeforeLookup.length > 0) {
      throw new Error(
        blockingBeforeLookup.map((diagnostic) => diagnostic.message).join("\n")
      );
    }
    const title = prepared.publication.artifact.metadata.title;
    const listed = await this.weChatClient.listDrafts(
      this.settings.wechatAppId,
      appSecret
    );
    const matches = listed.drafts.filter((draft) => draft.title === title);
    if (matches.length === 0) {
      const visibleTitles = listed.drafts
        .slice(0, 8)
        .map((draft) => `“${draft.title}”`)
        .join("、");
      const inventory =
        listed.drafts.length === 0
          ? `官方接口返回 ${listed.totalCount} 个草稿条目，但没有可见文章标题。`
          : `官方接口当前可见标题：${visibleTitles}。`;
      throw new Error(
        `草稿箱中没有标题为“${title}”的草稿；未新建任何内容。${inventory}`
      );
    }
    if (matches.length > 1) {
      throw new Error(`草稿箱中有 ${matches.length} 篇同名草稿；为避免误改，未执行更新。`);
    }
    const match = matches[0]!;
    if (
      !prepared.publication.artifact.metadata.coverAssetId &&
      !match.thumbMediaId
    ) {
      throw new Error("既有草稿没有可复用的封面，请先配置 crosspost.cover。");
    }
    const binding = await this.weChatClient.saveOrUpdateDraft({
      appId: this.settings.wechatAppId,
      appSecret,
      artifact: prepared.publication.artifact,
      assets: prepared.publication.assets,
      existingCoverMediaId: match.thumbMediaId,
      binding: {
        draftId: match.mediaId,
        platform: "wechat",
        sourceHash: prepared.publication.artifact.contentHash,
        updatedAt: new Date().toISOString()
      }
    });
    await writeDraftBinding(this.app, file, binding);
    const returned = await this.weChatClient.getDraftArticle(
      this.settings.wechatAppId,
      appSecret,
      binding.draftId!,
      title
    );
    const expectedFormulaCount = (
      prepared.publication.artifact.html.match(/data-crosspost-formula=/g) ?? []
    ).length;
    const persistedFormulaCount = (
      returned.content.match(/data-crosspost-formula=/g) ?? []
    ).length;
    const result: WeChatDraftRoundTripResult = {
      academicThemePreserved: hasAcademicThemeMarkup(returned.content),
      currentColorPreserved: returned.content.includes("currentColor"),
      expectedFormulaCount,
      mediaId: binding.draftId!,
      persistedFormulaCount,
      svgPreserved: returned.content.includes("<svg"),
      title
    };
    const formulaMarkupPreserved =
      expectedFormulaCount > 0 &&
      result.svgPreserved &&
      result.currentColorPreserved &&
      persistedFormulaCount === expectedFormulaCount;
    const message =
      result.academicThemePreserved && formulaMarkupPreserved
        ? "Draft updated; academic theme and formula markup verified through WeChat draft/get."
        : "Draft updated, but WeChat did not preserve all theme or inline formula markup.";
    await this.recordPublicationState(file, "wechat", "draft-saved", message);
    return result;
  }

  async createAndVerifyNewWeChatDraft(
    file: TFile,
    theme: ThemeId
  ): Promise<WeChatDraftRoundTripResult> {
    const appSecret = this.app.secretStorage.getSecret(
      this.settings.wechatAppSecretId
    );
    if (!this.settings.wechatAppId || !appSecret) {
      throw new Error("请先配置微信公众号 AppID 和 AppSecret。");
    }
    const snapshot = await this.createSnapshot(file);
    const prepared = await this.renderSnapshot(snapshot, "wechat", theme);
    const inferredCoverAssetId =
      prepared.publication.artifact.metadata.coverAssetId ??
      prepared.publication.artifact.assets.find(
        (asset) => asset.kind === "image"
      )?.id;
    const blocking = prepared.publication.artifact.diagnostics.filter(
      (diagnostic) =>
        diagnostic.severity === "error" &&
        !(
          diagnostic.code === "wechat-cover-required" &&
          inferredCoverAssetId
        )
    );
    if (blocking.length > 0) {
      throw new Error(blocking.map((diagnostic) => diagnostic.message).join("\n"));
    }
    if (!inferredCoverAssetId) {
      throw new Error("微信公众号草稿需要封面，且文章中没有可用图片。");
    }
    const artifact = {
      ...prepared.publication.artifact,
      metadata: {
        ...prepared.publication.artifact.metadata,
        coverAssetId: inferredCoverAssetId
      }
    };
    const binding = await this.weChatClient.saveOrUpdateDraft({
      appId: this.settings.wechatAppId,
      appSecret,
      artifact,
      assets: prepared.publication.assets
    });
    await writeDraftBinding(this.app, file, binding);
    const title = artifact.metadata.title;
    const returned = await this.weChatClient.getDraftArticle(
      this.settings.wechatAppId,
      appSecret,
      binding.draftId!,
      title
    );
    const expectedFormulaCount = (
      artifact.html.match(/data-crosspost-formula=/g) ?? []
    ).length;
    const persistedFormulaCount = (
      returned.content.match(/data-crosspost-formula=/g) ?? []
    ).length;
    const result: WeChatDraftRoundTripResult = {
      academicThemePreserved: hasAcademicThemeMarkup(returned.content),
      currentColorPreserved: returned.content.includes("currentColor"),
      expectedFormulaCount,
      mediaId: binding.draftId!,
      persistedFormulaCount,
      svgPreserved: returned.content.includes("<svg"),
      title
    };
    const formulaMarkupPreserved =
      expectedFormulaCount > 0 &&
      result.svgPreserved &&
      result.currentColorPreserved &&
      persistedFormulaCount === expectedFormulaCount;
    const message =
      result.academicThemePreserved && formulaMarkupPreserved
        ? "Draft created; academic theme and formula markup verified through WeChat draft/get."
        : "Draft created, but WeChat did not preserve all theme or inline formula markup.";
    await this.recordPublicationState(file, "wechat", "draft-saved", message);
    return result;
  }

  async publish(
    file: TFile,
    platforms: PlatformId[],
    theme: ThemeId,
    onStatus: (update: PublishStatusUpdate) => void
  ): Promise<PublishOutcome[]> {
    const snapshot = await this.createSnapshot(file);
    const outcomes: PublishOutcome[] = [];

    for (const platform of platforms) {
      const priorState = this.settings.publicationStates[file.path]?.[platform];
      if (
        priorState?.state === "unknown" &&
        !snapshot.metadata.bindings[platform]
      ) {
        const message =
          "The previous create result is unknown. Check the platform first, then clear the unknown-state lock in the task panel.";
        onStatus({
          message,
          platform,
          state: "unknown"
        });
        outcomes.push({
          message,
          platform,
          sourceChanged: await this.hasSourceChanged(snapshot),
          state: "unknown"
        });
        continue;
      }
      onStatus({
        message: "Preparing an immutable source snapshot…",
        platform,
        state: "prepared"
      });
      try {
        const prepared = await this.renderSnapshot(snapshot, platform, theme);
        const blocking = prepared.publication.artifact.diagnostics.filter(
          (diagnostic) => diagnostic.severity === "error"
        );
        if (blocking.length > 0) {
          throw new Error(blocking.map((diagnostic) => diagnostic.message).join("\n"));
        }

        let binding: DraftBinding;
        if (platform === "wechat") {
          onStatus({
            message: "Uploading images and saving the WeChat draft…",
            platform,
            state: "injecting"
          });
          binding = await this.saveWeChatDraft(snapshot, prepared.publication);
        } else {
          onStatus({
            message: "Sending the draft job to the browser extension…",
            platform,
            state: "queued"
          });
          if (!this.bridge) {
            throw new Error("The local publishing bridge is unavailable.");
          }
          binding = await this.bridge.enqueue({
            artifact: prepared.publication.artifact,
            assets: prepared.publication.assets,
            binding: snapshot.metadata.bindings[platform],
            target: platform
          });
        }
        await writeDraftBinding(this.app, file, binding);
        const sourceChanged = await this.hasSourceChanged(snapshot);
        const message = sourceChanged
          ? "Draft saved. The note changed during publishing; publish again to send the latest source."
          : "Draft saved successfully.";
        onStatus({
          message,
          platform,
          state: "draft-saved"
        });
        outcomes.push({
          binding,
          message,
          platform,
          sourceChanged,
          state: "draft-saved"
        });
        await this.recordPublicationState(file, platform, "draft-saved", message);
      } catch (error) {
        const unknown =
          error instanceof UnknownDraftStateError ||
          error instanceof UnknownBridgeDraftStateError;
        const message = error instanceof Error ? error.message : "Publishing failed.";
        onStatus({
          message,
          platform,
          state: unknown ? "unknown" : "failed"
        });
        outcomes.push({
          message,
          platform,
          sourceChanged: await this.hasSourceChanged(snapshot),
          state: unknown ? "unknown" : "failed"
        });
        await this.recordPublicationState(
          file,
          platform,
          unknown ? "unknown" : "failed",
          message
        );
      }
    }
    return outcomes;
  }

  async clearUnknownState(file: TFile, platform: PlatformId): Promise<void> {
    const states = this.settings.publicationStates[file.path];
    if (!states?.[platform] || states[platform]?.state !== "unknown") {
      return;
    }
    delete states[platform];
    if (Object.keys(states).length === 0) {
      delete this.settings.publicationStates[file.path];
    }
    await this.saveSettings();
  }

  private async recordPublicationState(
    file: TFile,
    platform: PlatformId,
    state: JobState,
    message: string
  ): Promise<void> {
    this.settings.publicationStates[file.path] = {
      ...this.settings.publicationStates[file.path],
      [platform]: {
        message,
        state,
        updatedAt: new Date().toISOString()
      }
    };
    await this.saveSettings();
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CROSSPOST_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) {
      await leaf.setViewState({
        active: true,
        type: CROSSPOST_VIEW_TYPE
      });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  private ensurePairingSecret(): void {
    if (!this.app.secretStorage.getSecret(this.settings.pairingSecretId)) {
      this.app.secretStorage.setSecret(this.settings.pairingSecretId, generateSecretHex());
    }
  }

  private async startBridge(): Promise<void> {
    const pairingSecret = this.app.secretStorage.getSecret(this.settings.pairingSecretId);
    if (!pairingSecret) {
      new Notice("无法初始化浏览器配对密钥。");
      return;
    }
    this.bridge = new BridgeServer(
      this.settings.bridgePort,
      pairingSecret,
      (progress) => {
        for (const listener of this.bridgeProgressListeners) {
          listener(progress);
        }
      }
    );
    try {
      await this.bridge.start();
    } catch (error) {
      this.bridge = undefined;
      new Notice(
        `Crosspost bridge could not start on 127.0.0.1:${this.settings.bridgePort}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  private async createSnapshot(file: TFile): Promise<SourceSnapshot> {
    const source = await this.app.vault.cachedRead(file);
    const metadata = readCrosspostMetadata(file, parseSourceFrontmatter(source));
    let customCss: string | undefined;
    if (this.settings.customCssPath) {
      const cssFile = this.app.vault.getAbstractFileByPath(this.settings.customCssPath);
      if (cssFile instanceof TFile) {
        customCss = await this.app.vault.cachedRead(cssFile);
      }
    }
    return {
      activeCssSnippetId: this.settings.activeCssSnippetId,
      customCss,
      customCssSnippets: { ...this.settings.customCssSnippets },
      file,
      metadata,
      resolver: new ObsidianAssetResolver(this.app, file),
      source
    };
  }

  private async renderSnapshot(
    snapshot: SourceSnapshot,
    platform: PlatformId,
    theme: ThemeId
  ): Promise<PreparedPlatform> {
    const activeSnippetCss =
      snapshot.activeCssSnippetId
        ? snapshot.customCssSnippets[snapshot.activeCssSnippetId]
        : undefined;
    const combinedCustomCss = [
      activeSnippetCss,
      snapshot.customCss
    ]
      .filter(Boolean)
      .join("\n");
    const publication = await import("@crosspost/core/renderer").then(({ renderPublication }) =>
      renderPublication(snapshot.source, {
        customCss: combinedCustomCss || undefined,
        metadata: {
          author: snapshot.metadata.author,
          cover: snapshot.metadata.cover,
          summary: snapshot.metadata.summary,
          tags: snapshot.metadata.tags,
          title: snapshot.metadata.title
        },
        platform,
        rasterizeFormula: browserSvgToPng,
        renderFormula: (latex, display) =>
          renderBundledMathSvg(
            latex,
            display,
            platform === "wechat" ? "inherit" : "fixed"
          ),
        renderMermaid: renderObsidianMermaidSvg,
        resolveAsset: (source) => snapshot.resolver.resolve(source),
        theme
      })
    );
    await this.attachCover(snapshot, publication);
    if (platform === "wechat") {
      if (!publication.artifact.metadata.coverAssetId) {
        publication.artifact.diagnostics.push({
          code: "wechat-cover-required",
          message: "WeChat requires crosspost.cover to point to a local or remote image.",
          severity: "error"
        });
      }
      if (Array.from(publication.artifact.metadata.title).length > 32) {
        publication.artifact.diagnostics.push({
          code: "wechat-title-too-long",
          message: "WeChat titles must be at most 32 characters.",
          severity: "error"
        });
      }
      if (
        Array.from(publication.artifact.metadata.author ?? "").length > 16
      ) {
        publication.artifact.diagnostics.push({
          code: "wechat-author-too-long",
          message: "WeChat author names must be at most 16 characters.",
          severity: "error"
        });
      }
      if ((publication.artifact.metadata.summary?.length ?? 0) > 120) {
        publication.artifact.diagnostics.push({
          code: "wechat-summary-truncated",
          message: "WeChat will use only the first 120 summary characters.",
          severity: "warning"
        });
      }
      const supportedImageTypes = new Set([
        "image/bmp",
        "image/gif",
        "image/jpeg",
        "image/png"
      ]);
      for (const asset of publication.assets.values()) {
        if (!supportedImageTypes.has(asset.mimeType)) {
          publication.artifact.diagnostics.push({
            code: "wechat-image-format-unsupported",
            message: `WeChat cannot upload ${asset.name} (${asset.mimeType}); use PNG, JPEG, GIF, or BMP.`,
            severity: "error",
            source: asset.name
          });
        }
        if (asset.bytes.byteLength > 10 * 1024 * 1024) {
          publication.artifact.diagnostics.push({
            code: "wechat-image-too-large",
            message: `${asset.name} exceeds the 10 MiB Crosspost Studio upload limit.`,
            severity: "error",
            source: asset.name
          });
        }
      }
    }

    let previewHtml = publication.artifact.html;
    for (const [id, asset] of publication.assets) {
      previewHtml = previewHtml.replaceAll(`crosspost-asset://${id}`, toDataUrl(asset));
    }
    return {
      previewHtml,
      publication
    };
  }

  private async attachCover(
    snapshot: SourceSnapshot,
    publication: RenderedPublication
  ): Promise<void> {
    if (!snapshot.metadata.cover) {
      return;
    }
    const resolved = await snapshot.resolver.resolve(snapshot.metadata.cover);
    if (!resolved) {
      publication.artifact.diagnostics.push({
        code: "cover-resolution-failed",
        message: `Cover image "${snapshot.metadata.cover}" could not be loaded.`,
        severity: "error",
        source: snapshot.metadata.cover
      });
      return;
    }
    const id = await sha256Hex(resolved.bytes);
    const existing = publication.assets.get(id);
    const asset: PublicationAsset =
      existing ??
      {
        alt: "Article cover",
        bytes: resolved.bytes,
        height: resolved.height,
        id,
        kind: "cover",
        mimeType: resolved.mimeType,
        name: resolved.name,
        width: resolved.width
      };
    publication.assets.set(id, asset);
    if (!publication.artifact.assets.some((item) => item.id === id)) {
      const { bytes: _bytes, ...descriptor } = asset;
      publication.artifact.assets.push(descriptor);
    }
    publication.artifact.metadata.coverAssetId = id;
  }

  private async saveWeChatDraft(
    snapshot: SourceSnapshot,
    publication: RenderedPublication
  ): Promise<DraftBinding> {
    const appSecret = this.app.secretStorage.getSecret(
      this.settings.wechatAppSecretId
    );
    if (!this.settings.wechatAppId || !appSecret) {
      throw new Error("Configure WeChat AppID and AppSecret before saving a WeChat draft.");
    }
    return this.weChatClient.saveOrUpdateDraft({
      appId: this.settings.wechatAppId,
      appSecret,
      artifact: publication.artifact,
      assets: publication.assets,
      binding: snapshot.metadata.bindings.wechat
    });
  }

  private async hasSourceChanged(snapshot: SourceSnapshot): Promise<boolean> {
    const currentSource = await this.app.vault.cachedRead(snapshot.file);
    const currentMetadata = readCrosspostMetadata(
      snapshot.file,
      parseSourceFrontmatter(currentSource)
    );
    const [snapshotHash, currentHash] = await Promise.all([
      computeContentHash(snapshot.source, {
        author: snapshot.metadata.author,
        cover: snapshot.metadata.cover,
        summary: snapshot.metadata.summary,
        tags: snapshot.metadata.tags,
        title: snapshot.metadata.title
      }),
      computeContentHash(currentSource, {
        author: currentMetadata.author,
        cover: currentMetadata.cover,
        summary: currentMetadata.summary,
        tags: currentMetadata.tags,
        title: currentMetadata.title
      })
    ]);
    return snapshotHash !== currentHash;
  }
}
