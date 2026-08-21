import { browser } from "wxt/browser";
import { navigateTabAndWait, pause } from "../tab-flow";
import { isStableDraftUrl, PLATFORM_ORIGINS } from "../../lib/platforms";

export async function resolveOsChinaDraftUrl(
  tabId: number,
  expectedTitle: string,
  editorUrl: string
): Promise<string | undefined> {
  const profile = new URL(editorUrl).pathname.match(/^\/u\/([^/]+)\/blog\//);
  if (!profile?.[1]) {
    return undefined;
  }
  const knownTabIds = new Set(
    (await browser.tabs.query({ url: PLATFORM_ORIGINS.oschina })).flatMap(
      (tab) => (tab.id === undefined ? [] : [tab.id])
    )
  );
  await navigateTabAndWait(
    tabId,
    `https://my.oschina.net/u/${profile[1]}/`
  );

  let draftBoxOpened = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      func: (): boolean => {
        const draftBox = Array.from(
          document.querySelectorAll<HTMLElement>("[role='menuitem']")
        ).find(
          (candidate) =>
            candidate.textContent?.trim() === "草稿箱" &&
            candidate.getClientRects().length > 0
        );
        if (!draftBox) {
          return false;
        }
        draftBox.click();
        return true;
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      draftBoxOpened = true;
      break;
    }
    await pause(250);
  }
  if (!draftBoxOpened) {
    return undefined;
  }

  let editClicked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle],
      func: (title: string): boolean => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(".list-content-item")
        );
        const card = cards.find(
          (candidate) =>
            candidate
              .querySelector<HTMLElement>(".list-content-item-info-name")
              ?.textContent?.trim() === title.trim()
        );
        const edit = Array.from(
          card?.querySelectorAll<HTMLButtonElement>("button") ?? []
        ).find(
          (candidate) =>
            candidate.textContent?.replace(/\s+/g, "").trim() === "编辑"
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
    const candidateTabs = await browser.tabs.query({
      url: PLATFORM_ORIGINS.oschina
    });
    const stableTab = candidateTabs.find(
      (tab) =>
        tab.id !== undefined &&
        !knownTabIds.has(tab.id) &&
        tab.url !== undefined &&
        isStableDraftUrl("oschina", tab.url)
    );
    const currentUrl = (await browser.tabs.get(tabId)).url;
    const stableDraftUrl =
      stableTab?.url ??
      (currentUrl && isStableDraftUrl("oschina", currentUrl)
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
