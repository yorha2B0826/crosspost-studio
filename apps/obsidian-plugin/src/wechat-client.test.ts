import type { PublicationAsset } from "@crosspost/core";
import type { PublicationArtifact } from "@crosspost/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestUrlMock } = vi.hoisted(() => ({
  requestUrlMock: vi.fn()
}));

vi.mock("obsidian", () => ({
  requestUrl: requestUrlMock
}));

import { WeChatClient } from "./wechat-client";

const assetId = "a".repeat(64);
const descriptor = {
  alt: "image",
  id: assetId,
  kind: "image" as const,
  mimeType: "image/png",
  name: "image.png"
};
const asset: PublicationAsset = {
  ...descriptor,
  bytes: new Uint8Array([137, 80, 78, 71])
};
const artifact: PublicationArtifact = {
  assets: [descriptor],
  contentHash: "b".repeat(64),
  diagnostics: [],
  html: `<p><img src="crosspost-asset://${assetId}"></p><p data-crosspost-formula-block="true"><svg data-crosspost-formula="block"><path fill="currentColor"></path></svg></p>`,
  markdown: `![image](crosspost-asset://${assetId})`,
  metadata: {
    coverAssetId: assetId,
    tags: [],
    title: "微信草稿"
  },
  platform: "wechat"
};

beforeEach(() => {
  requestUrlMock.mockReset();
  requestUrlMock.mockImplementation(({ url }: { url: string }) => {
    if (url.includes("/token?")) {
      return Promise.resolve({
        json: { access_token: "test-token", expires_in: 7200 }
      });
    }
    if (url.includes("/media/uploadimg?")) {
      return Promise.resolve({
        json: { url: "https://mmbiz.qpic.cn/article-image" }
      });
    }
    if (url.includes("/material/add_material?")) {
      return Promise.resolve({
        json: { media_id: "cover-media-id" }
      });
    }
    if (url.includes("/draft/batchget?")) {
      return Promise.resolve({
        json: {
          item: [
            {
              content: {
                news_item: [
                  {
                    thumb_media_id: "existing-cover-media-id",
                    title: "微信草稿"
                  }
                ]
              },
              media_id: "existing-draft-media-id",
              update_time: 1_786_365_759
            }
          ],
          item_count: 1,
          total_count: 1
        }
      });
    }
    if (url.includes("/draft/get?")) {
      return Promise.resolve({
        json: {
          news_item: [
            {
              content: artifact.html,
              title: "微信草稿"
            }
          ]
        }
      });
    }
    if (url.includes("/draft/add?")) {
      return Promise.resolve({
        json: { media_id: "draft-media-id" }
      });
    }
    return Promise.resolve({ json: {} });
  });
});

describe("WeChat official draft adapter", () => {
  it("finds and reads an existing draft without creating another one", async () => {
    const client = new WeChatClient();

    await expect(client.listDrafts("app-id", "app-secret")).resolves.toEqual({
      drafts: [
        {
          mediaId: "existing-draft-media-id",
          thumbMediaId: "existing-cover-media-id",
          title: "微信草稿",
          updateTime: 1_786_365_759
        }
      ],
      totalCount: 1
    });
    await expect(
      client.findDraftsByTitle("app-id", "app-secret", "微信草稿")
    ).resolves.toEqual([
      {
        mediaId: "existing-draft-media-id",
        thumbMediaId: "existing-cover-media-id",
        title: "微信草稿",
        updateTime: 1_786_365_759
      }
    ]);
    await expect(
      client.getDraftArticle(
        "app-id",
        "app-secret",
        "existing-draft-media-id",
        "微信草稿"
      )
    ).resolves.toEqual({
      content: artifact.html,
      title: "微信草稿"
    });
    expect(
      requestUrlMock.mock.calls.some(([request]) =>
        String(request.url).includes("/draft/add?")
      )
    ).toBe(false);
  });

  it("rejects current official title and author limits before making requests", async () => {
    const client = new WeChatClient();
    const assets = new Map([[assetId, asset]]);

    await expect(
      client.saveOrUpdateDraft({
        appId: "app-id",
        appSecret: "app-secret",
        artifact: {
          ...artifact,
          metadata: {
            ...artifact.metadata,
            title: "标".repeat(33)
          }
        },
        assets
      })
    ).rejects.toThrow("at most 32 characters");
    await expect(
      client.saveOrUpdateDraft({
        appId: "app-id",
        appSecret: "app-secret",
        artifact: {
          ...artifact,
          metadata: {
            ...artifact.metadata,
            author: "作".repeat(17)
          }
        },
        assets
      })
    ).rejects.toThrow("at most 16 characters");
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("creates then updates the same draft through official endpoints", async () => {
    const client = new WeChatClient();
    const assets = new Map([[assetId, asset]]);
    const created = await client.saveOrUpdateDraft({
      appId: "app-id",
      appSecret: "app-secret",
      artifact,
      assets
    });

    expect(created).toMatchObject({
      draftId: "draft-media-id",
      platform: "wechat"
    });
    const addCall = requestUrlMock.mock.calls.find(([request]) =>
      String(request.url).includes("/draft/add?")
    );
    expect(JSON.parse(String(addCall?.[0].body))).toMatchObject({
      articles: [
        {
          content:
            '<p><img src="https://mmbiz.qpic.cn/article-image"></p><p data-crosspost-formula-block="true"><svg data-crosspost-formula="block"><path fill="currentColor"></path></svg></p>',
          thumb_media_id: "cover-media-id",
          title: "微信草稿"
        }
      ]
    });

    const updated = await client.saveOrUpdateDraft({
      appId: "app-id",
      appSecret: "app-secret",
      artifact,
      assets,
      binding: created
    });
    expect(updated.draftId).toBe("draft-media-id");
    const updateCall = requestUrlMock.mock.calls.find(([request]) =>
      String(request.url).includes("/draft/update?")
    );
    expect(JSON.parse(String(updateCall?.[0].body))).toMatchObject({
      articles: {
        title: "微信草稿"
      },
      index: 0,
      media_id: "draft-media-id"
    });
  });
});
