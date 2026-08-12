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
  UploadBilibiliImageRequest,
  UploadBilibiliImageResponse
} from "../lib/messages";
import {
  areEquivalentDraftUrls,
  canonicalizeBilibiliDraftUrl,
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
    const binding: DraftBinding = {
      draftUrl: stableDraftUrl,
      platform: job.target,
      sourceHash: job.artifact.contentHash,
      updatedAt: new Date().toISOString()
    };
    sendResult(job, "draft-saved", result.message, binding);
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
        | UploadBilibiliImageRequest,
      sender,
      sendResponse
    ): true => {
      const response =
        request.type === "crosspost:set-csdn-markdown"
          ? setCsdnMarkdownInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:upload-bilibili-image"
            ? uploadBilibiliImageInMainWorld(sender.tab?.id, request)
          : handlePopupRequest(request);
      void response.then(sendResponse, (error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : "Extension request failed."
        } satisfies
          | PopupResponse
          | SetCsdnMarkdownResponse
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
