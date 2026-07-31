import { describe, expect, it } from "vitest";

import {
  isExpectedDraftUrl,
  isStableDraftUrl,
  NEW_DRAFT_URLS
} from "./platforms";

describe("platform draft URLs", () => {
  it("recognizes every configured new-draft entry URL", () => {
    for (const [platform, url] of Object.entries(NEW_DRAFT_URLS)) {
      expect(isExpectedDraftUrl(platform as keyof typeof NEW_DRAFT_URLS, url))
        .toBe(true);
    }
  });

  it("accepts current Zhihu edit URLs and rejects lookalike hosts", () => {
    expect(
      isExpectedDraftUrl(
        "zhihu",
        "https://zhuanlan.zhihu.com/p/2066288511632807185/edit"
      )
    ).toBe(true);
    expect(
      isExpectedDraftUrl(
        "zhihu",
        "https://zhuanlan.zhihu.com.evil.example/p/2066288511632807185/edit"
      )
    ).toBe(false);
  });

  it.each([
    ["csdn", "https://editor.csdn.net/md/?articleId=123"],
    ["oschina", "https://my.oschina.net/u/42/blog/write/draft/123"],
    ["cnblogs", "https://i.cnblogs.com/articles/edit;postId=123"],
    ["segmentfault", "https://segmentfault.com/write?draftId=1220000041678229"],
    ["51cto", "https://blog.51cto.com/blogger/draft/123"],
    [
      "baijiahao",
      "https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=123"
    ],
    [
      "toutiao",
      "https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123"
    ],
    [
      "bilibili",
      "https://member.bilibili.com/platform/upload/text/edit?aid=123"
    ],
    [
      "tencentcloud",
      "https://cloud.tencent.com/developer/article/write?draftId=123"
    ]
  ] as const)("accepts a supported %s draft URL", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(true);
  });

  it.each([
    ["csdn", "https://editor.csdn.net.evil.example/md/?articleId=123"],
    ["oschina", "https://my.oschina.net.evil.example/blog/write"],
    ["cnblogs", "https://i.cnblogs.com.evil.example/posts/edit"],
    ["segmentfault", "https://segmentfault.com.evil.example/write"],
    ["51cto", "https://blog.51cto.com.evil.example/blogger/publish"],
    ["baijiahao", "https://baijiahao.baidu.com.evil.example/builder/rc/edit"],
    ["toutiao", "https://mp.toutiao.com.evil.example/profile_v4/graphic/publish"],
    ["bilibili", "https://member.bilibili.com.evil.example/platform/upload/text/apply"],
    ["tencentcloud", "https://cloud.tencent.com.evil.example/developer/article/write"]
  ] as const)("rejects a lookalike %s host", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(false);
  });

  it.each([
    ["segmentfault", "https://segmentfault.com/user/draft"],
    ["51cto", "https://blog.51cto.com/blogger/publish/preview"],
    ["baijiahao", "https://baijiahao.baidu.com/builder/rc/edit/preview"],
    ["toutiao", "https://mp.toutiao.com/profile_v4/graphic/publish/preview"],
    ["bilibili", "https://member.bilibili.com/platform/upload/text/edit?aid=not-a-number"],
    ["tencentcloud", "https://cloud.tencent.com/developer/article/write/preview"]
  ] as const)("rejects an unrelated %s route on the real host", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(false);
  });

  it.each([
    ["segmentfault", "https://segmentfault.com/user/login"],
    [
      "51cto",
      "https://home.51cto.com/index?reback=https%3A%2F%2Fblog.51cto.com"
    ],
    ["baijiahao", "https://baijiahao.baidu.com/builder/theme/bjh/login"],
    [
      "toutiao",
      "https://mp.toutiao.com/auth/page/login?redirect_url=publish"
    ],
    ["bilibili", "https://passport.bilibili.com/login"],
    [
      "tencentcloud",
      "https://cloud.tencent.com/login?s_url=%2Fdeveloper%2Farticle%2Fwrite"
    ]
  ] as const)("rejects the observed %s login redirect as a draft URL", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(false);
  });

  it("requires reusable draft identifiers for newly-created Bilibili and Tencent Cloud drafts", () => {
    expect(
      isStableDraftUrl(
        "bilibili",
        "https://member.bilibili.com/platform/upload/text/apply"
      )
    ).toBe(false);
    expect(
      isStableDraftUrl(
        "bilibili",
        "https://member.bilibili.com/platform/upload/text/edit?aid=123"
      )
    ).toBe(true);
    expect(
      isStableDraftUrl(
        "tencentcloud",
        "https://cloud.tencent.com/developer/article/write"
      )
    ).toBe(false);
    expect(
      isStableDraftUrl(
        "tencentcloud",
        "https://cloud.tencent.com/developer/article/write?draftId=123"
      )
    ).toBe(true);
  });
});
