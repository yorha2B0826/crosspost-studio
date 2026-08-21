import type { BrowserPlatform } from "../messages";
import { queryExactVisibleText, queryFirst, waitFor } from "./query";
import { isTextArea } from "./title";
import type { PlatformDomDefinition } from "./types";

export async function activateDraftEditor(
  platform: BrowserPlatform,
  definition: PlatformDomDefinition
): Promise<void> {
  const editorIsReady = (): boolean =>
    Boolean(queryFirst(definition.editorSelectors));
  if (editorIsReady()) {
    return;
  }
  if (
    definition.editorReadyTimeoutMs &&
    (await waitFor(editorIsReady, definition.editorReadyTimeoutMs))
  ) {
    return;
  }

  const activatorText =
    platform === "jianshu"
      ? "新建文章"
      : platform === "oschina"
        ? "切换到MD编辑器"
        : undefined;
  if (!activatorText) {
    return;
  }
  const activator = queryExactVisibleText(activatorText);
  if (!activator) {
    return;
  }
  activator.click();
  await waitFor(
    () =>
      Boolean(
        queryFirst(definition.titleSelectors) &&
          queryFirst(definition.editorSelectors)
      ),
    8_000
  );
}

export function focusEditor(editor: HTMLElement): void {
  editor.focus();
  if (editor.ownerDocument.activeElement === editor) {
    return;
  }
  if (
    editor.localName === "body" ||
    editor.classList.contains("edui-body-container")
  ) {
    editor.setAttribute("tabindex", "-1");
    editor.focus();
  }
}

export function selectEditorContents(editor: HTMLElement): void {
  const editorDocument = editor.ownerDocument;
  const selection = editorDocument.defaultView?.getSelection();
  if (!selection) {
    return;
  }
  const range = editorDocument.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editorDocument.dispatchEvent(new Event("selectionchange", { bubbles: true }));
}

export function selectionIsInside(editor: HTMLElement): boolean {
  const anchor = editor.ownerDocument.defaultView?.getSelection()?.anchorNode;
  return Boolean(
    anchor && (anchor === editor || editor.contains(anchor))
  );
}

export function dispatchEditorInput(
  editor: HTMLElement,
  inputType: "deleteContentBackward" | "insertFromPaste"
): void {
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
}

export function replaceEditorHtml(editor: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(parsed.body.childNodes, (node) =>
    editor.ownerDocument.importNode(node, true)
  );
  editor.replaceChildren(...nodes);
}

export function findTokenRange(editor: HTMLElement, token: string): Range | undefined {
  const editorDocument = editor.ownerDocument;
  const walker = editorDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const start = text.indexOf(token);
    if (start >= 0) {
      const range = editorDocument.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + token.length);
      return range;
    }
    node = walker.nextNode();
  }
  return undefined;
}

export function editableText(editor: HTMLElement): string {
  return isTextArea(editor)
    ? editor.value
    : editor.textContent ?? "";
}

export function hasEditorContent(editor: HTMLElement): boolean {
  return (
    Boolean(editor.textContent?.trim()) ||
    editor.querySelectorAll("img, table, .FormulaCSR[data-tex]").length > 0
  );
}

export async function clearEditor(
  resolveEditor: () => HTMLElement | undefined
): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const editor = resolveEditor();
    if (!editor) {
      throw new Error("The visible editor disappeared before it could be updated.");
    }
    if (!hasEditorContent(editor)) {
      return editor;
    }
    focusEditor(editor);
    selectEditorContents(editor);
    const selection = editor.ownerDocument.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0 || !selectionIsInside(editor)) {
      throw new Error(
        "The existing editor content could not be selected safely; no replacement was inserted."
      );
    }
    selection.getRangeAt(0).deleteContents();
    dispatchEditorInput(editor, "deleteContentBackward");
    const cleared = await waitFor(() => {
      const currentEditor = resolveEditor();
      return Boolean(currentEditor && !hasEditorContent(currentEditor));
    }, 750);
    const currentEditor = resolveEditor();
    if (cleared && currentEditor && !hasEditorContent(currentEditor)) {
      return currentEditor;
    }
  }
  throw new Error(
    "The existing editor content could not be cleared safely; no replacement was inserted."
  );
}
