import { browser } from "wxt/browser";
import { navigateTabAndWait, pause, reloadTabAndWait } from "../tab-flow";
import {
  isStableDraftUrl,
  PLATFORM_ORIGINS,
  selectPreferredDraftTab
} from "../../lib/platforms";

export async function verifyToutiaoDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedHtml: string,
  expectedImageCount: number
): Promise<{ diagnostic: string; verified: boolean }> {
  // Toutiao autosaves without exposing a stable visible status in every editor
  // revision. Let its debounce finish, then require an exact server readback.
  await pause(10_000);
  await reloadTabAndWait(tabId);
  let diagnostic = "editor-not-ready";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle, expectedHtml, expectedImageCount],
      func: (
        title: string,
        html: string,
        imageCount: number
      ): { diagnostic: string; verified: boolean } | undefined => {
        const titleInput = document.querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >(
          "textarea[placeholder*='标题'], input[placeholder*='标题'], textarea[class*='title'], input[class*='title']"
        );
        const editor = document.querySelector<HTMLElement>(
          ".ProseMirror[contenteditable='true'], [contenteditable='true'][role='textbox'], [data-slate-editor='true'][contenteditable='true'], .public-DraftEditor-content[contenteditable='true'], [class*='editor'] [contenteditable='true']"
        );
        if (!titleInput || !editor) {
          return undefined;
        }
        const normalize = (value: string): string =>
          value
            .normalize("NFKC")
            .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, "");
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const blockSelector =
          "h1, h2, h3, h4, h5, h6, p, li, th, td, blockquote, pre";
        const expectedBlocks = Array.from(
          parsed.body.querySelectorAll<HTMLElement>(blockSelector)
        )
          .filter((element) => !element.querySelector(blockSelector))
          .flatMap((element) => {
            const clone = element.cloneNode(true) as HTMLElement;
            for (const media of clone.querySelectorAll(
              "img, svg, video, iframe, canvas"
            )) {
              media.replaceWith(clone.ownerDocument.createTextNode("\0"));
            }
            return (clone.textContent ?? "")
              .split("\0")
              .map((text) => normalize(text));
          })
          .filter((text) => text.length > 0);
        const actual = normalize(editor.textContent ?? "");
        const missingBlocks = expectedBlocks.filter(
          (block) => !actual.includes(block)
        );
        const sources = Array.from(
          editor.querySelectorAll<HTMLImageElement>("img"),
          (image) => image.currentSrc || image.src
        );
        const titleMatches = titleInput.value.trim() === title.trim();
        const hasUnresolvedToken = (editor.textContent ?? "").includes(
          "CROSSPOST_IMAGE_"
        );
        const invalidSourceCount = sources.filter(
          (source) => !/^https?:\/\//i.test(source)
        ).length;
        return {
          diagnostic: `titleMatch=${titleMatches}; actualLength=${actual.length}; missingBlocks=${missingBlocks
            .slice(0, 3)
            .map((block) => JSON.stringify(block.slice(0, 60)))
            .join(",") || "none"}; images=${sources.length}/${imageCount}; invalidSources=${invalidSourceCount}; unresolvedToken=${hasUnresolvedToken}`,
          verified:
            titleMatches &&
            missingBlocks.length === 0 &&
            !hasUnresolvedToken &&
            sources.length === imageCount &&
            invalidSourceCount === 0
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
    await pause(250);
  }
  return { diagnostic, verified: false };
}

export async function resolveToutiaoDraftUrl(
  tabId: number,
  expectedTitle: string
): Promise<string | undefined> {
  const knownTabIds = new Set(
    (await browser.tabs.query({ url: PLATFORM_ORIGINS.toutiao })).flatMap(
      (tab) => (tab.id === undefined ? [] : [tab.id])
    )
  );
  await navigateTabAndWait(
    tabId,
    "https://mp.toutiao.com/profile_v4/manage/draft?from=creation"
  );

  let editClicked = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle],
      func: (title: string): boolean => {
        const normalize = (value: string | null | undefined): string =>
          (value ?? "").replace(/\s+/g, "").trim();
        const titleControls = Array.from(
          document.querySelectorAll<HTMLElement>("a, button, [role='link']")
        ).filter(
          (candidate) =>
            normalize(candidate.textContent) === normalize(title) &&
            candidate.getClientRects().length > 0
        );
        for (const titleControl of titleControls) {
          let card = titleControl.parentElement;
          for (let depth = 0; card && depth < 8; depth += 1) {
            const edit = Array.from(
              card.querySelectorAll<HTMLElement>("a, button, [role='link']")
            ).find(
              (candidate) =>
                normalize(candidate.textContent) === "编辑" &&
                candidate.getClientRects().length > 0
            );
            if (edit) {
              edit.click();
              return true;
            }
            card = card.parentElement;
          }
        }
        return false;
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

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidateTabs = await browser.tabs.query({
      url: PLATFORM_ORIGINS.toutiao
    });
    const stableTab = selectPreferredDraftTab(
      candidateTabs.filter(
        (tab) =>
          tab.id !== undefined &&
          !knownTabIds.has(tab.id) &&
          tab.url !== undefined &&
          isStableDraftUrl("toutiao", tab.url)
      )
    );
    const currentUrl = (await browser.tabs.get(tabId)).url;
    const stableDraftUrl =
      stableTab?.url ??
      (currentUrl && isStableDraftUrl("toutiao", currentUrl)
        ? currentUrl
        : undefined);
    if (stableDraftUrl) {
      if (stableTab?.id !== undefined && stableTab.id !== tabId) {
        await navigateTabAndWait(tabId, stableDraftUrl);
        await browser.tabs.remove(stableTab.id);
      }
      return stableDraftUrl;
    }
    await pause(250);
  }
  return undefined;
}
