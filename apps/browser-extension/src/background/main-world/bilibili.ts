import type {
  UploadBilibiliImageRequest,
  UploadBilibiliImageResponse
} from "../../lib/messages";
import { browser } from "wxt/browser";
import { isExpectedDraftUrl } from "../../lib/platforms";

export async function uploadBilibiliImageInMainWorld(
  tabId: number | undefined,
  request: UploadBilibiliImageRequest
): Promise<UploadBilibiliImageResponse> {
  if (tabId === undefined) {
    return { uploaded: false, message: "The Bilibili tab could not be identified." };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isExpectedDraftUrl("bilibili", tab.url)) {
    return { uploaded: false, message: "The active tab is not a Bilibili draft editor." };
  }
  if (!request.dataUrl.startsWith("data:image/")) {
    return { uploaded: false, message: "Bilibili received an invalid image payload." };
  }

  const [injection] = await browser.scripting.executeScript({
    args: [
      request.dataUrl,
      request.fileName,
      request.mimeType,
      request.token
    ],
    func: async (
      dataUrl: string,
      fileName: string,
      mimeType: string,
      token: string
    ) => {
      const pauseInPage = async (milliseconds: number): Promise<void> => {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, milliseconds);
        });
      };
      const editor = document.querySelector<HTMLElement>(
        ".tiptap.ProseMirror.eva3-editor[contenteditable='true']"
      );
      const toolbar = document.querySelector<HTMLElement>(
        "eva3-toolbar-image"
      );
      if (!editor || !toolbar?.shadowRoot) {
        return {
          uploaded: false,
          message: "Bilibili's visible image toolbar is not ready."
        };
      }

      const findTokenRange = (): Range | undefined => {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent ?? "";
          const index = text.indexOf(token);
          if (index >= 0) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + token.length);
            return range;
          }
          node = walker.nextNode();
        }
        return undefined;
      };
      const tokenRange = findTokenRange();
      const selection = window.getSelection();
      if (!tokenRange || !selection) {
        return {
          uploaded: false,
          message: "Bilibili lost the image insertion point."
        };
      }
      editor.focus();
      selection.removeAllRanges();
      selection.addRange(tokenRange);
      document.dispatchEvent(
        new Event("selectionchange", { bubbles: true })
      );

      const existingUrls = new Map<string, number>();
      for (const image of editor.querySelectorAll<HTMLImageElement>("img")) {
        const source = image.currentSrc || image.src;
        if (source) {
          existingUrls.set(source, (existingUrls.get(source) ?? 0) + 1);
        }
      }
      const dropdown = toolbar.shadowRoot.querySelector<HTMLElement>(
        "eva3-dropdown"
      );
      const popover = dropdown?.shadowRoot?.querySelector<HTMLElement>(
        "eva3-popover"
      );
      const trigger = popover?.querySelector<HTMLElement>(
        ".dropdown__button"
      );
      const uploadItem = Array.from(
        toolbar.shadowRoot.querySelectorAll<HTMLElement>(".item")
      ).find((candidate) => candidate.textContent?.trim() === "上传图片");
      if (!uploadItem) {
        return {
          uploaded: false,
          message: "Bilibili's upload-image menu is unavailable."
        };
      }

      let capturedInput: HTMLInputElement | undefined;
      const captureInput = (input: HTMLInputElement): void => {
        capturedInput = input;
      };
      const originalInputClick = Reflect.get(
        HTMLInputElement.prototype,
        "click"
      );
      HTMLInputElement.prototype.click = function click(
        this: HTMLInputElement
      ): void {
        if (this.type === "file") {
          captureInput(this);
          return;
        }
        Reflect.apply(originalInputClick, this, []);
      };
      try {
        const uploadItemIsVisible = (): boolean => {
          const bounds = uploadItem.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        };
        const waitForCapturedInput = async (
          timeoutMs: number
        ): Promise<boolean> => {
          const deadline = Date.now() + timeoutMs;
          while (!capturedInput && Date.now() < deadline) {
            await pauseInPage(100);
          }
          return capturedInput !== undefined;
        };

        // The menu item remains connected while its popover is closed, and its
        // click handler still creates Bilibili's native file input. Invoking it
        // directly avoids relying on a synthetic toolbar click, which the
        // current editor ignores because it is not a trusted pointer event.
        uploadItem.click();
        if (!(await waitForCapturedInput(1_000))) {
          if (!uploadItemIsVisible()) {
            trigger?.click();
          }
          const menuDeadline = Date.now() + 2_000;
          while (!uploadItemIsVisible() && Date.now() < menuDeadline) {
            await pauseInPage(100);
          }
          uploadItem.click();
          await waitForCapturedInput(3_000);
        }
      } finally {
        HTMLInputElement.prototype.click = originalInputClick;
      }
      if (!capturedInput) {
        return {
          uploaded: false,
          message: "Bilibili did not expose its native image file input."
        };
      }

      const separator = dataUrl.indexOf(",");
      if (separator < 0) {
        return {
          uploaded: false,
          message: "Bilibili received an invalid native image payload."
        };
      }
      const binary = atob(dataUrl.slice(separator + 1));
      const imageBytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        imageBytes[index] = binary.charCodeAt(index);
      }
      const imageFile = new File([imageBytes], fileName, {
        type: mimeType || "image/png"
      });
      const transfer = new DataTransfer();
      transfer.items.add(imageFile);
      try {
        capturedInput.files = transfer.files;
      } catch {
        Object.defineProperty(capturedInput, "files", {
          configurable: true,
          value: transfer.files
        });
      }
      capturedInput.dispatchEvent(new Event("input", { bubbles: true }));
      capturedInput.dispatchEvent(new Event("change", { bubbles: true }));

      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const currentCounts = new Map<string, number>();
        for (const image of editor.querySelectorAll<HTMLImageElement>("img")) {
          const source = image.currentSrc || image.src;
          if (source) {
            currentCounts.set(source, (currentCounts.get(source) ?? 0) + 1);
          }
        }
        const uploadedUrl = Array.from(currentCounts).find(
          ([url, count]) =>
            /^(?:https?:\/\/|data:image\/|blob:)/i.test(url) &&
            count > (existingUrls.get(url) ?? 0)
        )?.[0];
        if (uploadedUrl) {
          const menuCloseDeadline = Date.now() + 2_000;
          while (
            uploadItem.getBoundingClientRect().height > 0 &&
            Date.now() < menuCloseDeadline
          ) {
            await pauseInPage(100);
          }
          return { uploaded: true, url: uploadedUrl };
        }
        await pauseInPage(200);
      }
      return {
        uploaded: false,
        message: "Bilibili did not confirm the native image upload."
      };
    },
    target: { tabId },
    world: "MAIN"
  });
  return (
    (injection?.result as UploadBilibiliImageResponse | undefined) ?? {
      uploaded: false,
      message: "Bilibili did not return an image upload result."
    }
  );
}
