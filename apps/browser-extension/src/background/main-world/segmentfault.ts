import type {
  SetSegmentFaultMarkdownRequest,
  SetSegmentFaultMarkdownResponse
} from "../../lib/messages";
import { browser } from "wxt/browser";
import { isExpectedDraftUrl } from "../../lib/platforms";

export async function setSegmentFaultMarkdownInMainWorld(
  tabId: number | undefined,
  request: SetSegmentFaultMarkdownRequest
): Promise<SetSegmentFaultMarkdownResponse> {
  if (tabId === undefined) {
    return {
      applied: false,
      message: "The SegmentFault tab could not be identified."
    };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isExpectedDraftUrl("segmentfault", tab.url)) {
    return {
      applied: false,
      message: "The active tab is not a SegmentFault draft editor."
    };
  }

  const [injection] = await browser.scripting.executeScript({
    args: [request.markdown],
    func: async (source: string) => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        ".CodeMirror textarea"
      );
      const code = document.querySelector<HTMLElement>(
        ".CodeMirror .CodeMirror-code"
      );
      if (!textarea || !code) {
        return {
          applied: false,
          message: "SegmentFault's visible CodeMirror editor is not ready."
        };
      }
      const normalize = (value: string): string =>
        value.replace(/\r\n?/g, "\n").trimEnd();
      const readMarkdown = (): string => {
        const lines = Array.from(
          code.querySelectorAll<HTMLElement>("pre.CodeMirror-line")
        );
        if (lines.length === 0) {
          return code.textContent ?? "";
        }
        return lines
          .map((line) =>
            (line.textContent ?? "")
              .replaceAll("\u200b", "")
              .replaceAll("\u00a0", " ")
          )
          .join("\n");
      };
      const pauseInPage = async (milliseconds: number): Promise<void> => {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, milliseconds);
        });
      };
      const waitForSource = async (timeoutMs: number): Promise<boolean> => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (normalize(readMarkdown()) === normalize(source)) {
            return true;
          }
          await pauseInPage(50);
        }
        return normalize(readMarkdown()) === normalize(source);
      };
      type SegmentFaultCodeMirror = {
        getValue: () => string;
        replaceRange?: (
          replacement: string,
          from: { ch: number; line: number },
          to?: { ch: number; line: number },
          origin?: string
        ) => void;
        setValue: (value: string) => void;
      };
      type SegmentFaultStore = {
        dispatch: (action: {
          payload: { markdownContent: string };
          type: "editor/saveMarkdown";
        }) => unknown;
        getState: () => unknown;
      };
      const isCodeMirrorModel = (
        value: unknown
      ): value is SegmentFaultCodeMirror =>
        typeof value === "object" &&
        value !== null &&
        typeof Reflect.get(value, "getValue") === "function" &&
        typeof Reflect.get(value, "setValue") === "function";
      // NOTE: this React fiber walk is deliberately duplicated in
      // draft-verification/segmentfault.ts (resolveCodeMirrorModel inside the
      // executeScript payload). executeScript functions must be self-contained,
      // so the two copies cannot share code — keep them in sync when changing.
      const resolveCodeMirrorModel = (): SegmentFaultCodeMirror | undefined => {
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
          for (let hookIndex = 0; hook && hookIndex < 40; hookIndex += 1) {
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
      const resolveEditorStore = (): SegmentFaultStore | undefined => {
        const chunks = Reflect.get(window, "webpackChunk_N_E") as
          | { push: (value: unknown) => unknown }
          | undefined;
        if (!chunks) {
          return undefined;
        }
        let webpackRequire:
          | ((moduleId: number) => unknown)
          | undefined;
        chunks.push([
          [`crosspost-studio-${Date.now()}`],
          {},
          (requireModule: (moduleId: number) => unknown) => {
            webpackRequire = requireModule;
          }
        ]);
        if (!webpackRequire) {
          return undefined;
        }
        const storeModule = webpackRequire(4790) as
          | { Qm?: () => { _store?: unknown } }
          | undefined;
        const store = storeModule?.Qm?.()._store;
        if (
          typeof store !== "object" ||
          store === null ||
          typeof Reflect.get(store, "dispatch") !== "function" ||
          typeof Reflect.get(store, "getState") !== "function"
        ) {
          return undefined;
        }
        return store as SegmentFaultStore;
      };
      const editorStoreMarkdown = (store: SegmentFaultStore): string => {
        const state = store.getState();
        if (typeof state !== "object" || state === null) {
          return "";
        }
        const editorState: unknown = Reflect.get(state, "editor");
        if (typeof editorState !== "object" || editorState === null) {
          return "";
        }
        const markdown: unknown = Reflect.get(editorState, "markdownContent");
        return typeof markdown === "string" ? markdown : "";
      };
      const editorDraftStatus = (store: SegmentFaultStore): string => {
        const state = store.getState();
        if (typeof state !== "object" || state === null) {
          return "";
        }
        const editorState: unknown = Reflect.get(state, "editor");
        if (typeof editorState !== "object" || editorState === null) {
          return "";
        }
        const draftInfo: unknown = Reflect.get(editorState, "draftInfo");
        if (typeof draftInfo !== "object" || draftInfo === null) {
          return "";
        }
        const status: unknown = Reflect.get(draftInfo, "status");
        return typeof status === "string" ? status : "";
      };
      const waitForFinalAutosave = async (
        store: SegmentFaultStore
      ): Promise<boolean> => {
        // Image dialogs schedule their own four-second debounced saves. The
        // status can still be `saved` while that debounce is pending, so wait
        // for a full quiet window instead of only waiting for an already
        // visible `saving` state. Otherwise the intermediate image request can
        // be mistaken for the final document save.
        const quietDeadline = Date.now() + 25_000;
        let quietSince = Date.now();
        let becameQuiet = false;
        while (Date.now() < quietDeadline) {
          const status = editorDraftStatus(store);
          if (status === "saveFailed") {
            return false;
          }
          if (status === "saving") {
            quietSince = Date.now();
          } else if (Date.now() - quietSince >= 4_500) {
            becameQuiet = true;
            break;
          }
          await pauseInPage(100);
        }
        if (!becameQuiet) {
          return false;
        }

        // Schedule a fresh autosave from the body itself. A reversible title
        // edit can save a stale body snapshot in SegmentFault's controlled
        // editor. Appending and removing one space through CodeMirror emits
        // the normal body change events while leaving the final Markdown
        // byte-for-byte unchanged.
        const model = resolveCodeMirrorModel();
        if (!model || normalize(model.getValue()) !== normalize(source)) {
          return false;
        }
        const sourceLines = source.split("\n");
        const end = {
          ch: sourceLines.at(-1)?.length ?? 0,
          line: Math.max(0, sourceLines.length - 1)
        };
        const pulse = `${source} `;
        if (model.replaceRange) {
          model.replaceRange(" ", end, end, "+input");
        } else {
          model.setValue(pulse);
        }

        const pulseDeadline = Date.now() + 2_000;
        while (Date.now() < pulseDeadline) {
          if (
            resolveCodeMirrorModel()?.getValue() === pulse &&
            editorStoreMarkdown(store) === pulse
          ) {
            break;
          }
          await pauseInPage(50);
        }
        if (
          resolveCodeMirrorModel()?.getValue() !== pulse ||
          editorStoreMarkdown(store) !== pulse
        ) {
          return false;
        }

        await pauseInPage(150);
        const currentModel = resolveCodeMirrorModel();
        if (!currentModel) {
          return false;
        }
        if (currentModel.replaceRange) {
          currentModel.replaceRange(
            "",
            end,
            { ch: end.ch + 1, line: end.line },
            "+delete"
          );
        } else {
          currentModel.setValue(source);
        }

        const restoredDeadline = Date.now() + 2_000;
        while (Date.now() < restoredDeadline) {
          if (
            resolveCodeMirrorModel()?.getValue() === source &&
            editorStoreMarkdown(store) === source
          ) {
            break;
          }
          await pauseInPage(50);
        }
        if (
          resolveCodeMirrorModel()?.getValue() !== source ||
          editorStoreMarkdown(store) !== source
        ) {
          return false;
        }

        const savingDeadline = Date.now() + 7_000;
        while (Date.now() < savingDeadline) {
          if (editorDraftStatus(store) === "saving") {
            break;
          }
          await pauseInPage(50);
        }
        if (editorDraftStatus(store) !== "saving") {
          return false;
        }

        const savedDeadline = Date.now() + 15_000;
        while (Date.now() < savedDeadline) {
          if (editorDraftStatus(store) === "saved") {
            return true;
          }
          if (editorDraftStatus(store) === "saveFailed") {
            return false;
          }
          await pauseInPage(100);
        }
        return false;
      };
      const execCommand = Reflect.get(document, "execCommand") as
        | ((commandId: string, showUi: boolean, value?: string | null) => boolean)
        | undefined;
      const wakeEditorModel = async (): Promise<boolean> => {
        // SegmentFault persists the React editor value, not the rendered
        // CodeMirror lines. A synthetic full-document paste can update those
        // lines without scheduling its four-second autosave. SegmentFault's
        // toolbar owns the actual CodeMirror instance, so toggling bold twice
        // on the full selection performs two model-level replaceRange calls.
        // The second toggle restores the source byte-for-byte while retaining
        // the platform's normal change and autosave events.
        const boldButton = document.querySelector<HTMLButtonElement>(
          ".toolbar-wrap button.icon-bold"
        );
        if (!boldButton) {
          return false;
        }
        selectAll();
        await pauseInPage(50);
        boldButton.click();
        await pauseInPage(250);
        if (normalize(readMarkdown()) === normalize(source)) {
          return false;
        }
        boldButton.click();
        return waitForSource(2_000);
      };
      const selectAll = (): void => {
        textarea.focus();
        const dispatchShortcut = (modifier: "ctrl" | "meta"): void => {
          const keydown = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            code: "KeyA",
            ctrlKey: modifier === "ctrl",
            key: "a",
            metaKey: modifier === "meta"
          });
          try {
            Object.defineProperties(keydown, {
              keyCode: { value: 65 },
              which: { value: 65 }
            });
          } catch {
            // Modern CodeMirror reads key/code; older builds may also read keyCode.
          }
          textarea.dispatchEvent(keydown);
          textarea.dispatchEvent(
            new KeyboardEvent("keyup", {
              bubbles: true,
              code: "KeyA",
              ctrlKey: modifier === "ctrl",
              key: "a",
              metaKey: modifier === "meta"
            })
          );
        };
        // Ctrl+A selects all on Windows. A following unbound Meta+A leaves that
        // selection intact there, while on macOS it performs the real select-all
        // after Ctrl+A may have moved the caret to the start of the line.
        dispatchShortcut("ctrl");
        dispatchShortcut("meta");
      };

      const editorStore = resolveEditorStore();
      if (typeof execCommand === "function" && editorStore) {
        selectAll();
        await pauseInPage(50);
        const inserted = execCommand.call(
          document,
          "insertText",
          false,
          source
        );
        if (inserted) {
          const nativeDeadline = Date.now() + 2_000;
          while (Date.now() < nativeDeadline) {
            const currentModel = resolveCodeMirrorModel();
            if (
              currentModel &&
              normalize(currentModel.getValue()) === normalize(source) &&
              normalize(editorStoreMarkdown(editorStore)) === normalize(source)
            ) {
              const saved = await waitForFinalAutosave(editorStore);
              if (
                saved &&
                normalize(currentModel.getValue()) === normalize(source) &&
                normalize(editorStoreMarkdown(editorStore)) === normalize(source)
              ) {
                return { applied: true, markdown: currentModel.getValue() };
              }
              break;
            }
            await pauseInPage(100);
          }
        }
      }

      const codeMirrorModel = resolveCodeMirrorModel();
      if (codeMirrorModel) {
        if (!editorStore) {
          return {
            applied: false,
            markdown: codeMirrorModel.getValue(),
            message: "SegmentFault's visible editor state could not be located."
          };
        }
        // Upload dialogs update the same controlled editor asynchronously. A
        // pending React effect can briefly restore the pre-finalization value
        // after setValue returns, or replace the CodeMirror instance. Re-resolve
        // the current model and require three stable observations before
        // reporting success to the content script.
        const deadline = Date.now() + 4_000;
        let stableObservations = 0;
        while (Date.now() < deadline) {
          const currentModel = resolveCodeMirrorModel();
          if (!currentModel) {
            stableObservations = 0;
            await pauseInPage(100);
            continue;
          }
          if (
            normalize(currentModel.getValue()) !== normalize(source) ||
            normalize(editorStoreMarkdown(editorStore)) !== normalize(source)
          ) {
            stableObservations = 0;
            editorStore.dispatch({
              payload: { markdownContent: source },
              type: "editor/saveMarkdown"
            });
            currentModel.setValue(source);
            await pauseInPage(250);
            continue;
          }
          stableObservations += 1;
          if (stableObservations >= 3) {
            const saved = await waitForFinalAutosave(editorStore);
            if (
              saved &&
              normalize(currentModel.getValue()) === normalize(source) &&
              normalize(editorStoreMarkdown(editorStore)) === normalize(source)
            ) {
              return { applied: true, markdown: currentModel.getValue() };
            }
            break;
          }
          await pauseInPage(250);
        }
        const currentModel = resolveCodeMirrorModel();
        const modelMarkdown = currentModel?.getValue() ?? "";
        const visibleMarkdown = readMarkdown();
        const stateMarkdown = editorStoreMarkdown(editorStore);
        const lineCount = (value: string): number =>
          value.length === 0 ? 0 : value.split("\n").length;
        return {
          applied: false,
          markdown: modelMarkdown || visibleMarkdown,
          message: `SegmentFault's editor model did not keep the Markdown stable (model=${lineCount(modelMarkdown)}, state=${lineCount(stateMarkdown)} lines; rendered viewport=${lineCount(visibleMarkdown)} lines).`
        };
      }

      selectAll();
      await pauseInPage(50);
      if (typeof DataTransfer === "function" && typeof ClipboardEvent === "function") {
        const clipboard = new DataTransfer();
        clipboard.setData("text/plain", source);
        textarea.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard
          })
        );
        if (await waitForSource(2_000)) {
          const modelAwake = await wakeEditorModel();
          return {
            applied: modelAwake,
            markdown: readMarkdown(),
            message: modelAwake
              ? undefined
              : "SegmentFault displayed the Markdown but did not accept a native edit event."
          };
        }
      }

      if (typeof execCommand === "function") {
        selectAll();
        await pauseInPage(50);
        const inserted = execCommand.call(document, "insertText", false, source);
        if (inserted && (await waitForSource(2_000))) {
          const modelAwake = await wakeEditorModel();
          return {
            applied: modelAwake,
            markdown: readMarkdown(),
            message: modelAwake
              ? undefined
              : "SegmentFault displayed the Markdown but did not accept a native edit event."
          };
        }
      }

      return {
        applied: false,
        markdown: readMarkdown(),
        message: "SegmentFault did not preserve the Markdown document."
      };
    },
    target: { tabId },
    world: "MAIN"
  });
  return (
    (injection?.result as SetSegmentFaultMarkdownResponse | undefined) ?? {
      applied: false,
      message: "SegmentFault did not return an editor result."
    }
  );
}
