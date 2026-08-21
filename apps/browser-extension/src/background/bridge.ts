import {
  BROWSER_RUNTIME_REVISION,
  BROWSER_PLATFORM_IDS,
  hmacSha256Hex,
  parseBridgeMessage,
  PROTOCOL_VERSION
} from "@crosspost/protocol";
import type {
  BridgeMessage,
  JobState,
  PublishJob
} from "@crosspost/protocol";
import type {
  BrowserPlatform,
  ExtensionConfiguration,
  ExtensionStatus
} from "../lib/messages";
import { browser } from "wxt/browser";
import { PLATFORM_ORIGINS } from "../lib/platforms";

const CONFIG_KEY = "crosspost.configuration";
const STATUS_KEY = "crosspost.status";
const HEARTBEAT_INTERVAL_MS = 20_000;

let socket: WebSocket | undefined;
let heartbeat: number | undefined;
let reconnectTimer: number | undefined;
let authenticated = false;

export interface BridgeJobHandlers {
  cancelJob(jobId: string): void;
  enqueueJob(job: PublishJob): void;
}

let jobHandlers: BridgeJobHandlers | undefined;

function setStatus(message: string, connected = false): void {
  const status: ExtensionStatus = {
    connected,
    message,
    updatedAt: new Date().toISOString()
  };
  void browser.storage.local.set({ [STATUS_KEY]: status });
}

export async function getConfiguration(): Promise<ExtensionConfiguration> {
  const stored = await browser.storage.local.get(CONFIG_KEY);
  const config = stored[CONFIG_KEY] as ExtensionConfiguration | undefined;
  return {
    pairingKey: config?.pairingKey,
    port: config?.port ?? 27_124
  };
}

export function send(message: BridgeMessage): void {
  if (socket?.readyState !== WebSocket.OPEN) {
    throw new Error("The Obsidian bridge is not connected.");
  }
  socket.send(JSON.stringify(message));
}

export function sendProgress(
  jobId: string,
  state: JobState,
  message: string
): void {
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
    runtimeRevision: BROWSER_RUNTIME_REVISION,
    type: "capabilities"
  });
}

export async function connect(
  handlers: BridgeJobHandlers
): Promise<void> {
  jobHandlers = handlers;
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
      if (jobHandlers) {
        void connect(jobHandlers);
      }
    }, 5_000);
  };
}

/** Reconnect using the job handlers registered by the last `connect` call. */
export function reconnect(): void {
  if (jobHandlers) {
    void connect(jobHandlers);
  }
}

async function handleBridgeMessage(
  raw: string,
  pairingKey: string
): Promise<void> {
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
    jobHandlers?.cancelJob(message.jobId);
    return;
  }
  if (message.type === "enqueue-job") {
    jobHandlers?.enqueueJob(message.job);
  }
}

export async function hasPlatformPermission(
  platform: BrowserPlatform
): Promise<boolean> {
  return browser.permissions.contains({ origins: PLATFORM_ORIGINS[platform] });
}

export { CONFIG_KEY, STATUS_KEY };
