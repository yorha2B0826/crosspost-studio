import {
  BROWSER_PLATFORM_IDS,
  hmacSha256Hex,
  parseBridgeMessage,
  PROTOCOL_VERSION
} from "@crosspost/protocol";
import type {
  BridgeMessage,
  DraftBinding,
  JobState,
  PublishJob
} from "@crosspost/protocol";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { hydrateJobAssets } from "../lib/assets";
import { mergeExtensionConfiguration } from "../lib/configuration";
import { IdempotencyLedger } from "../lib/idempotency";
import type {
  ApplyDraftMessage,
  ApplyDraftResult,
  BrowserPlatform,
  ExtensionConfiguration,
  ExtensionStatus,
  PopupRequest,
  PopupResponse,
  SetCsdnMarkdownRequest,
  SetCsdnMarkdownResponse,
  SetSegmentFaultMarkdownRequest,
  SetSegmentFaultMarkdownResponse,
  UploadBilibiliImageRequest,
  UploadBilibiliImageResponse
} from "../lib/messages";
import {
  areEquivalentDraftUrls,
  canonicalizeBilibiliDraftUrl,
  canonicalizeCnblogsDraftUrl,
  getDraftRedirectUrl,
  isExpectedDraftUrl,
  isStableDraftUrl,
  NEW_DRAFT_URLS,
  PLATFORM_ORIGINS,
  waitForStableDraftUrl
} from "../lib/platforms";

const CONFIG_KEY = "crosspost.configuration";
const STATUS_KEY = "crosspost.status";
const HEARTBEAT_INTERVAL_MS = 20_000;

let socket: WebSocket | undefined;
let heartbeat: number | undefined;
let reconnectTimer: number | undefined;
let authenticated = false;
const cancelledJobs = new Set<string>();
const jobs = new IdempotencyLedger<
  Extract<BridgeMessage, { type: "job-result" }>
>();

function setStatus(message: string, connected = false): void {
  const status: ExtensionStatus = {
    connected,
    message,
    updatedAt: new Date().toISOString()
  };
  void browser.storage.local.set({ [STATUS_KEY]: status });
}

async function getConfiguration(): Promise<ExtensionConfiguration> {
  const stored = await browser.storage.local.get(CONFIG_KEY);
  const config = stored[CONFIG_KEY] as ExtensionConfiguration | undefined;
  return {
    pairingKey: config?.pairingKey,
    port: config?.port ?? 27_124
  };
}

function send(message: BridgeMessage): void {
  if (socket?.readyState !== WebSocket.OPEN) {
    throw new Error("The Obsidian bridge is not connected.");
  }
  socket.send(JSON.stringify(message));
}

function sendProgress(jobId: string, state: JobState, message: string): void {
  send({
    jobId,
    message,
    protocolVersion: PROTOCOL_VERSION,
    state,
    type: "job-progress"
  });
}

function sendCapabilities(): void {
  if (!authenticated || socket?.readyState !== WebSocket.OPEN) {
    return;
  }
  send({
    extensionVersion: browser.runtime.getManifest().version,
    platforms: [...BROWSER_PLATFORM_IDS],
    protocolVersion: PROTOCOL_VERSION,
    type: "capabilities"
  });
}

