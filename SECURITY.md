# Security policy

## 数据边界

Crosspost Studio 没有云端服务或遥测。文章内容只在用户主动发起草稿任务时，从当前
Obsidian 快照发送到目标平台：

- 微信内容由 Obsidian 插件直接发送至微信官方 API。
- 知乎、掘金、CSDN、开源中国与博客园内容通过 localhost bridge 发送给扩展，再填入
  当前可见编辑器。
- 扩展只保留连接设置和非正文状态元数据；service worker 重启会中断正在运行的正文任务。

## 凭据

- 微信 AppSecret 与 bridge 主密钥必须保存在 Obsidian SecretStorage。
- 扩展中的配对密钥只允许扩展可信上下文读取。
- 禁止提交 `.env`、测试账号、访问令牌、Cookie、私钥或真实文章正文。
- 日志和错误报告在分享前必须使用项目脱敏工具或人工删除敏感值。

## 本地 bridge

bridge 只绑定 `127.0.0.1`，拒绝非扩展 Origin，使用协议版本、HMAC challenge、消息大小
限制、幂等 Job ID 与十分钟一次性资源令牌。资源响应使用 `no-store`，令牌只授权单个
Job 的内存资源。

## Mermaid SVG

Mermaid 只在本地渲染，使用 `securityLevel: strict`、确定性 ID 和 50,000 字符上限。生成
结果会移除脚本、`foreignObject`、事件属性、外部链接与嵌入对象；包含外部 CSS 资源的
SVG 会直接拒绝。微信公众号收到的是从该 SVG 转换的 PNG，其他平台收到清洗后的 SVG
图片文件。

## 报告漏洞

请通过 GitHub 的私密安全报告功能提交漏洞，不要在公开 issue 中包含凭据、文章内容、
草稿 URL 或可复用的复现令牌。
