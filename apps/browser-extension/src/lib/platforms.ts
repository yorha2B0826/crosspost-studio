import type { BrowserPlatform } from "./messages";

export const PLATFORM_ORIGINS: Record<BrowserPlatform, string[]> = {
  cnblogs: ["https://i.cnblogs.com/*"],
  csdn: ["https://editor.csdn.net/*"],
  jianshu: ["https://www.jianshu.com/*"],
  juejin: ["https://juejin.cn/*"],
  oschina: ["https://my.oschina.net/*"],
  zhihu: ["https://*.zhihu.com/*"]
};

export const NEW_DRAFT_URLS: Record<BrowserPlatform, string> = {
  cnblogs: "https://i.cnblogs.com/posts/edit",
  csdn: "https://editor.csdn.net/md/",
  jianshu: "https://www.jianshu.com/writer",
  juejin: "https://juejin.cn/editor/drafts/new",
  oschina: "https://my.oschina.net/blog/write",
  zhihu: "https://zhuanlan.zhihu.com/write"
};

export function isExpectedDraftUrl(platform: BrowserPlatform, value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    switch (platform) {
      case "cnblogs":
        return (
          url.hostname === "i.cnblogs.com" &&
          (url.pathname.startsWith("/posts/edit") ||
            url.pathname.startsWith("/articles/edit"))
        );
      case "jianshu":
        return (
          url.hostname === "www.jianshu.com" &&
          (url.pathname.startsWith("/writer") ||
            /^\/p\/[a-f0-9]+\/edit\/?$/.test(url.pathname))
        );
      case "csdn":
        return url.hostname === "editor.csdn.net" && url.pathname.startsWith("/md");
      case "juejin":
        return url.hostname === "juejin.cn" && url.pathname.startsWith("/editor/drafts/");
      case "oschina":
        return (
          url.hostname === "my.oschina.net" &&
          (/^\/blog\/write\/?$/.test(url.pathname) ||
            /^\/u\/[^/]+\/blog\/write(?:\/draft\/[^/]+)?\/?$/.test(url.pathname))
        );
      case "zhihu":
        return (
          (url.hostname === "zhuanlan.zhihu.com" && url.pathname.startsWith("/write")) ||
          (url.hostname === "zhuanlan.zhihu.com" &&
            /^\/p\/\d+\/edit\/?$/.test(url.pathname)) ||
          (url.hostname === "www.zhihu.com" && url.pathname.includes("/write"))
        );
    }
  } catch {
    return false;
  }
}