async function connect(): Promise<void> {
  if (reconnectTimer !== undefined) {
    self.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (heartbeat !== undefined) {
    self.clearInterval(heartbeat);
    heartbeat = undefined;
  }
  const config = await getConfiguration();
  if (!config.pairingKey) {
    setStatus("等待配对：请粘贴 Obsidian 中的配对密钥。");
    return;
  }
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  authenticated = false;
  socket = new WebSocket(`ws://127.0.0.1:${config.port}/v1/bridge`);
  setStatus("正在连接 Obsidian…");

  socket.onopen = () => {
    setStatus("本地桥接已连接，正在验证配对…");
  };
  socket.onmessage = (event) => {
    void handleBridgeMessage(String(event.data), config.pairingKey!).catch(
      (error: unknown) => {
        setStatus(
          error instanceof Error ? error.message : "桥接身份验证失败。"
        );
        socket?.close(4_002, "Bridge message failed");
      }
    );
  };
  socket.onerror = () => {
    setStatus("暂时无法连接 Obsidian，请确认插件已打开。");
  };
  socket.onclose = () => {
    authenticated = false;
    if (heartbeat !== undefined) {
      self.clearInterval(heartbeat);
      heartbeat = undefined;
    }
    setStatus("与 Obsidian 的连接已断开，正在重试。");
    reconnectTimer = self.setTimeout(() => {
      void connect();
    }, 5_000);
  };
}

async function handleBridgeMessage(raw: string, pairingKey: string): Promise<void> {
  let message: BridgeMessage;
  try {
    message = parseBridgeMessage(raw);
  } catch {
    socket?.close(4_002, "Invalid bridge message");
    return;
  }

  if (message.type === "pair") {
    const proof = await hmacSha256Hex(pairingKey, message.nonce);
    send({
      proof,
      protocolVersion: PROTOCOL_VERSION,
      type: "pair-response"
    });
    return;
  }
  if (message.type === "pair-result") {
    if (!message.accepted) {
      setStatus(message.reason ?? "配对未通过。");
      socket?.close(4_003, "Pairing rejected");
      return;
    }
    authenticated = true;
    setStatus("已连接到 Obsidian，可以接收草稿任务。", true);
    sendCapabilities();
    heartbeat = self.setInterval(sendCapabilities, HEARTBEAT_INTERVAL_MS);
    return;
  }
  if (message.type === "cancel-job") {
    cancelledJobs.add(message.jobId);
    return;
  }
  if (message.type === "enqueue-job") {
    enqueueJob(message.job);
  }
}

async function hasPlatformPermission(platform: BrowserPlatform): Promise<boolean> {
  return browser.permissions.contains({ origins: PLATFORM_ORIGINS[platform] });
}

async function waitForTab(tabId: number, timeoutMs = 30_000): Promise<void> {
  const current = await browser.tabs.get(tabId);
  if (current.status === "complete") {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = self.setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("The platform editor did not finish loading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId !== tabId || change.status !== "complete") {
        return;
      }
      self.clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function navigateTabAndWait(
  tabId: number,
  url: string,
  timeoutMs = 30_000
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      self.clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = self.setTimeout(() => {
      finish(new Error("The platform editor did not finish loading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId === tabId && change.status === "complete") {
        finish();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs
      .update(tabId, { active: true, url })
      .then((updated) => {
        if (updated?.status === "complete" && updated.url === url) {
          finish();
        }
      })
      .catch((error: unknown) => {
        finish(
          error instanceof Error
            ? error
            : new Error("The platform editor could not be opened.")
        );
      });
  });
}

async function reloadTabAndWait(
  tabId: number,
  timeoutMs = 30_000
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      self.clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = self.setTimeout(() => {
      finish(new Error("The platform draft did not finish reloading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId === tabId && change.status === "complete") {
        finish();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs.reload(tabId).catch((error: unknown) => {
      finish(
        error instanceof Error
          ? error
          : new Error("The platform draft could not be reloaded.")
      );
    });
  });
}

async function openDraftTab(job: PublishJob): Promise<number> {
  const existingUrl = job.existingBinding?.draftUrl;
  const targetUrl =
    existingUrl && isExpectedDraftUrl(job.target, existingUrl)
      ? existingUrl
      : NEW_DRAFT_URLS[job.target];
  const matchingTabs = existingUrl
    ? await browser.tabs.query({
        url: PLATFORM_ORIGINS[job.target]
      })
    : [];
  const existingTab = existingUrl
    ? matchingTabs.find(
        (tab) =>
          tab.id !== undefined &&
          tab.url !== undefined &&
          areEquivalentDraftUrls(tab.url, existingUrl)
      )
    : undefined;
  const activeDraftTab = existingUrl
    ? undefined
    : (await browser.tabs.query({ active: true, currentWindow: true })).find(
        (candidate) =>
          candidate.id !== undefined &&
          candidate.url !== undefined &&
          isExpectedDraftUrl(job.target, candidate.url)
      );
  const tab =
    existingTab ??
    activeDraftTab ??
    (await browser.tabs.create({
      active: true,
      url: targetUrl
    }));
  if (tab.id === undefined) {
    throw new Error("The platform draft tab could not be opened.");
  }
  if (
    existingUrl &&
    (!tab.url || !areEquivalentDraftUrls(tab.url, targetUrl))
  ) {
    await navigateTabAndWait(tab.id, targetUrl);
  } else {
    await browser.tabs.update(tab.id, { active: true });
    await waitForTab(tab.id);
  }
  let tabId = tab.id;
  let loadedTab = await browser.tabs.get(tabId);
  const redirectedUrl = loadedTab.url
    ? getDraftRedirectUrl(job.target, loadedTab.url)
    : undefined;
  if (redirectedUrl) {
    // Some platforms expose the final authenticated editor only after a
    // landing/profile redirect. Opening the resolved editor in a new tab is
    // more reliable than replacing the landing tab in place.
    const redirectedTab = await browser.tabs.create({
      active: true,
      url: redirectedUrl
    });
    if (redirectedTab.id === undefined) {
      throw new Error("The platform draft tab could not be opened.");
    }
    await waitForTab(redirectedTab.id);
    await browser.tabs.remove(tabId);
    tabId = redirectedTab.id;
    loadedTab = await browser.tabs.get(tabId);
  }
  if (!loadedTab.url || !isExpectedDraftUrl(job.target, loadedTab.url)) {
    throw new Error(
      "The platform redirected away from its draft editor. Sign in and retry the same task."
    );
  }
  return tabId;
}

async function injectRunner(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: "crosspost:ping" });
    return;
  } catch {
    // The runtime content script has not been injected into this tab yet.
  }
  await browser.scripting.executeScript({
    files: ["/content-scripts/platform.js"],
    target: { tabId }
  });
}

async function applyToTab(
  tabId: number,
  job: PublishJob,
  content: { html: string; markdown: string }
): Promise<ApplyDraftResult> {
  await injectRunner(tabId);
  const message: ApplyDraftMessage = {
    payload: {
      html: content.html,
      jobId: job.id,
      markdown: content.markdown,
      platform: job.target,
      title: job.artifact.metadata.title
    },
    type: "crosspost:apply-draft"
  };
  return browser.tabs.sendMessage(tabId, message);
}

async function setCsdnMarkdownInMainWorld(
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

async function setSegmentFaultMarkdownInMainWorld(
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

async function uploadBilibiliImageInMainWorld(
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

async function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    self.setTimeout(resolve, milliseconds);
  });
}

async function resolveBilibiliDraftUrl(
  tabId: number,
  expectedTitle: string
): Promise<string | undefined> {
  await navigateTabAndWait(tabId, "https://member.bilibili.com/york/read-draft");
  let editClicked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle],
      func: (title: string): boolean => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(".draft-card")
        );
        const card = cards.find(
          (candidate) =>
            candidate
              .querySelector<HTMLElement>(".draft-card_title")
              ?.textContent?.trim() === title.trim()
        );
        const edit = card?.querySelector<HTMLElement>(
          ".draft-card_action-edit"
        );
        if (!edit || edit.getClientRects().length === 0) {
          return false;
        }
        edit.click();
        return true;
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      editClicked = true;
      break;
    }
    await pause(250);
  }
  if (!editClicked) {
    return undefined;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const currentUrl = (await browser.tabs.get(tabId)).url;
    const canonical = currentUrl
      ? canonicalizeBilibiliDraftUrl(currentUrl)
      : undefined;
    if (canonical) {
      await navigateTabAndWait(tabId, canonical);
      return canonical;
    }
    await pause(250);
  }
  return undefined;
}

