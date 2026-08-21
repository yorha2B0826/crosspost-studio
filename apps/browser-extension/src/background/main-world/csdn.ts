import type {
  SetCsdnMarkdownRequest,
  SetCsdnMarkdownResponse
} from "../../lib/messages";
import { browser } from "wxt/browser";
import { isExpectedDraftUrl } from "../../lib/platforms";

export async function setCsdnMarkdownInMainWorld(
  tabId: number | undefined,
  request: SetCsdnMarkdownRequest
): Promise<SetCsdnMarkdownResponse> {
  if (tabId === undefined) {
    return { applied: false, message: "The CSDN tab could not be identified." };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isExpectedDraftUrl("csdn", tab.url)) {
    return { applied: false, message: "The active tab is not a CSDN draft editor." };
  }
  const [injection] = await browser.scripting.executeScript({
    args: [request.markdown],
    func: async (source: string) => {
      const editorSelector =
        "pre.editor__inner.markdown-highlighting[contenteditable='true']";
      const resolveEditor = (): HTMLElement | null =>
        document.querySelector<HTMLElement>(editorSelector);
      const editor = resolveEditor();
      const execCommand = Reflect.get(document, "execCommand") as
        | ((commandId: string, showUi: boolean, value?: string | null) => boolean)
        | undefined;
      if (!editor || typeof execCommand !== "function") {
        return {
          applied: false,
          message: "The CSDN Markdown editor is not ready."
        };
      }
      const waitForEditorFrame = async (): Promise<void> => {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      };
      const waitForEditorSettle = async (delayMs = 100): Promise<void> => {
        await waitForEditorFrame();
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, delayMs);
        });
        await waitForEditorFrame();
      };
      const normalizeMarkdown = (value: string): string =>
        value.replace(/\r\n?/g, "\n").trimEnd();
      const placeCaretAtEnd = (target: HTMLElement): boolean => {
        const currentSelection = window.getSelection();
        if (!currentSelection) {
          return false;
        }
        target.focus();
        const currentRange = document.createRange();
        currentRange.selectNodeContents(target);
        currentRange.collapse(false);
        currentSelection.removeAllRanges();
        currentSelection.addRange(currentRange);
        document.dispatchEvent(
          new Event("selectionchange", { bubbles: true })
        );
        return true;
      };
      const selectAll = (target: HTMLElement): boolean => {
        const currentSelection = window.getSelection();
        if (!currentSelection) {
          return false;
        }
        target.focus();
        const currentRange = document.createRange();
        currentRange.selectNodeContents(target);
        currentSelection.removeAllRanges();
        currentSelection.addRange(currentRange);
        document.dispatchEvent(
          new Event("selectionchange", { bubbles: true })
        );
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        return true;
      };
      const wakeEditorModel = async (): Promise<boolean> => {
        const target = resolveEditor();
        if (!target || !placeCaretAtEnd(target)) {
          return false;
        }
        const inserted = execCommand.call(
          document,
          "insertText",
          false,
          " "
        );
        await waitForEditorFrame();
        const editorAfterInsert = resolveEditor();
        if (!inserted || !editorAfterInsert || !placeCaretAtEnd(editorAfterInsert)) {
          return false;
        }
        const deleted = execCommand.call(document, "delete", false, null);
        await waitForEditorSettle(250);
        return (
          deleted &&
          normalizeMarkdown(resolveEditor()?.textContent ?? "") ===
            normalizeMarkdown(source)
        );
      };

      // CSDN's editor is powered by cledit. Its source model observes mutations
      // on this element, so a single text node preserves literal newlines while
      // execCommand may translate them into HTML blocks whose textContent is
      // later flattened by the editor's own highlighter.
      editor.replaceChildren(document.createTextNode(source));
      await waitForEditorSettle(1_200);
      const mutationMarkdown = resolveEditor()?.textContent ?? "";
      if (
        normalizeMarkdown(mutationMarkdown) === normalizeMarkdown(source)
      ) {
        const modelAwake = await wakeEditorModel();
        const settledMarkdown = resolveEditor()?.textContent ?? "";
        return {
          applied: modelAwake,
          markdown: settledMarkdown,
          message: modelAwake
            ? undefined
            : "CSDN displayed the Markdown but did not accept a native edit event."
        };
      }

      if (
        resolveEditor() &&
        selectAll(resolveEditor()!) &&
        typeof DataTransfer === "function" &&
        typeof ClipboardEvent === "function"
      ) {
        await waitForEditorFrame();
        const clipboard = new DataTransfer();
        clipboard.setData("text/plain", source);
        const pasteHandled = !editor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard
          })
        );
        await waitForEditorSettle(1_200);
        const pastedMarkdown = resolveEditor()?.textContent ?? "";
        if (
          pasteHandled &&
          normalizeMarkdown(pastedMarkdown) === normalizeMarkdown(source)
        ) {
          return { applied: true, markdown: pastedMarkdown };
        }
      }

      const fallbackEditor = resolveEditor();
      if (!fallbackEditor || !selectAll(fallbackEditor)) {
        return {
          applied: false,
          message: "The CSDN Markdown editor lost its selection."
        };
      }

      const directApplied = execCommand.call(
        document,
        "insertText",
        false,
        source
      );
      await waitForEditorSettle(1_200);
      const directMarkdown = resolveEditor()?.textContent ?? "";
      if (
        directApplied &&
        normalizeMarkdown(directMarkdown) === normalizeMarkdown(source)
      ) {
        return { applied: true, markdown: directMarkdown };
      }

      const incrementalEditor = resolveEditor();
      if (!incrementalEditor || !selectAll(incrementalEditor)) {
        return {
          applied: false,
          message: "The CSDN Markdown editor lost its selection."
        };
      }

      const lines = source.replace(/\r\n?/g, "\n").split("\n");
      let applied = execCommand.call(
        document,
        "insertText",
        false,
        lines[0] ?? ""
      );
      await waitForEditorFrame();
      for (const line of lines.slice(1)) {
        const editorBeforeBreak = resolveEditor();
        if (!editorBeforeBreak || !placeCaretAtEnd(editorBeforeBreak)) {
          applied = false;
          break;
        }
        applied =
          execCommand.call(document, "insertLineBreak", false, null) && applied;
        await waitForEditorFrame();
        if (line) {
          const editorBeforeText = resolveEditor();
          if (!editorBeforeText || !placeCaretAtEnd(editorBeforeText)) {
            applied = false;
            break;
          }
          applied =
            execCommand.call(document, "insertText", false, line) && applied;
          await waitForEditorFrame();
        }
      }
      await waitForEditorSettle(1_200);
      const settledEditor = resolveEditor();
      const settledMarkdown = settledEditor?.textContent ?? "";
      const preserved =
        normalizeMarkdown(settledMarkdown) === normalizeMarkdown(source);
      return {
        applied: applied && preserved,
        markdown: settledMarkdown,
        message:
          applied && preserved
            ? undefined
            : "CSDN did not preserve the Markdown after its editor settled."
      };
    },
    target: { tabId },
    world: "MAIN"
  });
  return (
    (injection?.result as SetCsdnMarkdownResponse | undefined) ?? {
      applied: false,
      message: "CSDN did not return an editor result."
    }
  );
}
