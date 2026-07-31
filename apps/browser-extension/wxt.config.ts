import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    action: {
      default_title: "Crosspost Studio"
    },
    description:
      "Save Obsidian articles as drafts through visible editors on supported content platforms.",
    host_permissions: ["http://127.0.0.1/*"],
    minimum_chrome_version: "116",
    name: "Crosspost Studio Bridge",
    optional_host_permissions: [
      "https://editor.csdn.net/*",
      "https://baijiahao.baidu.com/*",
      "https://blog.51cto.com/*",
      "https://member.bilibili.com/*",
      "https://i.cnblogs.com/*",
      "https://my.oschina.net/*",
      "https://mp.toutiao.com/*",
      "https://segmentfault.com/*",
      "https://cloud.tencent.com/*",
      "https://*.zhihu.com/*",
      "https://juejin.cn/*",
      "https://www.jianshu.com/*"
    ],
    permissions: ["scripting", "storage", "tabs"],
    version: "1.0.0"
  },
  srcDir: "src"
});