async function verifyBilibiliDraftAssets(
  tabId: number,
  expectedImageCount: number
): Promise<boolean> {
  await reloadTabAndWait(tabId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedImageCount],
      func: (expected: number): boolean | undefined => {
        const editor = document.querySelector<HTMLElement>(
          ".tiptap.ProseMirror.eva3-editor[contenteditable='true']"
        );
        if (!editor) {
          return undefined;
        }
        const sources = Array.from(
          editor.querySelectorAll<HTMLImageElement>("img")
        ).map((image) => image.currentSrc || image.src);
        const placeholders = (editor.textContent ?? "").match(
          /CROSSPOST_IMAGE_/g
        );
        const transientCount = sources.filter((source) =>
          /^(?:data:|blob:)/i.test(source)
        ).length;
        const resolvedCount = sources.filter((source) =>
          /^https?:\/\//i.test(source)
        ).length;
        return (
          (placeholders?.length ?? 0) === 0 &&
          transientCount === 0 &&
          resolvedCount >= expected
        );
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      return true;
    }
    await pause(250);
  }
  return false;
}

async function verifyJianshuDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedBodyText: string,
  expectedImageCount: number
): Promise<boolean> {
  await reloadTabAndWait(tabId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle, expectedBodyText, expectedImageCount],
      func: (title: string, bodyText: string, imageCount: number): boolean | undefined => {
        const titleInput = document.querySelector<HTMLInputElement>("input._24i7u");
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
        return (
          titleInput.value.trim() === title.trim() &&
          normalize(editor.textContent ?? "") === normalize(bodyText) &&
          !(editor.textContent ?? "").includes("CROSSPOST_IMAGE_") &&
          sources.length === imageCount &&
          sources.every((source) => /^https?:\/\//i.test(source))
        );
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      return true;
    }
    await pause(250);
  }
  return false;
}

