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
  bilibili: "https://member.bilibili.com/york/read-editor?newEditor=-1",
  cnblogs: "https://i.cnblogs.com/articles/edit",
  csdn: "https://editor.csdn.net/md/",
  jianshu: "https://www.jianshu.com/writer",
  juejin: "https://juejin.cn/editor/drafts/new",
  oschina: "https://my.oschina.net/blog/ai-write",
  segmentfault: "https://segmentfault.com/write?freshman=1",
  tencentcloud: "https://cloud.tencent.com/developer/article/write-new",
  toutiao: "https://mp.toutiao.com/profile_v4/graphic/publish",
  zhihu: "https://zhuanlan.zhihu.com/write"
};

export interface DraftTabCandidate {
  active?: boolean;
  id?: number;
  lastAccessed?: number;
  url?: string;
}

export function selectPreferredDraftTab<T extends DraftTabCandidate>(
  candidates: T[]
): T | undefined {
  return candidates
    .filter(
      (candidate): candidate is T & { id: number; url: string } =>
        candidate.id !== undefined && candidate.url !== undefined
    )
    .toSorted(
      (first, second) =>
        Number(Boolean(second.active)) - Number(Boolean(first.active)) ||
        (second.lastAccessed ?? 0) - (first.lastAccessed ?? 0)
    )[0];
}

function normalizedComparableUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.pathname =
      url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    url.searchParams.sort();
    return url.toString();
  } catch {
    return undefined;
  }
}

export function areEquivalentDraftUrls(first: string, second: string): boolean {
  const normalizedFirst = normalizedComparableUrl(first);
  return (
    normalizedFirst !== undefined &&
    normalizedFirst === normalizedComparableUrl(second)
  );
}

export function canonicalizeBilibiliDraftUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "member.bilibili.com") {
      return undefined;
    }
    const aid = url.searchParams.get("aid");
    if (!/^\d+$/.test(aid ?? "")) {
      return undefined;
    }
    if (url.pathname === "/article-text/home") {
      return url.toString();
    }
    if (["/york/read-edit", "/york/read-editor"].includes(url.pathname)) {
      return `https://member.bilibili.com/york/read-editor?aid=${aid}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function canonicalizeCnblogsDraftUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "i.cnblogs.com") {
      return undefined;
    }
    const match = url.pathname.match(
      /^\/articles\/(?:edit|edit-done);postId=(\d+)(?:;[^/]*)?\/?$/
    );
    const postId = match?.[1] ?? url.searchParams.get("postId");
    if (!/^\d+$/.test(postId ?? "")) {
      return undefined;
    }
    return `https://i.cnblogs.com/articles/edit;postId=${postId}`;
  } catch {
    return undefined;
  }
}

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
          ["/article-text/home", "/york/read-editor"].includes(url.pathname) &&
          (url.searchParams.get("newEditor") === "-1" ||
            /^\d+$/.test(url.searchParams.get("aid") ?? ""))
        );
      case "cnblogs":
        return (
          url.hostname === "i.cnblogs.com" &&
          (url.pathname.startsWith("/posts/edit") ||
            url.pathname.startsWith("/articles/edit") ||
            url.pathname.startsWith("/articles/edit-done"))
        );
      case "jianshu":
        return (
          url.hostname === "www.jianshu.com" &&
          (url.pathname.startsWith("/writer") ||
            /^\/p\/[a-f0-9]+\/edit\/?$/.test(url.pathname))
        );
      case "csdn":
        return (
          url.hostname === "editor.csdn.net" && /^\/md(?:$|[/?#])/.test(url.pathname)
        );
      case "juejin":
        return url.hostname === "juejin.cn" && url.pathname.startsWith("/editor/drafts/");
      case "oschina":
        return (
          url.hostname === "my.oschina.net" &&
          (/^\/blog\/(?:ai-)?write\/?$/.test(url.pathname) ||
            /^\/u\/[^/]+\/blog\/(?:ai-)?write(?:\/draft\/[^/]+)?\/?$/.test(
              url.pathname
            ))
        );
      case "segmentfault":
        return (
          url.hostname === "segmentfault.com" &&
          /^\/write\/?$/.test(url.pathname)
        );
      case "tencentcloud":
        return (
          url.hostname === "cloud.tencent.com" &&
          ["/developer/article/write", "/developer/article/write-new"].includes(
            url.pathname
          )
        );
      case "toutiao":
        return (
          url.hostname === "mp.toutiao.com" &&
          url.pathname === "/profile_v4/graphic/publish"
        );
      case "zhihu":
        return (
          (url.hostname === "zhuanlan.zhihu.com" &&
            /^\/write(?:$|\/)/.test(url.pathname)) ||
          (url.hostname === "zhuanlan.zhihu.com" &&
            /^\/p\/\d+\/edit\/?$/.test(url.pathname)) ||
          (url.hostname === "www.zhihu.com" &&
            /\/write(?:$|\/)/.test(url.pathname))
        );
    }
  } catch {
    return false;
  }
}

