import type { ResolvedAsset } from "@crosspost/core";
import { normalizePath, requestUrl, TFile } from "obsidian";
import type { App } from "obsidian";

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};

function mimeFromName(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function stripWikiLink(source: string): string {
  const match = source.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  return match?.[1]?.trim() ?? source;
}

function decodeDataUrl(source: string): ResolvedAsset | undefined {
  const match = source.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return {
    bytes,
    mimeType: match[1],
    name: "embedded-image"
  };
}

export class ObsidianAssetResolver {
  constructor(
    private readonly app: App,
    private readonly sourceFile: TFile
  ) {}

  async resolve(source: string): Promise<ResolvedAsset | undefined> {
    if (source.startsWith("data:")) {
      return decodeDataUrl(source);
    }

    if (/^https?:\/\//i.test(source)) {
      const response = await requestUrl({
        method: "GET",
        url: source
      });
      const url = new URL(source);
      const name = decodeURIComponent(url.pathname.split("/").pop() || "remote-image");
      return {
        bytes: new Uint8Array(response.arrayBuffer),
        mimeType: response.headers["content-type"]?.split(";")[0] ?? mimeFromName(name),
        name
      };
    }

    const decoded = source.startsWith("obsidian-asset:")
      ? decodeURIComponent(source.slice("obsidian-asset:".length))
      : decodeURIComponent(source);
    const linkPath = stripWikiLink(decoded);
    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, this.sourceFile.path);
    if (!(file instanceof TFile)) {
      const normalized = normalizePath(linkPath);
      const direct = this.app.vault.getAbstractFileByPath(normalized);
      if (!(direct instanceof TFile)) {
        return undefined;
      }
      return this.readFile(direct);
    }
    return this.readFile(file);
  }

  private async readFile(file: TFile): Promise<ResolvedAsset> {
    return {
      bytes: new Uint8Array(await this.app.vault.readBinary(file)),
      mimeType: mimeFromName(file.name),
      name: file.name
    };
  }
}
