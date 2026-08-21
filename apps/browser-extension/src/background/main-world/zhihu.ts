import type {
  SetZhihuRichTextRequest,
  SetZhihuRichTextResponse
} from "../../lib/messages";
import { browser } from "wxt/browser";
import { isExpectedDraftUrl } from "../../lib/platforms";

/**
 * Runs inside Zhihu's page world. Draft.js maintains an internal selection
 * model and can roll back DOM mutations made by an isolated content script,
 * so replacement must pass through its paste handler and remain stable before
 * it is accepted.
 */
export async function applyZhihuRichTextInPage(
  sourceHtml: string
): Promise<SetZhihuRichTextResponse> {
  const editorSelectors = [
    ".public-DraftEditor-content[contenteditable='true']",
    ".DraftEditor-root [contenteditable='true']",
    ".ProseMirror[contenteditable='true']",
    "[contenteditable='true'][role='textbox']"
  ];
  const resolveEditor = (): HTMLElement | null => {
    for (const selector of editorSelectors) {
      const candidate = document.querySelector<HTMLElement>(selector);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  };
  const normalize = (value: string): string =>
    value
      .normalize("NFKC")
      .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, "");
  const sourceDocument = new DOMParser().parseFromString(
    sourceHtml,
    "text/html"
  );
  const expectedFormulaCounts = new Map<string, number>();
  for (const formula of sourceDocument.body.querySelectorAll<HTMLElement>(
    "[data-tex]"
  )) {
    const latex = formula.dataset.tex;
    if (latex) {
      expectedFormulaCounts.set(
        latex,
        (expectedFormulaCounts.get(latex) ?? 0) + 1
      );
    }
  }
  const expectedBlocks = (): string[] => {
    const blockSelector =
      "h1, h2, h3, h4, h5, h6, p, li, th, td, blockquote, pre";
    return Array.from(
      sourceDocument.body.querySelectorAll<HTMLElement>(blockSelector)
    )
      .filter((element) => !element.querySelector(blockSelector))
      .flatMap((element) => {
        const clone = element.cloneNode(true) as HTMLElement;
        for (const media of clone.querySelectorAll(
          "img, svg, video, iframe, canvas, [data-tex], .FormulaCSR, .ztext-math"
        )) {
          media.replaceWith(clone.ownerDocument.createTextNode("\0"));
        }
        return (clone.textContent ?? "")
          .split("\0")
          .map(normalize)
          .filter((text) => text.length > 0);
      });
  };
  const anchors = expectedBlocks();
  if (anchors.length === 0) {
    return {
      applied: false,
      message: "Zhihu received an empty article body."
    };
  }
  const matchesExpectedBody = (): boolean => {
    const editor = resolveEditor();
    if (!editor) {
      return false;
    }
    const actual = normalize(editor.textContent ?? "");
    if (!anchors.every((anchor) => actual.includes(anchor))) {
      return false;
    }
    const actualFormulaCounts = new Map<string, number>();
    for (const formula of editor.querySelectorAll<HTMLElement>("[data-tex]")) {
      const latex = formula.dataset.tex;
      if (latex) {
        actualFormulaCounts.set(
          latex,
          (actualFormulaCounts.get(latex) ?? 0) + 1
        );
      }
    }
    return Array.from(expectedFormulaCounts).every(
      ([latex, count]) => (actualFormulaCounts.get(latex) ?? 0) >= count
    );
  };
  const pause = async (milliseconds: number): Promise<void> => {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  };
  const waitForStableBody = async (
    timeoutMs: number,
    stableMs = 750
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    let matchingSince: number | undefined;
    while (Date.now() < deadline) {
      if (matchesExpectedBody()) {
        matchingSince ??= Date.now();
        if (Date.now() - matchingSince >= stableMs) {
          return true;
        }
      } else {
        matchingSince = undefined;
      }
      await pause(50);
    }
    return false;
  };
  const selectAll = (editor: HTMLElement): boolean => {
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }
    editor.focus();
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyA",
        // Draft.js selects the command modifier for the host OS. Setting both
        // flags keeps this injected event platform-neutral; it is untrusted,
        // so the browser itself will not execute a second system shortcut.
        ctrlKey: true,
        key: "a",
        metaKey: true
      })
    );
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    editor.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: "KeyA",
        ctrlKey: true,
        key: "a",
        metaKey: true
      })
    );
    return true;
  };
  const createClipboard = (): DataTransfer | undefined => {
    if (typeof DataTransfer !== "function") {
      return undefined;
    }
    const clipboard = new DataTransfer();
    const plainText =
      new DOMParser().parseFromString(sourceHtml, "text/html").body
        .textContent ?? "";
    clipboard.setData("text/html", sourceHtml);
    clipboard.setData("text/plain", plainText);
    return clipboard;
  };
  const dispatchPaste = (editor: HTMLElement): boolean => {
    const clipboard = createClipboard();
    if (!clipboard || typeof ClipboardEvent !== "function") {
      return false;
    }
    return !editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard
      })
    );
  };
  type ReactPasteProps = {
    onPaste: (event: unknown) => unknown;
  };
  const resolveReactPasteProps = (
    editor: HTMLElement
  ): { currentTarget: HTMLElement; props: ReactPasteProps } | undefined => {
    let element: HTMLElement | null = editor;
    while (element) {
      const propsKey = Object.getOwnPropertyNames(element).find((key) =>
        key.startsWith("__reactProps$")
      );
      const directProps: unknown = propsKey
        ? (Reflect.get(element, propsKey) as unknown)
        : undefined;
      if (
        typeof directProps === "object" &&
        directProps !== null &&
        typeof Reflect.get(directProps, "onPaste") === "function"
      ) {
        return {
          currentTarget: element,
          props: directProps as ReactPasteProps
        };
      }
      element = element.parentElement;
    }

    const fiberKey = Object.getOwnPropertyNames(editor).find(
      (key) =>
        key.startsWith("__reactFiber$") ||
        key.startsWith("__reactInternalInstance$")
    );
    let fiber = fiberKey
      ? (Reflect.get(editor, fiberKey) as
          | {
              memoizedProps?: unknown;
              pendingProps?: unknown;
              return?: unknown;
            }
          | undefined)
      : undefined;
    for (let depth = 0; fiber && depth < 18; depth += 1) {
      for (const candidate of [fiber.memoizedProps, fiber.pendingProps]) {
        if (
          typeof candidate === "object" &&
          candidate !== null &&
          typeof Reflect.get(candidate, "onPaste") === "function"
        ) {
          return {
            currentTarget: editor,
            props: candidate as ReactPasteProps
          };
        }
      }
      fiber = fiber.return as
        | {
            memoizedProps?: unknown;
            pendingProps?: unknown;
            return?: unknown;
          }
        | undefined;
    }
    return undefined;
  };
  const invokeReactPaste = async (editor: HTMLElement): Promise<boolean> => {
    const resolved = resolveReactPasteProps(editor);
    const clipboard = createClipboard();
    if (!resolved || !clipboard) {
      return false;
    }
    let defaultPrevented = false;
    let propagationStopped = false;
    const nativeEvent =
      typeof ClipboardEvent === "function"
        ? new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard
          })
        : new Event("paste", { bubbles: true, cancelable: true });
    const event = {
      clipboardData: clipboard,
      currentTarget: resolved.currentTarget,
      isDefaultPrevented: () => defaultPrevented,
      isPropagationStopped: () => propagationStopped,
      nativeEvent,
      persist: () => undefined,
      preventDefault: () => {
        defaultPrevented = true;
        nativeEvent.preventDefault();
      },
      stopPropagation: () => {
        propagationStopped = true;
        nativeEvent.stopPropagation();
      },
      target: editor,
      type: "paste"
    };
    await Promise.resolve(Reflect.apply(resolved.props.onPaste, resolved.props, [event]));
    return true;
  };

  let editor = resolveEditor();
  if (!editor || !selectAll(editor)) {
    return {
      applied: false,
      message: "Zhihu's visible Draft.js editor is not ready."
    };
  }
  const nativePasteAccepted = dispatchPaste(editor);
  if (
    (nativePasteAccepted || matchesExpectedBody()) &&
    (await waitForStableBody(4_000))
  ) {
    const settledEditor = resolveEditor();
    return {
      applied: true,
      bodyText: settledEditor?.textContent ?? ""
    };
  }

  editor = resolveEditor();
  if (editor && selectAll(editor) && (await invokeReactPaste(editor))) {
    if (await waitForStableBody(4_000)) {
      const settledEditor = resolveEditor();
      return {
        applied: true,
        bodyText: settledEditor?.textContent ?? ""
      };
    }
  }

  return {
    applied: false,
    bodyText: resolveEditor()?.textContent ?? "",
    message:
      "Zhihu's Draft.js model did not preserve the replacement article body."
  };
}

export async function setZhihuRichTextInMainWorld(
  tabId: number | undefined,
  request: SetZhihuRichTextRequest
): Promise<SetZhihuRichTextResponse> {
  if (tabId === undefined) {
    return { applied: false, message: "The Zhihu tab could not be identified." };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isExpectedDraftUrl("zhihu", tab.url)) {
    return {
      applied: false,
      message: "The active tab is not a Zhihu draft editor."
    };
  }
  const [injection] = await browser.scripting.executeScript({
    args: [request.html],
    func: applyZhihuRichTextInPage,
    target: { tabId },
    world: "MAIN"
  });
  return (
    injection?.result ?? {
      applied: false,
      message: "Zhihu did not return an editor result."
    }
  );
}