export function getDraftRedirectUrl(
  platform: BrowserPlatform,
  value: string
): string | undefined {
  try {
    const url = new URL(value);
    if (platform === "oschina") {
      const profile =
        url.protocol === "https:" && url.hostname === "my.oschina.net"
          ? url.pathname.match(/^\/u\/(\d+)\/?$/)
          : undefined;
      return profile?.[1]
        ? `https://my.oschina.net/u/${profile[1]}/blog/ai-write`
        : undefined;
    }
    if (
      platform === "segmentfault" &&
      url.protocol === "https:" &&
      url.hostname === "segmentfault.com" &&
      url.pathname === "/howtowrite"
    ) {
      return "https://segmentfault.com/write?freshman=1";
    }
    return undefined;
  } catch {
    return undefined;
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
  const numericQuery = (...keys: string[]): boolean =>
    keys.some((key) => /^\d+$/.test(url.searchParams.get(key) ?? ""));
  switch (platform) {
    case "51cto":
      return /^\/blogger\/draft\/[^/]+\/?$/.test(url.pathname);
    case "baijiahao":
      return numericQuery("article_id");
    case "bilibili":
      return numericQuery("aid");
    case "cnblogs":
      return (
        canonicalizeCnblogsDraftUrl(value) !== undefined
      );
    case "csdn":
      return numericQuery("articleId", "id");
    case "jianshu":
      return (
        /^\/p\/[a-f0-9]+\/edit\/?$/.test(url.pathname) ||
        /^#\/notebooks\/[^/]+\/notes\/[^/]+\/?$/.test(url.hash)
      );
    case "juejin":
      return /^\/editor\/drafts\/\d+\/?$/.test(url.pathname);
    case "oschina":
      return /^\/u\/[^/]+\/blog\/(?:ai-)?write\/draft\/[^/]+\/?$/.test(
        url.pathname
      );
    case "segmentfault":
      return numericQuery("draftId");
    case "tencentcloud":
      return numericQuery("articleId", "draftId", "id");
    case "toutiao":
      return numericQuery("pgc_id");
    case "zhihu":
      return /^\/p\/\d+\/edit\/?$/.test(url.pathname);
  }
}

export async function waitForStableDraftUrl(
  platform: BrowserPlatform,
  initialUrl: string | undefined,
  readCurrentUrl: () => Promise<string | undefined>,
  pauseBeforeRetry: () => Promise<void>,
  attempts = 20
): Promise<string | undefined> {
  let candidate = initialUrl;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (candidate && isStableDraftUrl(platform, candidate)) {
      return candidate;
    }
    if (attempt === attempts) {
      break;
    }
    try {
      candidate = await readCurrentUrl();
    } catch {
      return undefined;
    }
    if (candidate && isStableDraftUrl(platform, candidate)) {
      return candidate;
    }
    await pauseBeforeRetry();
  }
  return undefined;
}
