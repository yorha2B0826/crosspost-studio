import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";

import { mergeDraftBinding, readCrosspostMetadata } from "./frontmatter";

describe("frontmatter bindings", () => {
  it("updates one platform without discarding unrelated frontmatter", () => {
    const frontmatter: Record<string, unknown> = {
      aliases: ["保留"],
      crosspost: {
        author: "作者",
        bindings: {
          zhihu: {
            draftUrl: "https://zhuanlan.zhihu.com/p/old",
            sourceHash: "old",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        },
        customField: "keep"
      },
      tags: ["existing"]
    };

    mergeDraftBinding(frontmatter, {
      draftId: "wechat-media-id",
      platform: "wechat",
      sourceHash: "a".repeat(64),
      updatedAt: "2026-07-30T00:00:00.000Z"
    });

    expect(frontmatter).toMatchObject({
      aliases: ["保留"],
      crosspost: {
        author: "作者",
        bindings: {
          wechat: {
            draftId: "wechat-media-id",
            sourceHash: "a".repeat(64)
          },
          zhihu: {
            draftUrl: "https://zhuanlan.zhihu.com/p/old"
          }
        },
        customField: "keep"
      },
      tags: ["existing"]
    });
  });

  it("validates public binding fields and restores the platform discriminator", () => {
    const metadata = readCrosspostMetadata(
      { basename: "fallback" } as TFile,
      {
        crosspost: {
          bindings: {
            zhihu: {
              draftUrl: "https://zhuanlan.zhihu.com/p/123",
              sourceHash: "a".repeat(64),
              updatedAt: "2026-07-30T00:00:00.000Z"
            }
          },
          targets: ["zhihu"],
          title: "Article title"
        }
      }
    );

    expect(metadata).toMatchObject({
      bindings: {
        zhihu: {
          platform: "zhihu"
        }
      },
      targets: ["zhihu"],
      title: "Article title"
    });
  });

  it("accepts new browser targets without silently adding them to old notes", () => {
    const explicit = readCrosspostMetadata(
      { basename: "explicit" } as TFile,
      {
        crosspost: {
          targets: [
            "csdn",
            "oschina",
            "cnblogs",
            "segmentfault",
            "51cto",
            "baijiahao",
            "toutiao",
            "unsupported"
          ]
        }
      }
    );
    const legacyDefault = readCrosspostMetadata(
      { basename: "legacy" } as TFile,
      {}
    );

    expect(explicit.targets).toEqual([
      "csdn",
      "oschina",
      "cnblogs",
      "segmentfault",
      "51cto",
      "baijiahao",
      "toutiao"
    ]);
    expect(legacyDefault.targets).toEqual(["wechat", "zhihu", "juejin"]);
  });
});
