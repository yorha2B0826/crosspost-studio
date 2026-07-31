import { browser } from "wxt/browser";
import {
  detectLocale,
  onSystemThemeChange,
  resolveTheme,
  setTheme,
  t,
  type Locale,
} from "../../lib/i18n";
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
const versionOutput = document.querySelector<HTMLElement>("#version");

let configured = false;
const locale: Locale = detectLocale();

function i(key: string): string {
  return t(key, locale);
}

function renderConnection(status?: ExtensionStatus): void {
  const connected = status?.connected ?? false;
  const msg = status?.message ?? "";
  connectionCard?.setAttribute("data-connected", String(connected));
  connectionLabel?.replaceChildren(
    document.createTextNode(connected ? msg || i("connection.connected") : msg || i("connection.waiting"))
  );
  connectionLabel?.setAttribute("title", msg);
}

function renderConfiguration(isConfigured: boolean, port: number): void {
  configured = isConfigured;
  if (portInput) {
    portInput.value = String(port);
  }
  configuredLabel?.replaceChildren(
    document.createTextNode(isConfigured ? i("pairing.configured") : i("pairing.unconfigured"))
  );
  configuredLabel?.classList.toggle("is-ready", isConfigured);
  if (pairingKeyInput) {
    pairingKeyInput.placeholder = isConfigured
      ? i("pairing.keyPlaceholderConfigured")
      : i("pairing.keyPlaceholder");
  }
  if (pairingHelp) {
    pairingHelp.textContent = isConfigured
      ? i("pairing.helpConfigured")
      : i("pairing.help");
  }
  if (saveButton) {
    saveButton.textContent = isConfigured ? i("pairing.update") : i("pairing.save");
  }
  if (reconnectButton) {
    reconnectButton.disabled = !isConfigured;
  }
}

function showInlineError(message: string): void {
  connectionCard?.setAttribute("data-connected", "error");
  connectionLabel?.replaceChildren(
    document.createTextNode(message || i("connection.needsAction"))
  );
}

async function send(request: PopupRequest): Promise<PopupResponse> {
  const response: unknown = await browser.runtime.sendMessage(request);
  if (typeof response !== "object" || response === null) {
    throw new Error("The extension background did not return valid state.");
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
    showInlineError(error instanceof Error ? error.message : "Unable to read extension state.");
  }
}

async function refreshPermissions(): Promise<void> {
  let grantedCount = 0;
  const chips = document.querySelectorAll<HTMLButtonElement>("[data-platform]");
  for (const chip of chips) {
    const platform = chip.dataset.platform as BrowserPlatform;
    const granted = await browser.permissions.contains({
      origins: PLATFORM_ORIGINS[platform]
    });
    grantedCount += granted ? 1 : 0;
    chip.dataset.enabled = String(granted);
    chip.setAttribute(
      "aria-label",
      granted
        ? `${chip.textContent} — ${i("permissions.enabled")}`
        : `${i("permissions.checking")} ${chip.textContent}`
    );
  }
  const total = chips.length;
  permissionSummary?.replaceChildren(
    document.createTextNode(`${grantedCount}/${total}`)
  );
  permissionSummary?.classList.toggle("is-ready", grantedCount === total);
}

// --- Theme toggle ---
function applyTheme(mode: "auto" | "light" | "dark"): void {
  const resolved = resolveTheme(mode);
  setTheme(resolved);
}

const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select");
const savedTheme = (localStorage.getItem("crosspost.theme") as "auto" | "light" | "dark") ?? "auto";
if (themeSelect) {
  themeSelect.value = savedTheme;
  themeSelect.addEventListener("change", () => {
    const mode = themeSelect.value as "auto" | "light" | "dark";
    localStorage.setItem("crosspost.theme", mode);
    applyTheme(mode);
  });
}
applyTheme(savedTheme);
onSystemThemeChange(() => applyTheme(savedTheme));

// --- Event listeners ---
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
      showInlineError(i("pairing.invalidInput"));
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = i("pairing.connecting");
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
      showInlineError(error instanceof Error ? error.message : "Connection settings could not be saved.");
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
      showInlineError(error instanceof Error ? error.message : "Reconnect failed.");
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
        showInlineError(i("permissions.notGranted"));
      }
      await refreshPermissions();
    })();
  });
}

// --- Batch grant all platforms ---
// Chrome only processes one origin per permissions.request() call.
// We iterate through ungranted platforms and request each one-by-one.
const grantAllButton = document.querySelector<HTMLButtonElement>("#grant-all");
grantAllButton?.addEventListener("click", () => {
  void (async () => {
    grantAllButton.disabled = true;
    try {
      let remaining = 0;
      const ungranted: Array<{ platform: string; origins: string[] }> = [];
      for (const [platform, origins] of Object.entries(PLATFORM_ORIGINS)) {
        if (!(await browser.permissions.contains({ origins }))) {
          ungranted.push({ platform, origins });
        }
      }
      remaining = ungranted.length;
      if (remaining === 0) {
        return;
      }
      grantAllButton.textContent = `Requesting (0 / ${remaining})…`;
      for (const entry of ungranted) {
        await browser.permissions.request({ origins: entry.origins });
        remaining -= 1;
        grantAllButton.textContent =
          remaining > 0
            ? `Requesting (${ungranted.length - remaining} / ${ungranted.length})…`
            : `Requesting (${ungranted.length} / ${ungranted.length})…`;
      }
      await refreshPermissions();
    } finally {
      grantAllButton.disabled = false;
      grantAllButton.textContent = i("permissions.grantAll");
    }
  })();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["crosspost.status"]) {
    renderConnection(changes["crosspost.status"].newValue as ExtensionStatus | undefined);
  }
});

if (versionOutput) {
  versionOutput.textContent = `v${browser.runtime.getManifest().version}`;
}

void Promise.all([refreshStatus(), refreshPermissions()]);