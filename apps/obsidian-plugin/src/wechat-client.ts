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

interface DraftArticleResponse {
  content?: string;
  thumb_media_id?: string;
  title?: string;
}

interface DraftListItemResponse {
  content?: {
    news_item?: DraftArticleResponse[];
  };
  media_id?: string;
  update_time?: number;
}

interface DraftBatchResponse extends WeChatErrorResponse {
  item?: DraftListItemResponse[];
  item_count?: number;
  total_count?: number;
}

interface DraftDetailResponse extends WeChatErrorResponse {
  news_item?: DraftArticleResponse[];
}

export interface WeChatDraftMatch {
  mediaId: string;
  thumbMediaId?: string;
  title: string;
  updateTime?: number;
}

export interface WeChatDraftArticle {
  content: string;
  title: string;
}

export interface WeChatDraftListResult {
  drafts: WeChatDraftMatch[];
  totalCount: number;
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
      `Content-Disposition: form-data; name="${fieldName.replace(/[\r\n"\\]/g, "_")}"; filename="${asset.name.replace(/[\r\n"\\]/g, "_")}"\r\n` +
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

const WECHAT_ERROR_MESSAGES: Record<number, string> = {
  40001: "invalid credential",
  40007: "invalid media_id",
  42001: "token expired",
  45009: "rate limited",
  48001: "api unauthorized"
};

const TOKEN_RETRY_ERRCODES: Record<number, true> = { 40001: true, 42001: true };

export class WeChatApiError extends Error {
  constructor(
    readonly errcode: number,
    message: string
  ) {
    super(message);
    this.name = "WeChatApiError";
  }
}

function assertWeChatSuccess(response: WeChatErrorResponse, action: string): void {
  const errcode = response.errcode;
  if (errcode && errcode !== 0) {
    const detail =
      WECHAT_ERROR_MESSAGES[errcode] ?? response.errmsg ?? "unknown WeChat error";
    throw new WeChatApiError(errcode, `${action} failed (${errcode}): ${detail}`);
  }
}

export interface WeChatDraftInput {
  appId: string;
  appSecret: string;
  artifact: PublicationArtifact;
  assets: ReadonlyMap<string, PublicationAsset>;
  binding?: DraftBinding;
  existingCoverMediaId?: string;
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

  /**
   * Runs a WeChat API call with the cached access token. Invalid-token
   * rejections (40001/42001) clear the cache, fetch a fresh token, and retry
   * exactly once before surfacing the error.
   */
  private async withAccessToken<T>(
    appId: string,
    appSecret: string,
    request: (token: string) => Promise<T>
  ): Promise<T> {
    const token = await this.getAccessToken(appId, appSecret);
    try {
      return await request(token);
    } catch (error) {
      if (!(error instanceof WeChatApiError) || !TOKEN_RETRY_ERRCODES[error.errcode]) {
        throw error;
      }
      this.accessToken = undefined;
      return request(await this.getAccessToken(appId, appSecret));
    }
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

  async listDrafts(
    appId: string,
    appSecret: string
  ): Promise<WeChatDraftListResult> {
    return this.withAccessToken(appId, appSecret, (token) =>
      this.listDraftsWithToken(token)
    );
  }

  private async listDraftsWithToken(token: string): Promise<WeChatDraftListResult> {
    const drafts: WeChatDraftMatch[] = [];
    let offset = 0;
    let totalCount = 0;
    do {
      const response = await requestUrl({
        body: JSON.stringify({ count: 20, no_content: 0, offset }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        url: `https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${encodeURIComponent(token)}`
      });
      const data = response.json as DraftBatchResponse;
      assertWeChatSuccess(data, "Draft list request");
      const items = data.item ?? [];
      totalCount = data.total_count ?? offset + items.length;
      for (const item of items) {
        if (!item.media_id) {
          continue;
        }
        for (const article of item.content?.news_item ?? []) {
          if (article.title) {
            drafts.push({
              mediaId: item.media_id,
              thumbMediaId: article.thumb_media_id,
              title: article.title,
              updateTime: item.update_time
            });
          }
        }
      }
      offset += items.length;
      if (items.length === 0) {
        break;
      }
    } while (offset < totalCount);
    return { drafts, totalCount };
  }

  async findDraftsByTitle(
    appId: string,
    appSecret: string,
    title: string
  ): Promise<WeChatDraftMatch[]> {
    const { drafts } = await this.listDrafts(appId, appSecret);
    return drafts.filter((draft) => draft.title === title);
  }

  async getDraftArticle(
    appId: string,
    appSecret: string,
    mediaId: string,
    title: string
  ): Promise<WeChatDraftArticle> {
    return this.withAccessToken(appId, appSecret, (token) =>
      this.getDraftArticleWithToken(token, mediaId, title)
    );
  }

  private async getDraftArticleWithToken(
    token: string,
    mediaId: string,
    title: string
  ): Promise<WeChatDraftArticle> {
    const response = await requestUrl({
      body: JSON.stringify({ media_id: mediaId }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      url: `https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${encodeURIComponent(token)}`
    });
    const data = response.json as DraftDetailResponse;
    assertWeChatSuccess(data, "Draft detail request");
    const article = data.news_item?.find((item) => item.title === title);
    if (!article) {
      throw new Error(`WeChat draft no longer contains an article titled "${title}".`);
    }
    return {
      content: article.content ?? "",
      title
    };
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
    if (Array.from(input.artifact.metadata.title).length > 32) {
      throw new Error("WeChat titles must be at most 32 characters.");
    }
    if (Array.from(input.artifact.metadata.author ?? "").length > 16) {
      throw new Error("WeChat author names must be at most 16 characters.");
    }
    return this.withAccessToken(input.appId, input.appSecret, (token) =>
      this.saveOrUpdateDraftWithToken(input, token)
    );
  }

  private async saveOrUpdateDraftWithToken(
    input: WeChatDraftInput,
    token: string
  ): Promise<DraftBinding> {
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
    let coverMediaId = input.existingCoverMediaId;
    if (coverId) {
      const cover = input.assets.get(coverId);
      if (!cover) {
        throw new Error("The configured WeChat cover image could not be resolved.");
      }
      coverMediaId = await this.uploadCover(token, cover);
    }
    if (!coverMediaId) {
      throw new Error("WeChat requires a cover image in crosspost.cover.");
    }
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
