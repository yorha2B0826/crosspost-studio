import { queryAllDeep } from "./query";
import type { PlatformDomDefinition } from "./types";

function hasSaveEvidence(definition: PlatformDomDefinition): boolean {
  for (const selector of definition.saveEvidenceSelectors) {
    for (const element of queryAllDeep<HTMLElement>(selector)) {
      if (
        element.getClientRects().length > 0 &&
        definition.saveEvidenceText.test(element.textContent ?? "")
      ) {
        return true;
      }
    }
  }
  return false;
}

export function saveEvidenceSignature(definition: PlatformDomDefinition): string {
  return definition.saveEvidenceSelectors
    .flatMap((selector) =>
      Array.from(
        queryAllDeep<HTMLElement>(selector),
        (element) =>
          [
            element.textContent?.trim() ?? "",
            element.className,
            element.getAttribute("aria-label") ?? "",
            element.dataset.state ?? ""
          ].join("\u0000")
      )
    )
    .join("\n");
}

export async function waitForSaveEvidence(
  definition: PlatformDomDefinition,
  initialSignature: string,
  timeoutMs = 20_000
): Promise<boolean> {
  return new Promise((resolve) => {
    let sawStatusChange = saveEvidenceSignature(definition) !== initialSignature;
    if (sawStatusChange && hasSaveEvidence(definition)) {
      resolve(true);
      return;
    }
    const deadline = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (saveEvidenceSignature(definition) !== initialSignature) {
        sawStatusChange = true;
      }
      if (!sawStatusChange || !hasSaveEvidence(definition)) {
        return;
      }
      window.clearTimeout(deadline);
      observer.disconnect();
      resolve(true);
    });
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  });
}
