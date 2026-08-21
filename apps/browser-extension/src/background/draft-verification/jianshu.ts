import { browser } from "wxt/browser";
import { pause, reloadTabAndWait } from "../tab-flow";

export async function verifyJianshuDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedBodyText: string,
  expectedImageCount: number
): Promise<boolean> {
  await reloadTabAndWait(tabId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle, expectedBodyText, expectedImageCount],
      func: (title: string, bodyText: string, imageCount: number): boolean | undefined => {
        const titleInput = document.querySelector<HTMLInputElement>("input._24i7u");
        const editor = document.querySelector<HTMLElement>(
          "#editor .kalamu-area[contenteditable='true']"
        );
        if (!titleInput || !editor) {
          return undefined;
        }
        const normalize = (value: string): string =>
          value.replace(/\s+/g, "");
        const sources = Array.from(
          editor.querySelectorAll<HTMLImageElement>("img"),
          (image) => image.currentSrc || image.src
        );
        return (
          titleInput.value.trim() === title.trim() &&
          normalize(editor.textContent ?? "") === normalize(bodyText) &&
          !(editor.textContent ?? "").includes("CROSSPOST_IMAGE_") &&
          sources.length === imageCount &&
          sources.every((source) => /^https?:\/\//i.test(source))
        );
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      return true;
    }
    await pause(250);
  }
  return false;
}
