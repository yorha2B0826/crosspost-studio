import {
  browserRenderMermaidSvg,
  browserSvgToPng,
  computeContentHash,
  sha256Hex
} from "@crosspost/core";
import type {
  PublicationAsset,
  RenderedPublication,
  ThemeId
} from "@crosspost/core";
import { generateSecretHex } from "@crosspost/protocol";
import type {
  DraftBinding,
  JobState,
  PlatformId
} from "@crosspost/protocol";
import {
  getFrontMatterInfo,
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
  customCssSnippet?: string;
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
      customCss,
      customCssSnippet: this.settings.customCssSnippet || undefined,
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
    const combinedCustomCss = [
      snapshot.customCssSnippet,
      snapshot.customCss
    ]
      .filter(Boolean)
      .join("\n");
    const publication = await import("@crosspost/core").then(({ renderPublication }) =>
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
        renderMermaid: browserRenderMermaidSvg,
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
      if (publication.artifact.metadata.title.length > 64) {
        publication.artifact.diagnostics.push({
          code: "wechat-title-too-long",
          message: "WeChat titles must be at most 64 characters.",
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
