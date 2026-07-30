# Architecture

## 快照与转换

用户点击保存后，插件立即读取正文、frontmatter、主题、自定义 CSS 和资源解析器，形成不可变
快照。转换与所有平台任务都使用这个快照。任务结束后再次计算当前源稿哈希；若不同，结果标记
“源稿已更新”，但不会改变正在执行的任务。

统一 Markdown AST 负责 GFM、Obsidian 图片嵌入、公式、代码和兼容性诊断。知乎公式交给
可见编辑器生成原生 LaTeX 节点；微信等不支持原生公式的平台使用 SVG 源栅格化的高清
PNG，并按正文 `1em` 逻辑尺寸显示。生成物包含平台 HTML、平台 Markdown、内容哈希和内容
寻址资源描述；资源字节只存在内存映射中。

## 平台边界

- 微信适配器在 Obsidian 中用官方 API 上传正文图片与封面，然后新增或更新草稿。
- 知乎/掘金 Job 经本地 bridge 交给扩展。扩展获取一次性资源、打开或复用草稿页、注入运行时
  内容脚本并等待平台显示明确保存状态。
- 平台之间没有事务或回滚；每个平台独立写入 binding 和任务状态。

## 协议

所有 JSON 消息都含 `protocolVersion: 1` 并经过共享 Zod schema 校验：

1. `pair` / `pair-response` / `pair-result`
2. `capabilities`
3. `enqueue-job`
4. `job-progress` / `job-result`
5. `cancel-job`

服务端生成 256-bit nonce，扩展返回 `HMAC-SHA256(pairingKey, nonce)`。文章资源不进入
WebSocket 消息；扩展持任务级 bearer token 从 `127.0.0.1` 获取，十分钟过期且禁用缓存。

扩展对 Job ID 使用内存幂等 ledger：运行中重复消息不会再执行，最近 100 个完成结果可以重放。
完成元数据不包含正文。service worker 重启后无法恢复中断正文任务，用户必须重新发送。

## 未知状态

首次创建发生超时或缺少明确保存信号时，状态为 `unknown`。插件持久化这类非正文状态并阻止
再次创建；用户必须先到平台检查是否已有草稿，再在任务面板显式解除锁定。更新已知 binding
失败不会删除原 binding。
