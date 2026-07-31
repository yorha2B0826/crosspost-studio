export type Locale = "en" | "zh-CN";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    "app.subtitle": "LOCAL DRAFT BRIDGE",
    "app.title": "Crosspost Studio",
    "connection.heading": "Connection Status",
    "connection.checking": "Checking…",
    "connection.checkingStatus": "Reading Obsidian status…",
    "connection.connected": "Connected to Obsidian",
    "connection.waiting": "Waiting for Obsidian",
    "connection.needsAction": "Needs Action",
    "connection.updated": "Updated",
    "connection.never": "No status received yet",
    "connection.justNow": "Just updated",
    "connection.reconnect": "Reconnect",
    "pairing.heading": "Obsidian Pairing",
    "pairing.subtitle": "Local Bridge",
    "pairing.configured": "Configured",
    "pairing.unconfigured": "Not configured",
    "pairing.portLabel": "Local Port",
    "pairing.keyLabel": "Pairing Key",
    "pairing.keyPlaceholder": "Paste from Obsidian settings",
    "pairing.keyPlaceholderConfigured": "Leave empty to keep current key",
    "pairing.help": "The key is only stored in this extension, used to authenticate Obsidian on 127.0.0.1.",
    "pairing.helpConfigured": "Pairing key is saved. Only re-paste if you need to replace it.",
    "pairing.save": "Save & Connect",
    "pairing.update": "Update Connection",
    "pairing.connecting": "Connecting…",
    "pairing.invalidInput": "Please enter a valid port; first-time pairing also requires a 64‑char hex key.",
    "permissions.heading": "Platform Permissions",
    "permissions.subtitle": "On-Demand Auth",
    "permissions.checking": "Checking…",
    "permissions.enabled": "Enabled",
    "permissions.grantAll": "Grant All Platforms",
    "permissions.notGranted": "Permission not granted; required to fill draft editors.",
    "wechat.label": "WeChat",
    "wechat.desc": "Saves drafts via official API (plugin only)",
    "juejin.label": "Juejin",
    "juejin.desc": "Opens and fills the visible draft editor",
    "zhihu.label": "Zhihu",
    "zhihu.desc": "Opens and fills the visible draft editor",
    "csdn.label": "CSDN",
    "csdn.desc": "Fills the Markdown editor and waits for autosave",
    "oschina.label": "OSChina",
    "oschina.desc": "Fills the visible blog editor and waits for draft save",
    "cnblogs.label": "BlogsCN",
    "cnblogs.desc": "Fills the Markdown editor and waits for draft save",
    "jianshu.label": "Jian Shu",
    "jianshu.desc": "Opens and fills the visible rich-text draft editor",
    "segmentfault.label": "SegmentFault",
    "segmentfault.desc": "Fills the visible Markdown editor and waits for autosave",
    "51cto.label": "51CTO",
    "51cto.desc": "Fills the visible Markdown editor and waits for draft save",
    "baijiahao.label": "Baijiahao",
    "baijiahao.desc": "Fills the visible rich-text editor and waits for draft save",
    "bilibili.label": "Bilibili Column",
    "bilibili.desc": "Fills the visible column editor and waits for autosave",
    "tencentcloud.label": "Tencent Cloud",
    "tencentcloud.desc": "Fills the visible article editor and waits for autosave",
    "toutiao.label": "Toutiao",
    "toutiao.desc": "Fills the visible rich-text editor and waits for draft save",
    "footer": "No cookies read. No article bodies persisted. No final publishing.",
    "theme.auto": "Auto",
    "theme.light": "Light",
    "theme.dark": "Dark",
  },
  "zh-CN": {
    "app.subtitle": "LOCAL DRAFT BRIDGE",
    "app.title": "Crosspost Studio",
    "connection.heading": "连接状态",
    "connection.checking": "正在检查…",
    "connection.checkingStatus": "正在读取 Obsidian 状态…",
    "connection.connected": "已连接 Obsidian",
    "connection.waiting": "等待 Obsidian",
    "connection.needsAction": "需要处理",
    "connection.updated": "更新于",
    "connection.never": "尚未收到状态",
    "connection.justNow": "刚刚更新",
    "connection.reconnect": "重新连接",
    "pairing.heading": "Obsidian 配对",
    "pairing.subtitle": "本机桥接",
    "pairing.configured": "已配对",
    "pairing.unconfigured": "未配置",
    "pairing.portLabel": "本地端口",
    "pairing.keyLabel": "配对密钥",
    "pairing.keyPlaceholder": "从 Obsidian 设置复制",
    "pairing.keyPlaceholderConfigured": "留空以保留现有密钥",
    "pairing.help": "密钥只保存在本机扩展中，用于验证 127.0.0.1 上的 Obsidian。",
    "pairing.helpConfigured": "已保存配对密钥。只有更换密钥时才需要重新粘贴。",
    "pairing.save": "保存并连接",
    "pairing.update": "更新连接设置",
    "pairing.connecting": "正在连接…",
    "pairing.invalidInput": "请输入有效端口；首次配对还需要 64 位配对密钥。",
    "permissions.heading": "平台权限",
    "permissions.subtitle": "按需授权",
    "permissions.grantAll": "一键授权全部平台",
    "permissions.checking": "检查中",
    "permissions.enabled": "已启用",
    "permissions.notGranted": "未授予平台权限；需要权限后才能填写对应草稿。",
    "wechat.label": "微信公众号",
    "wechat.desc": "通过官方 API 保存草稿（仅插件）",
    "juejin.label": "掘金",
    "juejin.desc": "打开并填写可见的草稿编辑器",
    "zhihu.label": "知乎",
    "zhihu.desc": "打开并填写可见的草稿编辑器",
    "csdn.label": "CSDN",
    "csdn.desc": "填写 Markdown 编辑器并等待自动保存",
    "oschina.label": "开源中国",
    "oschina.desc": "填写可见博客编辑器并等待草稿保存",
    "cnblogs.label": "博客园",
    "cnblogs.desc": "填写 Markdown 编辑器并等待草稿保存",
    "jianshu.label": "简书",
    "jianshu.desc": "打开并填写可见的富文本草稿编辑器",
    "segmentfault.label": "思否",
    "segmentfault.desc": "填写可见 Markdown 编辑器并等待自动保存",
    "51cto.label": "51CTO",
    "51cto.desc": "填写可见 Markdown 编辑器并等待草稿保存",
    "baijiahao.label": "百家号",
    "baijiahao.desc": "填写可见富文本编辑器并等待草稿保存",
    "bilibili.label": "B站专栏",
    "bilibili.desc": "填写可见专栏编辑器并等待自动保存",
    "tencentcloud.label": "腾讯云开发者社区",
    "tencentcloud.desc": "填写可见文章编辑器并等待自动保存",
    "toutiao.label": "今日头条",
    "toutiao.desc": "填写可见富文本编辑器并等待草稿保存",
    "footer": "不读取 Cookie，不持久化文章正文，不执行最终发布。",
    "theme.auto": "自动",
    "theme.light": "浅色",
    "theme.dark": "深色",
  },
};

export function t(key: string, locale: Locale): string {
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}

export function detectLocale(): Locale {
  for (const lang of navigator.languages) {
    if (lang.startsWith("zh")) {
      return "zh-CN";
    }
  }
  return "en";
}

// --- Theme helpers ---

export type ThemeMode = "auto" | "light" | "dark";

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(resolved: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", resolved);
}

export function onSystemThemeChange(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
