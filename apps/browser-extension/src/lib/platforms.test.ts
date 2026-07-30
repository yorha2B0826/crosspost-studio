import { describe, expect, it } from "vitest";

import { isExpectedDraftUrl } from "./platforms";

describe("platform draft URLs", () => {
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
    ["cnblogs", "https://i.cnblogs.com/articles/edit;postId=123"]
  ] as const)("accepts a supported %s draft URL", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(true);
  });

  it.each([
    ["csdn", "https://editor.csdn.net.evil.example/md/?articleId=123"],
    ["oschina", "https://my.oschina.net.evil.example/blog/write"],
    ["cnblogs", "https://i.cnblogs.com.evil.example/posts/edit"]
  ] as const)("rejects a lookalike %s host", (platform, url) => {
    expect(isExpectedDraftUrl(platform, url)).toBe(false);
  });
});
