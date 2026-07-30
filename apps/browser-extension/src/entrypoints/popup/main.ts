import { browser } from "wxt/browser";
import type {
  BrowserPlatform,
  ExtensionStatus,
  PopupRequest,
  PopupResponse
} from "../../lib/messages";
import { PLATFORM_ORIGINS } from "../../lib/platforms";

const connectionCard = document.querySelector<HTMLElement>("#connection-card");
const connectionLabel = document.querySelector<HTMLElement>("#connection-label");
const configuredLabel = document.querySelector<HTMLElement>("#configured-label");
const pairingHelp = document.querySelector<HTMLElement>("#pairing-help");
const pairingKeyInput = document.querySelector<HTMLInputElement>("#pairing-key");
const permissionSummary = document.querySelector<HTMLElement>("#permission-summary");
const portInput = document.querySelector<HTMLInputElement>("#port");
const reconnectButton = document.querySelector<HTMLButtonElement>("#reconnect");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const statusOutput = document.querySelector<HTMLOutputElement>("#status");
const statusTime = document.querySelector<HTMLTimeElement>("#status-time");
const versionOutput = document.querySelector<HTMLElement>("#version");

let configured = false;

function formatUpdatedAt(value?: string): string {
  if (!value) {
    return "尚未收到状态";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "刚刚更新"
    : `更新于 ${date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      })}`;
}

function renderConnection(status?: ExtensionStatus): void {
  const connected = status?.connected ?? false;
  connectionCard?.setAttribute("data-connected", String(connected));
  connectionLabel?.replaceChildren(
    document.createTextNode(connected ? "已连接 Obsidian" : "等待 Obsidian")
  );
  if (statusOutput) {
    statusOutput.textContent = status?.message ?? "尚未连接 Obsidian。";
  }
  if (statusTime) {
    statusTime.textContent = formatUpdatedAt(status?.updatedAt);
    statusTime.dateTime = status?.updatedAt ?? "";
  }
}

function renderConfiguration(isConfigured: boolean, port: number): void {
  configured = isConfigured;
  if (portInput) {
    portInput.value = String(port);
  }
  configuredLabel?.replaceChildren(
    document.createTextNode(isConfigured ? "已配对" : "未配置")
  );
  configuredLabel?.classList.toggle("is-ready", isConfigured);
  if (pairingKeyInput) {
    pairingKeyInput.placeholder = isConfigured
      ? "留空以保留现有密钥"
      : "从 Obsidian 设置复制";
  }
  if (pairingHelp) {
    pairingHelp.textContent = isConfigured
      ? "已保存配对密钥。只有更换密钥时才需要重新粘贴。"
      : "密钥只保存在本机扩展中，用于验证 127.0.0.1 上的 Obsidian。";
  }
  if (saveButton) {
    saveButton.textContent = isConfigured ? "更新连接设置" : "保存并连接";
  }
  if (reconnectButton) {
    reconnectButton.disabled = !isConfigured;
  }
}

function showInlineError(message: string): void {
  connectionCard?.setAttribute("data-connected", "error");
  connectionLabel?.replaceChildren(document.createTextNode("需要处理"));
  if (statusOutput) {
    statusOutput.textContent = message;
  }
}

async function send(request: PopupRequest): Promise<PopupResponse> {
  const response: unknown = await browser.runtime.sendMessage(request);
  if (typeof response !== "object" || response === null) {
    throw new Error("扩展后台没有返回有效状态。");
  }
  const popupResponse = response as PopupResponse;
  if (popupResponse.error) {
    throw new Error(popupResponse.error);
  }
  return popupResponse;
}

async function refreshStatus(): Promise<void> {
  try {
    const response = await send({ type: "crosspost:get-status" });
    renderConnection(response.status);
    renderConfiguration(
      response.configuration?.configured ?? false,
      response.configuration?.port ?? 27_124
    );
  } catch (error) {
    showInlineError(error instanceof Error ? error.message : "无法读取扩展状态。");
  }
}

async function refreshPermissions(): Promise<void> {
  let grantedCount = 0;
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-platform]");
  for (const button of buttons) {
    const platform = button.dataset.platform as BrowserPlatform;
    const granted = await browser.permissions.contains({
      origins: PLATFORM_ORIGINS[platform]
    });
    grantedCount += granted ? 1 : 0;
    button.dataset.enabled = String(granted);
    const state = button.querySelector<HTMLElement>(".permission-state");
    if (state) {
      state.textContent = granted ? "已启用" : "启用";
    }
    button.setAttribute(
      "aria-label",
      granted
        ? `${button.querySelector("strong")?.textContent ?? platform}权限已启用`
        : `启用${button.querySelector("strong")?.textContent ?? platform}权限`
    );
  }
  permissionSummary?.replaceChildren(
    document.createTextNode(`${grantedCount} / ${buttons.length}`)
  );
  permissionSummary?.classList.toggle(
    "is-ready",
    grantedCount === buttons.length
  );
}

saveButton?.addEventListener("click", () => {
  void (async () => {
    const port = Number(portInput?.value ?? 27_124);
    const pairingKey = pairingKeyInput?.value.trim();
    if (
      !Number.isInteger(port) ||
      port < 1_024 ||
      port > 65_535 ||
      (!configured && (!pairingKey || !/^[a-f0-9]{64}$/i.test(pairingKey))) ||
      (pairingKey && !/^[a-f0-9]{64}$/i.test(pairingKey))
    ) {
      showInlineError("请输入有效端口；首次配对还需要 64 位配对密钥。");
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = "正在连接…";
    try {
      await send({
        config: {
          pairingKey: pairingKey || undefined,
          port
        },
        type: "crosspost:save-config"
      });
      if (pairingKeyInput) {
        pairingKeyInput.value = "";
      }
      window.setTimeout(() => void refreshStatus(), 600);
    } catch (error) {
      showInlineError(error instanceof Error ? error.message : "连接设置保存失败。");
    } finally {
      saveButton.disabled = false;
    }
  })();
});

reconnectButton?.addEventListener("click", () => {
  void (async () => {
    reconnectButton.disabled = true;
    try {
      await send({ type: "crosspost:reconnect" });
      await refreshStatus();
    } catch (error) {
      showInlineError(error instanceof Error ? error.message : "重新连接失败。");
    } finally {
      reconnectButton.disabled = !configured;
    }
  })();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-platform]")) {
  button.addEventListener("click", () => {
    void (async () => {
      const platform = button.dataset.platform as BrowserPlatform;
      if (
        await browser.permissions.contains({
          origins: PLATFORM_ORIGINS[platform]
        })
      ) {
        return;
      }
      const granted = await browser.permissions.request({
        origins: PLATFORM_ORIGINS[platform]
      });
      if (!granted) {
        showInlineError("未授予平台权限；需要权限后才能填写对应草稿。");
      }
      await refreshPermissions();
    })();
  });
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["crosspost.status"]) {
    renderConnection(changes["crosspost.status"].newValue as ExtensionStatus | undefined);
  }
});

if (versionOutput) {
  versionOutput.textContent = `v${browser.runtime.getManifest().version}`;
}

void Promise.all([refreshStatus(), refreshPermissions()]);
