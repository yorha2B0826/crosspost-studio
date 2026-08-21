import type { BrowserPlatform } from "../messages";
import { resolveBaijiahaoEditor } from "./baijiahao";
import {
  BAIJIAHAO_EXPLICIT_TITLE_SELECTORS,
  BAIJIAHAO_FEEDITOR_TITLE_SELECTORS
} from "./definitions";
import {
  queryEditableNearVisibleText,
  queryExactVisibleText,
  queryFirst,
  queryVisibleTextPrefix,
  waitFor
} from "./query";
import type { PlatformDomDefinition } from "./types";

export async function resolveTitle(
  platform: BrowserPlatform,
  definition: PlatformDomDefinition,
  expectedTitle: string
): Promise<HTMLElement | undefined> {
  const existing = queryFirst(
    platform === "baijiahao"
      ? BAIJIAHAO_EXPLICIT_TITLE_SELECTORS
      : definition.titleSelectors
  );
  if (existing) {
    return existing;
  }
  if (platform === "baijiahao") {
    const marker = queryVisibleTextPrefix("请输入标题");
    marker?.click();
    if (
      marker &&
      (await waitFor(
        () => Boolean(queryFirst(BAIJIAHAO_EXPLICIT_TITLE_SELECTORS)),
        1_000
      ))
    ) {
      return queryFirst(BAIJIAHAO_EXPLICIT_TITLE_SELECTORS);
    }
    const knownEditor = resolveBaijiahaoEditor();
    const nearbyTitle = queryEditableNearVisibleText(
      "请输入标题",
      knownEditor
    );
    if (nearbyTitle) {
      return nearbyTitle;
    }
    const hasUeditorShell = Boolean(
      queryFirst([".editor-outter-wrapper", ".ueditor", ".edui-editor"])
    );
    return hasUeditorShell
      ? queryFirst(BAIJIAHAO_FEEDITOR_TITLE_SELECTORS, knownEditor)
      : undefined;
  }
  if (platform !== "csdn") {
    return undefined;
  }
  const activator =
    queryExactVisibleText("【无标题】") ?? queryExactVisibleText(expectedTitle);
  if (!activator) {
    return undefined;
  }
  activator.click();
  await waitFor(() => Boolean(queryFirst(definition.titleSelectors)), 1_000);
  return queryFirst(definition.titleSelectors);
}

export function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.localName === "textarea";
}

function isTextInput(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement {
  return element.localName === "input" || isTextArea(element);
}

export function isEditableTitle(element: HTMLElement): boolean {
  const contentEditable = element.getAttribute("contenteditable");
  return (
    isTextInput(element) ||
    element.isContentEditable ||
    (contentEditable !== null && contentEditable !== "false")
  );
}

export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    isTextArea(element)
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setTitleValue(element: HTMLElement, value: string): void {
  if (isTextInput(element)) {
    setNativeValue(element, value);
    return;
  }
  element.focus();
  element.textContent = value;
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" })
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
