import { browser } from "wxt/browser";
import { navigateTabAndWait, pause, reloadTabAndWait } from "../tab-flow";
import { canonicalizeBilibiliDraftUrl } from "../../lib/platforms";

export async function resolveBilibiliDraftUrl(
  tabId: number,
  expectedTitle: string
): Promise<string | undefined> {
  await navigateTabAndWait(tabId, "https://member.bilibili.com/york/read-draft");
  let editClicked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle],
      func: (title: string): boolean => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(".draft-card")
        );
        const card = cards.find(
          (candidate) =>
            candidate
              .querySelector<HTMLElement>(".draft-card_title")
              ?.textContent?.trim() === title.trim()
        );
        const edit = card?.querySelector<HTMLElement>(
          ".draft-card_action-edit"
        );
        if (!edit || edit.getClientRects().length === 0) {
          return false;
        }
        edit.click();
        return true;
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      editClicked = true;
      break;
    }
    await pause(250);
  }
  if (!editClicked) {
    return undefined;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const currentUrl = (await browser.tabs.get(tabId)).url;
    const canonical = currentUrl
      ? canonicalizeBilibiliDraftUrl(currentUrl)
      : undefined;
    if (canonical) {
      await navigateTabAndWait(tabId, canonical);
      return canonical;
    }
    await pause(250);
  }
  return undefined;
}

export async function verifyBilibiliDraftAssets(
  tabId: number,
  expectedImageCount: number
): Promise<boolean> {
  await reloadTabAndWait(tabId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedImageCount],
      func: (expected: number): boolean | undefined => {
        const editor = document.querySelector<HTMLElement>(
          ".tiptap.ProseMirror.eva3-editor[contenteditable='true']"
        );
        if (!editor) {
          return undefined;
        }
        const sources = Array.from(
          editor.querySelectorAll<HTMLImageElement>("img")
        ).map((image) => image.currentSrc || image.src);
        const placeholders = (editor.textContent ?? "").match(
          /CROSSPOST_IMAGE_/g
        );
        const transientCount = sources.filter((source) =>
          /^(?:data:|blob:)/i.test(source)
        ).length;
        const resolvedCount = sources.filter((source) =>
          /^https?:\/\//i.test(source)
        ).length;
        return (
          (placeholders?.length ?? 0) === 0 &&
          transientCount === 0 &&
          resolvedCount >= expected
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
