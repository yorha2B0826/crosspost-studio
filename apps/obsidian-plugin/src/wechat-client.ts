import type { DraftBinding, PublicationArtifact } from "@crosspost/protocol";
import { requestUrl } from "obsidian";

import type { PublicationAsset } from "@crosspost/core";

interface WeChatErrorResponse {
  errcode?: number;
  errmsg?: string;
}

interface AccessTokenResponse extends WeChatErrorResponse {
  access_token?: string;
  expires_in?: number;
}

interface UploadImageResponse extends WeChatErrorResponse {
  media_id?: string;
  url?: string;
}

interface DraftResponse extends WeChatErrorResponse {
  media_id?: string;
}

export class UnknownDraftStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownDraftStateError";
  }
}

function buildMultipart(
  fieldName: string,
  asset: PublicationAsset
): { body: ArrayBuffer; contentType: string } {
  const boundary = `crosspost-${crypto.randomUUID()}`;
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${asset.name}"\r\n` +
      `Content-Type: ${asset.mimeType}\r\n\r\n`
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(prefix.length + asset.bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(asset.bytes, prefix.length);
  body.set(suffix, prefix.length + asset.bytes.length);
  return {
    body: body.buffer,
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function assertWeChatSuccess(response: WeChatErrorResponse, action: string): void {
  if (response.errcode && response.errcode !== 0) {
    throw new Error(
      `${action} failed (${response.errcode}): ${response.errmsg ?? "unknown WeChat error"}`
    );
  }
}

export interface WeChatDraftInput {
  appId: string;
  appSecret: string;
  artifact: PublicationArtifact;
  assets: ReadonlyMap<string, PublicationAsset>;
  binding?: DraftBinding;
}

export class WeChatClient {
  private accessToken?: {
    appId: string;
    expiresAt: number;
    value: string;
  };

  async testConnection(appId: string, appSecret: string): Promise<{ ok: boolean; message: string }> {
    if (!appId.trim() || !appSecret.trim()) {
      return { ok: false, message: "Please provide both AppID and AppSecret." };
    }
    try {
      await this.getAccessToken(appId, appSecret);
      return { ok: true, message: "Successfully obtained an access token from WeChat." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "WeChat API connection failed."
      };
    }
  }

  private async getAccessToken(appId: string, appSecret: string): Promise<string> {
    if (
      this.accessToken &&
      this.accessToken.appId === appId &&
      this.accessToken.expiresAt > Date.now() + 60_000
    ) {
      return this.accessToken.value;
    }

    const response = await requestUrl({
      method: "GET",
      url:
        "https://api.weixin.qq.com/cgi-bin/token?" +
        new URLSearchParams({
          appid: appId,
          grant_type: "client_credential",
          secret: appSecret
        }).toString()
    });
    const data = response.json as AccessTokenResponse;
    assertWeChatSuccess(data, "Access token request");
    if (!data.access_token) {
      throw new Error("WeChat did not return an access token.");
    }
    this.accessToken = {
      appId,
      expiresAt: Date.now() + Math.max(60, data.expires_in ?? 7_200) * 1_000,
      value: data.access_token
    };
    return data.access_token;
  }

  private async uploadArticleImage(
    token: string,
    asset: PublicationAsset
  ): Promise<string> {
    const multipart = buildMultipart("media", asset);
    const response = await requestUrl({
      body: multipart.body,
      headers: {
        "Content-Type": multipart.contentType
      },
      method: "POST",
      url: `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(token)}`
    });
    const data = response.json as UploadImageResponse;
    assertWeChatSuccess(data, "Article image upload");
    if (!data.url) {
      throw new Error("WeChat did not return an article image URL.");
    }
    return data.url;
  }

  private async uploadCover(token: string, asset: PublicationAsset): Promise<string> {
    const multipart = buildMultipart("media", asset);
    const response = await requestUrl({
      body: multipart.body,
      headers: {
        "Content-Type": multipart.contentType
      },
      method: "POST",
      url:
        "https://api.weixin.qq.com/cgi-bin/material/add_material?" +
        new URLSearchParams({
          access_token: token,
          type: "image"
        }).toString()
    });
    const data = response.json as UploadImageResponse;
    assertWeChatSuccess(data, "Cover upload");
    if (!data.media_id) {
      throw new Error("WeChat did not return a cover media ID.");
    }
    return data.media_id;
  }

  async saveOrUpdateDraft(input: WeChatDraftInput): Promise<DraftBinding> {
    const token = await this.getAccessToken(input.appId, input.appSecret);
    let html = input.artifact.html;
    const remoteImageUrls = new Map<string, string>();

    for (const descriptor of input.artifact.assets) {
      if (descriptor.kind === "cover") {
        continue;
      }
      const asset = input.assets.get(descriptor.id);
      if (!asset) {
        throw new Error(`Publication asset ${descriptor.id} is missing.`);
      }
      const remoteUrl = await this.uploadArticleImage(token, asset);
      remoteImageUrls.set(asset.id, remoteUrl);
    }

    for (const [assetId, remoteUrl] of remoteImageUrls) {
      html = html.replaceAll(`crosspost-asset://${assetId}`, remoteUrl);
    }
    if (html.includes("crosspost-asset://")) {
      throw new Error("The WeChat draft still contains unresolved local assets.");
    }

    const coverId = input.artifact.metadata.coverAssetId;
    if (!coverId) {
      throw new Error("WeChat requires a cover image in crosspost.cover.");
    }
    const cover = input.assets.get(coverId);
    if (!cover) {
      throw new Error("The configured WeChat cover image could not be resolved.");
    }
    const coverMediaId = await this.uploadCover(token, cover);
    const article = {
      author: input.artifact.metadata.author ?? "",
      content: html,
      content_source_url: "",
      digest: input.artifact.metadata.summary?.slice(0, 120) ?? "",
      need_open_comment: 0,
      only_fans_can_comment: 0,
      thumb_media_id: coverMediaId,
      title: input.artifact.metadata.title
    };

    const existingDraftId = input.binding?.draftId;
    const url = existingDraftId
      ? `https://api.weixin.qq.com/cgi-bin/draft/update?access_token=${encodeURIComponent(token)}`
      : `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`;
    const body = existingDraftId
      ? {
          articles: article,
          index: 0,
          media_id: existingDraftId
        }
      : {
          articles: [article]
        };

    let data: DraftResponse;
    try {
      const response = await requestUrl({
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        url
      });
      data = response.json as DraftResponse;
    } catch (error) {
      if (!existingDraftId) {
        throw new UnknownDraftStateError(
          "The create-draft request ended without a confirmed response. Check WeChat before retrying."
        );
      }
      throw error;
    }
    assertWeChatSuccess(data, existingDraftId ? "Draft update" : "Draft creation");
    const draftId = existingDraftId ?? data.media_id;
    if (!draftId) {
      throw new Error("WeChat did not return a draft media ID.");
    }

    return {
      draftId,
      platform: "wechat",
      sourceHash: input.artifact.contentHash,
      updatedAt: new Date().toISOString()
    };
  }
}
