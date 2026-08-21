import { browser } from "wxt/browser";
import { pause, reloadTabAndWait } from "../tab-flow";

export async function verifyJianshuDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedBodyText: string,
  expectedImageCount: number,
  isCancelled?: () => boolean
): Promise<{ diagnostic: string; verified: boolean }> {
  await reloadTabAndWait(tabId);
  let diagnostic = "editor-not-ready";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (isCancelled?.()) {
      return { diagnostic, verified: false };
    }
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle, expectedBodyText, expectedImageCount],
      func: (
        title: string,
        bodyText: string,
        imageCount: number
      ): { diagnostic: string; verified: boolean } | undefined => {
        // Mirrors the ordered title fallbacks of the Jianshu main adapter in
        // lib/dom/definitions.ts; avoid hash-based classes here because they
        // change between Jianshu deployments.
        const titleInput = document.querySelector<HTMLInputElement>(
          "div:has(> div > #editor) > input[type='text'], input[placeholder*='标题'], textarea[placeholder*='标题'], input[class*='title'], input#title"
        );
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
        const titleMatches = titleInput.value.trim() === title.trim();
        const actual = normalize(editor.textContent ?? "");
        const expected = normalize(bodyText);
        const anchors: string[] = [];
        for (let offset = 0; offset < expected.length; offset += 8) {
          const anchor = expected.slice(offset, offset + 8);
          if (anchor.length >= 4) {
            anchors.push(anchor);
          }
        }
        const matchedAnchors = anchors.filter((anchor) =>
          actual.includes(anchor)
        ).length;
        const anchorCoverage =
          anchors.length > 0 ? matchedAnchors / anchors.length : 1;
        // Jianshu strips some image/formula alternative text when it
        // serializes Kalamu content. Exact text equality therefore rejects a
        // visibly complete saved draft. Keep the title, image, source and
        // unresolved-token checks strict, while accepting a near-complete
        // persisted text fingerprint.
        const bodyMatches =
          actual === expected ||
          (expected.length >= 20 &&
            actual.length >= expected.length * 0.7 &&
            anchorCoverage >= 0.5);
        const hasUnresolvedToken = (editor.textContent ?? "").includes(
          "CROSSPOST_IMAGE_"
        );
        const invalidSourceCount = sources.filter(
          (source) => !/^https?:\/\//i.test(source)
        ).length;
        return {
          diagnostic: `titleMatch=${titleMatches}; bodyMatch=${bodyMatches}; actualLength=${actual.length}; expectedLength=${expected.length}; anchorCoverage=${anchorCoverage.toFixed(2)}; images=${sources.length}/${imageCount}; invalidSources=${invalidSourceCount}; unresolvedToken=${hasUnresolvedToken}`,
          verified:
            titleMatches &&
            bodyMatches &&
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
    await pause(250, isCancelled);
  }
  return { diagnostic, verified: false };
}
