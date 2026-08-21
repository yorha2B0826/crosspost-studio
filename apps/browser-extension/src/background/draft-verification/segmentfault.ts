import { browser } from "wxt/browser";
import { pause, reloadTabAndWait } from "../tab-flow";

export async function verifySegmentFaultDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedMarkdown: string,
  expectedImageCount: number,
  isCancelled?: () => boolean
): Promise<boolean> {
  // SegmentFault does not expose a persistent visible autosave label. Its
  // server-side debounce can lag behind the editor after several image uploads,
  // so keep the completed document visible long enough before reload readback.
  await pause(12_000, isCancelled);
  await reloadTabAndWait(tabId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (isCancelled?.()) {
      return false;
    }
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle, expectedMarkdown, expectedImageCount],
      func: (
        title: string,
        markdown: string,
        imageCount: number
      ): boolean | undefined => {
        const titleInput = document.querySelector<HTMLInputElement>(
          "input#title, input[name='title']"
        );
        type SegmentFaultCodeMirror = {
          getValue: () => string;
        };
        // NOTE: this React fiber walk mirrors the one in
        // main-world/segmentfault.ts (resolveCodeMirrorModel). executeScript
        // functions must be self-contained, so the copies cannot share code —
        // keep them in sync when changing.
        const isCodeMirrorModel = (
          value: unknown
        ): value is SegmentFaultCodeMirror =>
          typeof value === "object" &&
          value !== null &&
          typeof Reflect.get(value, "getValue") === "function";
        const resolveCodeMirrorModel =
          (): SegmentFaultCodeMirror | undefined => {
            const host = document.querySelector<HTMLElement>(".sf-editor");
            if (!host) {
              return undefined;
            }
            const fiberKey = Object.getOwnPropertyNames(host).find(
              (key) =>
                key.startsWith("__reactFiber$") ||
                key.startsWith("__reactInternalInstance$")
            );
            let fiber = fiberKey
              ? (Reflect.get(host, fiberKey) as
                  | { memoizedState?: unknown; return?: unknown }
                  | undefined)
              : undefined;
            for (let depth = 0; fiber && depth < 12; depth += 1) {
              let hook = fiber.memoizedState as
                | { memoizedState?: unknown; next?: unknown }
                | undefined;
              for (
                let hookIndex = 0;
                hook && hookIndex < 40;
                hookIndex += 1
              ) {
                if (isCodeMirrorModel(hook.memoizedState)) {
                  return hook.memoizedState;
                }
                hook = hook.next as
                  | { memoizedState?: unknown; next?: unknown }
                  | undefined;
              }
              fiber = fiber.return as
                | { memoizedState?: unknown; return?: unknown }
                | undefined;
            }
            return undefined;
          };
        const model = resolveCodeMirrorModel();
        if (!titleInput || !model) {
          return undefined;
        }
        const normalize = (value: string): string =>
          value.replace(/\r\n?/g, "\n").trimEnd();
        // CodeMirror virtualizes off-screen lines, so its rendered `pre`
        // elements are not a complete server readback. The model is populated
        // from the reloaded draft and contains the full Markdown document.
        const persisted = model.getValue();
        const imageUrls = Array.from(
          persisted.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g),
          (match) => match[1]
        ).filter((source): source is string => source !== undefined);
        return (
          titleInput.value.trim() === title.trim() &&
          normalize(persisted) === normalize(markdown) &&
          !persisted.includes("CROSSPOST_IMAGE_") &&
          !/!\[[^\]]*\]\((?:data:|blob:)/i.test(persisted) &&
          imageUrls.length === imageCount &&
          imageUrls.every((source) => /^https?:\/\//i.test(source))
        );
      },
      target: { tabId },
      world: "MAIN"
    });
    if (injection?.result === true) {
      return true;
    }
    await pause(250, isCancelled);
  }
  return false;
}