async function verifySegmentFaultDraftContent(
  tabId: number,
  expectedTitle: string,
  expectedMarkdown: string,
  expectedImageCount: number
): Promise<boolean> {
  // SegmentFault does not expose a persistent visible autosave label. Its
  // server-side debounce can lag behind the editor after several image uploads,
  // so keep the completed document visible long enough before reload readback.
  await pause(12_000);
  await reloadTabAndWait(tabId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
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
    await pause(250);
  }
  return false;
}

async function resolveOsChinaDraftUrl(
  tabId: number,
  expectedTitle: string,
  editorUrl: string
): Promise<string | undefined> {
  const profile = new URL(editorUrl).pathname.match(/^\/u\/([^/]+)\/blog\//);
  if (!profile?.[1]) {
    return undefined;
  }
  const knownTabIds = new Set(
    (await browser.tabs.query({ url: PLATFORM_ORIGINS.oschina })).flatMap(
      (tab) => (tab.id === undefined ? [] : [tab.id])
    )
  );
  await navigateTabAndWait(
    tabId,
    `https://my.oschina.net/u/${profile[1]}/`
  );

  let draftBoxOpened = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      func: (): boolean => {
        const draftBox = Array.from(
          document.querySelectorAll<HTMLElement>("[role='menuitem']")
        ).find(
          (candidate) =>
            candidate.textContent?.trim() === "草稿箱" &&
            candidate.getClientRects().length > 0
        );
        if (!draftBox) {
          return false;
        }
        draftBox.click();
        return true;
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      draftBoxOpened = true;
      break;
    }
    await pause(250);
  }
  if (!draftBoxOpened) {
    return undefined;
  }

  let editClicked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [injection] = await browser.scripting.executeScript({
      args: [expectedTitle],
      func: (title: string): boolean => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(".list-content-item")
        );
        const card = cards.find(
          (candidate) =>
            candidate
              .querySelector<HTMLElement>(".list-content-item-info-name")
              ?.textContent?.trim() === title.trim()
        );
        const edit = Array.from(
          card?.querySelectorAll<HTMLButtonElement>("button") ?? []
        ).find(
          (candidate) =>
            candidate.textContent?.replace(/\s+/g, "").trim() === "编辑"
        );
        if (!edit || edit.getClientRects().length === 0) {
          return false;
        }
        edit.click();
        return true;
      },
      target: { tabId }
    });
    if (injection?.result === true) {
      editClicked = true;
      break;
    }
    await pause(250);
  }
  if (!editClicked) {
    return undefined;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidateTabs = await browser.tabs.query({
      url: PLATFORM_ORIGINS.oschina
    });
    const stableTab = candidateTabs.find(
      (tab) =>
        tab.id !== undefined &&
        !knownTabIds.has(tab.id) &&
        tab.url !== undefined &&
        isStableDraftUrl("oschina", tab.url)
    );
    const currentUrl = (await browser.tabs.get(tabId)).url;
    const stableDraftUrl =
      stableTab?.url ??
      (currentUrl && isStableDraftUrl("oschina", currentUrl)
        ? currentUrl
        : undefined);
    if (stableDraftUrl) {
      if (stableTab?.id !== undefined && stableTab.id !== tabId) {
        await navigateTabAndWait(tabId, stableDraftUrl);
        await browser.tabs.remove(stableTab.id);
      }
      return stableDraftUrl;
    }
    await pause(250);
  }
  return undefined;
}

