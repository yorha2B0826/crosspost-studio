import { describe, expect, it } from "vitest";

import {
  areEquivalentDraftUrls,
  canonicalizeBilibiliDraftUrl,
  getDraftRedirectUrl,
  isExpectedDraftUrl,
  isStableDraftUrl,
  NEW_DRAFT_URLS,
  waitForStableDraftUrl
} from "./platforms";

describe("Bilibili draft URL canonicalization", () => {
  it("converts the visible draft-list edit route into the reusable editor route", () => {
    expect(
      canonicalizeBilibiliDraftUrl(
        "https://member.bilibili.com/york/read-edit?aid=360186"
      )
    ).toBe("https://member.bilibili.com/york/read-editor?aid=360186");
  });

  it("rejects untrusted or identifier-free routes", () => {
    expect(
      canonicalizeBilibiliDraftUrl(
        "https://member.bilibili.com.evil.example/york/read-edit?aid=360186"
      )
    ).toBeUndefined();
    expect(
      canonicalizeBilibiliDraftUrl(
        "https://member.bilibili.com/york/read-editor?newEditor=-1"
      )
    ).toBeUndefined();
  });
});

describe("platform draft URLs", () => {
  it("treats a platform-normalized trailing slash as the same draft tab", () => {
    expect(
      areEquivalentDraftUrls(
        "https://editor.csdn.net/md/?articleId=163383800",
        "https://editor.csdn.net/md?articleId=163383800"
      )
    ).toBe(true);
    expect(
      areEquivalentDraftUrls(
        "https://editor.csdn.net/md?articleId=163383800",
        "https://editor.csdn.net/md?articleId=163383801"
      )
    ).toBe(false);
  });

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

  it("recognizes OSChina's current AI editor and resolves its profile redirect", () => {
    expect(
      isExpectedDraftUrl(
        "oschina",
        "https://my.oschina.net/u/9762237/blog/ai-write"
      )
    ).toBe(true);
    expect(
      getDraftRedirectUrl("oschina", "https://my.oschina.net/u/9762237/")
    ).toBe("https://my.oschina.net/u/9762237/blog/ai-write");
    expect(
      getDraftRedirectUrl(
        "oschina",
        "https://my.oschina.net.evil.example/u/9762237/"
      )
    ).toBeUndefined();
  });

  it("uses SegmentFault's acknowledged writer route after its first-use guide", () => {
    expect(NEW_DRAFT_URLS.segmentfault).toBe(
      "https://segmentfault.com/write?freshman=1"
    );
    expect(
      getDraftRedirectUrl(
        "segmentfault",
        "https://segmentfault.com/howtowrite"
      )
    ).toBe("https://segmentfault.com/write?freshman=1");
    expect(
      getDraftRedirectUrl(
        "segmentfault",
        "https://segmentfault.com.evil.example/howtowrite"
      )
    ).toBeUndefined();
  });

  it("accepts both Tencent Cloud's current and compatibility editor routes", () => {
    expect(
      isExpectedDraftUrl(
        "tencentcloud",
        "https://cloud.tencent.com/developer/article/write"
      )
    ).toBe(true);
    expect(
      isStableDraftUrl(
        "tencentcloud",
        "https://cloud.tencent.com/developer/article/write?draftId=123"
      )
    ).toBe(true);
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
      "https://member.bilibili.com/york/read-editor?aid=123"
    ],
    [
      "tencentcloud",
      "https://cloud.tencent.com/developer/article/write-new?draftId=123"
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
    ["bilibili", "https://member.bilibili.com.evil.example/york/read-editor"],
    ["tencentcloud", "https://cloud.tencent.com.evil.example/developer/article/write-new"]
  ] as const)("rejects a lookalike %s host", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(false);
  });

  it.each([
    ["segmentfault", "https://segmentfault.com/user/draft"],
    ["51cto", "https://blog.51cto.com/blogger/publish/preview"],
    ["baijiahao", "https://baijiahao.baidu.com/builder/rc/edit/preview"],
    ["toutiao", "https://mp.toutiao.com/profile_v4/graphic/publish/preview"],
    ["bilibili", "https://member.bilibili.com/article-text/home?aid=not-a-number"],
    ["tencentcloud", "https://cloud.tencent.com/developer/article/write-new/preview"]
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

  it.each(Object.entries(NEW_DRAFT_URLS))(
    "does not bind the reusable draft for a fresh %s editor URL",
    (platform, url) => {
      expect(
        isStableDraftUrl(platform as keyof typeof NEW_DRAFT_URLS, url)
      ).toBe(false);
    }
  );

  it.each([
    ["51cto", "https://blog.51cto.com/blogger/draft/123"],
    [
      "baijiahao",
      "https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=123"
    ],
    ["bilibili", "https://member.bilibili.com/york/read-editor?aid=123"],
    ["cnblogs", "https://i.cnblogs.com/articles/edit;postId=123"],
    ["csdn", "https://editor.csdn.net/md/?articleId=123"],
    [
      "jianshu",
      "https://www.jianshu.com/writer#/notebooks/52823588/notes/141744564"
    ],
    ["juejin", "https://juejin.cn/editor/drafts/7530000000000000000"],
    ["oschina", "https://my.oschina.net/u/42/blog/ai-write/draft/123"],
    ["segmentfault", "https://segmentfault.com/write?draftId=1220000041678229"],
    [
      "tencentcloud",
      "https://cloud.tencent.com/developer/article/write-new?draftId=123"
    ],
    [
      "toutiao",
      "https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123"
    ],
    ["zhihu", "https://zhuanlan.zhihu.com/p/2066288511632807185/edit"]
  ] as const)("accepts a reusable %s draft URL", (platform, url) => {
    expect(isStableDraftUrl(platform, url)).toBe(true);
  });

  it("waits for an SPA editor to expose its reusable draft URL", async () => {
    const urls = [
      "https://juejin.cn/editor/drafts/new",
      "https://juejin.cn/editor/drafts/7530000000000000000"
    ];
    await expect(
      waitForStableDraftUrl(
        "juejin",
        "https://juejin.cn/editor/drafts/new",
        () => Promise.resolve(urls.shift()),
        () => Promise.resolve(),
        2
      )
    ).resolves.toBe(
      "https://juejin.cn/editor/drafts/7530000000000000000"
    );
  });

  it("does not bind a generic editor URL after the stabilization window", async () => {
    await expect(
      waitForStableDraftUrl(
        "51cto",
        "https://blog.51cto.com/blogger/publish",
        () => Promise.resolve("https://blog.51cto.com/blogger/publish"),
        () => Promise.resolve(),
        1
      )
    ).resolves.toBeUndefined();
  });
});
