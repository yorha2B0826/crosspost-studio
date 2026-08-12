import type { Diagnostic } from "@crosspost/protocol";

const WECHAT_API_ONLY_DIAGNOSTICS = new Set([
  "wechat-author-too-long",
  "wechat-cover-required",
  "wechat-image-format-unsupported",
  "wechat-image-too-large",
  "wechat-summary-truncated",
  "wechat-title-too-long"
]);

interface RichClipboard {
  write(items: ClipboardItem[]): Promise<void>;
}

interface TextClipboard {
  writeText(text: string): Promise<void>;
}

interface ClipboardItemFactory {
  new (items: Record<string, Blob>): ClipboardItem;
}

export function getWeChatCopyBlockingDiagnostics(
  diagnostics: readonly Diagnostic[]
): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      !WECHAT_API_ONLY_DIAGNOSTICS.has(diagnostic.code)
  );
}

export function htmlToPlainText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const hidden of parsed.body.querySelectorAll("script, style, template")) {
    hidden.remove();
  }
  return parsed.body.textContent?.trim() ?? "";
}

export async function writeRichHtmlToClipboard(
  html: string,
  clipboard: RichClipboard = navigator.clipboard,
  ClipboardItemConstructor: ClipboardItemFactory = ClipboardItem
): Promise<void> {
  if (typeof clipboard.write !== "function") {
    throw new Error("当前 Obsidian 版本不支持写入富文本剪贴板。");
  }
  const item = new ClipboardItemConstructor({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([htmlToPlainText(html)], { type: "text/plain" })
  });
  await clipboard.write([item]);
}

export async function writeHtmlSourceToClipboard(
  html: string,
  clipboard: TextClipboard = navigator.clipboard
): Promise<void> {
  if (typeof clipboard.writeText !== "function") {
    throw new Error("当前 Obsidian 版本不支持写入文本剪贴板。");
  }
  await clipboard.writeText(html);
}
