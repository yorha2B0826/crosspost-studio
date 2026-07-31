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
  PopupResponse
} from "../lib/messages";
import {
  isExpectedDraftUrl,
  isStableDraftUrl,
  NEW_DRAFT_URLS,
  PLATFORM_ORIGINS
} from "../lib/platforms";

const CONFIG_KEY = "crosspost.configuration";
const STATUS_KEY = "crosspost.status";
const HEARTBEAT_INTERVAL_MS = 20_000;

let socket: WebSocket | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
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
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (heartbeat !== undefined) {
    clearInterval(heartbeat);
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
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    setStatus("与 Obsidian 的连接已断开，正在重试。");
    reconnectTimer = setTimeout(() => {
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
    heartbeat = setInterval(sendCapabilities, HEARTBEAT_INTERVAL_MS);
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
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("The platform editor did not finish loading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId !== tabId || change.status !== "complete") {
        return;
      }
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    browser.tabs.onUpdated.addListener(listener);
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
    ? matchingTabs.find((tab) => tab.id !== undefined && tab.url === existingUrl)
    : undefined;
  const tab =
    existingTab ??
    (await browser.tabs.create({
      active: true,
      url: targetUrl
    }));
  if (tab.id === undefined) {
    throw new Error("The platform draft tab could not be opened.");
  }
  if (tab.url !== targetUrl && existingUrl) {
    await browser.tabs.update(tab.id, { active: true, url: targetUrl });
  } else {
    await browser.tabs.update(tab.id, { active: true });
  }
  await waitForTab(tab.id);
  const loadedTab = await browser.tabs.get(tab.id);
  if (!loadedTab.url || !isExpectedDraftUrl(job.target, loadedTab.url)) {
    throw new Error(
      "The platform redirected away from its draft editor. Sign in and retry the same task."
    );
  }
  return tab.id;
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
    if (!isStableDraftUrl(job.target, result.draftUrl)) {
      sendResult(
        job,
        "unknown",
        "The platform reported a save, but the resulting URL did not identify a reusable draft.",
        undefined,
        "unrecognized-draft-url"
      );
      return;
    }
    const binding: DraftBinding = {
      draftUrl: result.draftUrl,
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
    (request: PopupRequest, _sender, sendResponse): true => {
      void handlePopupRequest(request).then(sendResponse, (error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : "Extension request failed."
        } satisfies PopupResponse);
      });
      return true;
    }
  );
  browser.runtime.onStartup.addListener(() => {
    void connect();
  });
  void connect();
});
