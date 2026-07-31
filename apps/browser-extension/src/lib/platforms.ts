import type { BrowserPlatform } from "./messages";

export const PLATFORM_ORIGINS: Record<BrowserPlatform, string[]> = {
  "51cto": ["https://blog.51cto.com/*"],
  baijiahao: ["https://baijiahao.baidu.com/*"],
  bilibili: ["https://member.bilibili.com/*"],
  cnblogs: ["https://i.cnblogs.com/*"],
  csdn: ["https://editor.csdn.net/*"],
  jianshu: ["https://www.jianshu.com/*"],
  juejin: ["https://juejin.cn/*"],
  oschina: ["https://my.oschina.net/*"],
  segmentfault: ["https://segmentfault.com/*"],
  tencentcloud: ["https://cloud.tencent.com/*"],
  toutiao: ["https://mp.toutiao.com/*"],
  zhihu: ["https://*.zhihu.com/*"]
};

export const NEW_DRAFT_URLS: Record<BrowserPlatform, string> = {
  "51cto": "https://blog.51cto.com/blogger/publish",
  baijiahao: "https://baijiahao.baidu.com/builder/rc/edit?type=news",
  bilibili: "https://member.bilibili.com/platform/upload/text/apply",
  cnblogs: "https://i.cnblogs.com/posts/edit",
  csdn: "https://editor.csdn.net/md/",
  jianshu: "https://www.jianshu.com/writer",
  juejin: "https://juejin.cn/editor/drafts/new",
  oschina: "https://my.oschina.net/blog/write",
  segmentfault: "https://segmentfault.com/write",
  tencentcloud: "https://cloud.tencent.com/developer/article/write",
  toutiao: "https://mp.toutiao.com/profile_v4/graphic/publish",
  zhihu: "https://zhuanlan.zhihu.com/write"
};

export function isExpectedDraftUrl(platform: BrowserPlatform, value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    switch (platform) {
      case "51cto":
        return (
          url.hostname === "blog.51cto.com" &&
          (url.pathname === "/blogger/publish" ||
            /^\/blogger\/draft\/[^/]+\/?$/.test(url.pathname))
        );
      case "baijiahao":
        return (
          url.hostname === "baijiahao.baidu.com" &&
          url.pathname === "/builder/rc/edit"
        );
      case "bilibili":
        return (
          url.hostname === "member.bilibili.com" &&
          (url.pathname === "/platform/upload/text/apply" ||
            (url.pathname === "/platform/upload/text/edit" &&
              /^\d+$/.test(url.searchParams.get("aid") ?? "")))
        );
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
      case "segmentfault":
        return (
          url.hostname === "segmentfault.com" &&
          /^\/write\/?$/.test(url.pathname)
        );
      case "tencentcloud":
        return (
          url.hostname === "cloud.tencent.com" &&
          url.pathname === "/developer/article/write"
        );
      case "toutiao":
        return (
          url.hostname === "mp.toutiao.com" &&
          url.pathname === "/profile_v4/graphic/publish"
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

export function isStableDraftUrl(
  platform: BrowserPlatform,
  value: string
): boolean {
  if (!isExpectedDraftUrl(platform, value)) {
    return false;
  }
  const url = new URL(value);
  if (platform === "bilibili") {
    return (
      url.pathname === "/platform/upload/text/edit" &&
      /^\d+$/.test(url.searchParams.get("aid") ?? "")
    );
  }
  if (platform === "tencentcloud") {
    return ["articleId", "draftId", "id"].some((key) =>
      /^\d+$/.test(url.searchParams.get(key) ?? "")
    );
  }
  return true;
}
