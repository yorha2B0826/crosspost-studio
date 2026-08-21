import { browser } from "wxt/browser";
import { pause, reloadTabAndWait } from "../tab-flow";

export async function verifyCsdnDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedMarkdown: string,
  expectedImageCount: number,
  isCancelled?: () => boolean
): Promise<{ diagnostic: string; verified: boolean }> {
  // CSDN's visible save label is not attached to a stable class across editor
  // revisions. Its server-backed editor is the authoritative boundary, so let
  // autosave settle and require the complete document to survive a reload.
  await pause(5_000, isCancelled);
  if (isCancelled?.()) {
    return { diagnostic: "cancelled-before-reload", verified: false };
  }
  await reloadTabAndWait(tabId);
  let diagnostic = "editor-not-ready";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (isCancelled?.()) {
      return { diagnostic, verified: false };
    }
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle, expectedMarkdown, expectedImageCount],
      func: (
        title: string,
        markdown: string,
        imageCount: number
      ): { diagnostic: string; verified: boolean } | undefined => {
        const editor = document.querySelector<HTMLElement>(
          "pre.editor__inner.markdown-highlighting[contenteditable='true'], .monaco-editor textarea.inputarea, .CodeMirror textarea, .cm-editor .cm-content[contenteditable='true'], textarea[aria-label*='Editor content'], textarea[class*='editor'], textarea"
        );
        if (!editor) {
          return undefined;
        }
        const titleElement = document.querySelector<HTMLElement>(
          "input#txtTitle, input[placeholder*='标题'], textarea[placeholder*='标题'], input[class*='title'], [contenteditable='true'][class*='title']"
        );
        const titleValue =
          titleElement instanceof HTMLInputElement ||
          titleElement instanceof HTMLTextAreaElement
            ? titleElement.value
            : titleElement?.textContent ?? "";
        const persisted =
          editor.tagName === "TEXTAREA"
            ? (editor as HTMLTextAreaElement).value
            : editor.innerText || editor.textContent || "";
        const normalize = (value: string): string =>
          value.replace(/\r\n?/g, "\n").trimEnd();
        const imageUrls = Array.from(
          persisted.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g),
          (match) => match[1]
        ).filter((source): source is string => source !== undefined);
        const titleMatches =
          titleValue.trim() === title.trim() ||
          document.body.textContent?.includes(title) === true;
        const bodyMatches = normalize(persisted) === normalize(markdown);
        const hasUnresolvedToken = persisted.includes("CROSSPOST_IMAGE_");
        const invalidImageCount = imageUrls.filter(
          (source) => !/^https?:\/\//i.test(source)
        ).length;
        return {
          diagnostic: `titleMatch=${titleMatches}; bodyMatch=${bodyMatches}; actualLength=${persisted.length}; images=${imageUrls.length}/${imageCount}; invalidSources=${invalidImageCount}; unresolvedToken=${hasUnresolvedToken}`,
          verified:
            titleMatches &&
            bodyMatches &&
            !hasUnresolvedToken &&
            imageUrls.length === imageCount &&
            invalidImageCount === 0
        };
      },
      target: { tabId }
    });
    if (injection?.result) {
      diagnostic = injection.result.diagnostic;
      if (injection.result.verified) {
        return injection.result;
      }
    }
    await pause(250, isCancelled);
  }
  return { diagnostic, verified: false };
}