function enqueueJob(job: PublishJob): void {
  const claim = jobs.claim(job.id);
  if (claim.status === "completed") {
    send(claim.value);
    return;
  }
  if (claim.status === "active") {
    sendProgress(job.id, "queued", "This idempotent job is already running.");
    return;
  }
  void processJob(job).finally(() => {
    jobs.release(job.id);
  });
}

async function processJob(job: PublishJob): Promise<void> {
  let editorMayHaveChanged = false;
  try {
    if (cancelledJobs.delete(job.id)) {
      sendResult(job, "cancelled", "The job was cancelled before it started.");
      return;
    }
    if (!(await hasPlatformPermission(job.target))) {
      sendResult(
        job,
        "failed",
        `Enable ${job.target} in the extension popup before retrying.`,
        undefined,
        "permission-required"
      );
      return;
    }

    sendProgress(job.id, "prepared", "Loading one-time article assets from Obsidian.");
    const content = await hydrateJobAssets(job);
    if (cancelledJobs.delete(job.id)) {
      sendResult(job, "cancelled", "The job was cancelled.");
      return;
    }

    sendProgress(job.id, "waiting-for-login", "Opening the visible platform draft editor.");
    const tabId = await openDraftTab(job);
    sendProgress(job.id, "injecting", "Filling the visible editor and waiting for save confirmation.");
    editorMayHaveChanged = true;
    const result = await applyToTab(tabId, job, content);
    if (!result.saved || !result.draftUrl) {
      sendResult(
        job,
        result.unknown ? "unknown" : "failed",
        result.message,
        undefined,
        result.errorCode
      );
      return;
    }
    const resolvedPlatformDraftUrl =
      job.target === "bilibili" && !isStableDraftUrl(job.target, result.draftUrl)
        ? await resolveBilibiliDraftUrl(tabId, job.artifact.metadata.title)
        : job.target === "oschina" &&
            !isStableDraftUrl(job.target, result.draftUrl)
          ? await resolveOsChinaDraftUrl(
              tabId,
              job.artifact.metadata.title,
              result.draftUrl
            )
          : undefined;
    const stableDraftUrl =
      resolvedPlatformDraftUrl ??
      (await waitForStableDraftUrl(
        job.target,
        result.draftUrl,
        async () => (await browser.tabs.get(tabId)).url,
        () => pause(250)
      ));
    if (!stableDraftUrl) {
      sendResult(
        job,
        "unknown",
        "The platform reported a save, but the resulting URL did not identify a reusable draft.",
        undefined,
        "unrecognized-draft-url"
      );
      return;
    }
    if (job.target === "bilibili") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved Bilibili draft to verify its uploaded images."
      );
      const expectedImageCount = (content.html.match(/<img\b/gi) ?? []).length;
      const verified = await verifyBilibiliDraftAssets(
        tabId,
        expectedImageCount
      );
      if (!verified) {
        sendResult(
          job,
          "unknown",
          "Bilibili reported a save, but the reloaded draft did not preserve every uploaded image.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "jianshu") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved Jianshu draft to verify its article body and images."
      );
      const verified = await verifyJianshuDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0
      );
      if (!verified) {
        sendResult(
          job,
          "unknown",
          "Jianshu reported a save, but the reloaded draft did not preserve the replacement article body and images.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "segmentfault") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved SegmentFault draft to verify its Markdown and images."
      );
      const verified = await verifySegmentFaultDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0
      );
      if (!verified) {
        sendResult(
          job,
          "unknown",
          "SegmentFault accepted the edit, but the reloaded draft did not preserve the exact Markdown and uploaded images.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    const reusableDraftUrl =
      job.target === "cnblogs"
        ? canonicalizeCnblogsDraftUrl(stableDraftUrl) ?? stableDraftUrl
        : stableDraftUrl;
    const binding: DraftBinding = {
      draftUrl: reusableDraftUrl,
      platform: job.target,
      sourceHash: job.artifact.contentHash,
      updatedAt: new Date().toISOString()
    };
    sendResult(
      job,
      "draft-saved",
      job.target === "segmentfault"
        ? "SegmentFault preserved the exact Markdown and uploaded images after reload."
        : result.message,
      binding
    );
  } catch (error) {
    const state =
      editorMayHaveChanged && !job.existingBinding ? "unknown" : "failed";
    sendResult(
      job,
      state,
      error instanceof Error ? error.message : "The browser draft job failed.",
      undefined,
      state === "unknown" ? "create-result-unknown" : "browser-job-failed"
    );
  } finally {
    cancelledJobs.delete(job.id);
  }
}

function sendResult(
  job: PublishJob,
  state: "draft-saved" | "failed" | "unknown" | "cancelled",
  message: string,
  binding?: DraftBinding,
  errorCode?: string
): void {
  const result = {
    binding,
    errorCode,
    jobId: job.id,
    message,
    protocolVersion: PROTOCOL_VERSION,
    state,
    type: "job-result"
  } satisfies Extract<BridgeMessage, { type: "job-result" }>;
  jobs.complete(job.id, result);
  send(result);
}

async function handlePopupRequest(request: PopupRequest): Promise<PopupResponse> {
  if (request.type === "crosspost:get-status") {
    const [result, configuration] = await Promise.all([
      browser.storage.local.get(STATUS_KEY),
      getConfiguration()
    ]);
    return {
      configuration: {
        configured: Boolean(configuration.pairingKey),
        port: configuration.port
      },
      status: result[STATUS_KEY] as ExtensionStatus | undefined
    };
  }
  if (request.type === "crosspost:save-config") {
    const current = await getConfiguration();
    await browser.storage.local.set({
      [CONFIG_KEY]: mergeExtensionConfiguration(current, request.config)
    });
    void connect();
    return {};
  }
  if (request.type === "crosspost:reconnect") {
    void connect();
    return {};
  }
  return {};
}

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  browser.runtime.onMessage.addListener(
    (
      request:
        | PopupRequest
        | SetCsdnMarkdownRequest
        | SetSegmentFaultMarkdownRequest
        | UploadBilibiliImageRequest,
      sender,
      sendResponse
    ): true => {
      const response =
        request.type === "crosspost:set-csdn-markdown"
          ? setCsdnMarkdownInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:set-segmentfault-markdown"
            ? setSegmentFaultMarkdownInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:upload-bilibili-image"
            ? uploadBilibiliImageInMainWorld(sender.tab?.id, request)
          : handlePopupRequest(request);
      void response.then(sendResponse, (error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : "Extension request failed."
        } satisfies
          | PopupResponse
          | SetCsdnMarkdownResponse
          | SetSegmentFaultMarkdownResponse
          | UploadBilibiliImageResponse);
      });
      return true;
    }
  );
  browser.runtime.onStartup.addListener(() => {
    void connect();
  });
  void connect();
});
