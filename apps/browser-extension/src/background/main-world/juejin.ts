import type {
  SetJuejinMarkdownRequest,
  SetJuejinMarkdownResponse
} from "../../lib/messages";
import { browser } from "wxt/browser";
import { isExpectedDraftUrl } from "../../lib/platforms";

export async function setJuejinMarkdownInMainWorld(
  tabId: number | undefined,
  request: SetJuejinMarkdownRequest
): Promise<SetJuejinMarkdownResponse> {
  if (tabId === undefined) {
    return { applied: false, message: "The Juejin tab could not be identified." };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isExpectedDraftUrl("juejin", tab.url)) {
    return { applied: false, message: "The active tab is not a Juejin draft editor." };
  }
  const [injection] = await browser.scripting.executeScript({
    args: [request.markdown],
    func: async (source: string) => {
      type CodeMirrorModel = {
        focus?: () => void;
        getValue: () => string;
        refresh?: () => void;
        save?: () => void;
        setValue: (value: string) => void;
      };
      const normalize = (value: string): string =>
        value.replace(/\r\n?/g, "\n").trimEnd();
      const wrapper = document.querySelector<HTMLElement>(
        ".bytemd-editor .CodeMirror, .CodeMirror"
      );
      const candidate: unknown = wrapper
        ? Reflect.get(wrapper, "CodeMirror")
        : undefined;
      const model =
        typeof candidate === "object" &&
        candidate !== null &&
        typeof Reflect.get(candidate, "getValue") === "function" &&
        typeof Reflect.get(candidate, "setValue") === "function"
          ? (candidate as CodeMirrorModel)
          : undefined;
      if (!model) {
        return {
          applied: false,
          message: "Juejin's visible CodeMirror model is not ready."
        };
      }
      model.setValue(source);
      model.save?.();
      model.focus?.();
      model.refresh?.();
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        if (normalize(model.getValue()) === normalize(source)) {
          return { applied: true, markdown: model.getValue() };
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        });
      }
      const markdown = model.getValue();
      return {
        applied: false,
        markdown,
        message: "Juejin's CodeMirror model did not preserve the Markdown."
      };
    },
    target: { tabId },
    world: "MAIN"
  });
  return (
    (injection?.result as SetJuejinMarkdownResponse | undefined) ?? {
      applied: false,
      message: "Juejin did not return an editor result."
    }
  );
}
