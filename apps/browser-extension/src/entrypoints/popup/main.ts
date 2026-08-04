import { browser } from "wxt/browser";
import {
  detectLocale,
  onSystemThemeChange,
  resolveTheme,
  setTheme,
  t,
  type Locale,
  type ThemeMode,
} from "../../lib/i18n";
import type {
  BrowserPlatform,
  ExtensionStatus,
  PopupRequest,
  PopupResponse
} from "../../lib/messages";
import {
  emptyPlatformPermissionState,
  getMissingPlatforms,
  readPlatformPermissionState,
  requestMissingPlatformPermissions,
  type PlatformPermissionState
} from "../../lib/permissions";
import { PLATFORM_ORIGINS } from "../../lib/platforms";

const connectionCard = document.querySelector<HTMLElement>("#connection-card");
const connectionLabel = document.querySelector<HTMLElement>("#connection-label");
const configuredLabel = document.querySelector<HTMLElement>("#configured-label");
const grantAllButton = document.querySelector<HTMLButtonElement>("#grant-all");
const pairingHelp = document.querySelector<HTMLElement>("#pairing-help");
const pairingKeyInput = document.querySelector<HTMLInputElement>("#pairing-key");
const permissionFeedback = document.querySelector<HTMLElement>("#permission-feedback");
const permissionSummary = document.querySelector<HTMLElement>("#permission-summary");
const portInput = document.querySelector<HTMLInputElement>("#port");
const reconnectButton = document.querySelector<HTMLButtonElement>("#reconnect");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const versionOutput = document.querySelector<HTMLElement>("#version");

let configured = false;
const locale: Locale = detectLocale();
const THEME_STORAGE_KEY = "crosspost.theme";
let permissionStates: PlatformPermissionState = emptyPlatformPermissionState();
let permissionsBusy = false;
let permissionsReady = false;

function i(key: string): string {
  return t(key, locale);
}

function interpolate(
  key: string,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (message, [name, value]) =>
      message.replaceAll(`{${name}}`, String(value)),
    i(key)
  );
}

function localizeDocument(): void {
  document.documentElement.lang = locale;
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key) {
      element.textContent = i(key);
    }
  }
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
  permissionsReady = false;
  renderPermissions();
  try {
    permissionStates = await readPlatformPermissionState(browser.permissions);
    permissionsReady = true;
    renderPermissions();
  } catch {
    permissionsReady = false;
    renderPermissions();
    setPermissionFeedback(i("permissions.failed"), "error");
  }
}

function setPermissionFeedback(
  message: string,
  state: "error" | "info" | "success" | "warning" = "info"
): void {
  permissionFeedback?.replaceChildren(document.createTextNode(message));
  permissionFeedback?.setAttribute("data-state", state);
}

function renderPermissions(): void {
  let grantedCount = 0;
  const chips = document.querySelectorAll<HTMLButtonElement>("[data-platform]");
  for (const chip of chips) {
    const platform = chip.dataset.platform as BrowserPlatform;
    const granted = permissionStates[platform];
    const label = chip.textContent?.trim() || platform;
    grantedCount += granted ? 1 : 0;
    chip.dataset.enabled = String(granted);
    chip.disabled = permissionsBusy || !permissionsReady;
    chip.setAttribute(
      "aria-label",
      granted
        ? `${label} — ${i("permissions.enabled")}`
        : permissionsReady
          ? `${label} — ${i("permissions.clickToEnable")}`
          : `${label} — ${i("permissions.checking")}`
    );
  }
  const total = chips.length;
  permissionSummary?.replaceChildren(
    document.createTextNode(`${grantedCount}/${total}`)
  );
  permissionSummary?.classList.toggle("is-ready", grantedCount === total);
  if (!grantAllButton) {
    return;
  }
  const missingCount = total - grantedCount;
  grantAllButton.disabled =
    permissionsBusy || !permissionsReady || missingCount === 0;
  grantAllButton.dataset.state = permissionsBusy ? "busy" : "idle";
  grantAllButton.textContent = permissionsBusy
    ? i("permissions.requesting")
    : !permissionsReady
      ? i("permissions.checkingAll")
      : missingCount === 0
        ? i("permissions.allGranted")
        : interpolate("permissions.grantMissing", { count: missingCount });
}

// --- Theme toggle ---
function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  setTheme(resolved);
}

const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select");
let selectedTheme: ThemeMode = "auto";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "auto" || value === "light" || value === "dark";
}

async function initializeTheme(): Promise<void> {
  const stored = await browser.storage.local.get(THEME_STORAGE_KEY);
  const savedTheme = stored[THEME_STORAGE_KEY];
  selectedTheme = isThemeMode(savedTheme) ? savedTheme : "auto";
  if (themeSelect) {
    themeSelect.value = selectedTheme;
    themeSelect.addEventListener("change", () => {
      const mode = themeSelect.value;
      if (!isThemeMode(mode)) {
        return;
      }
      selectedTheme = mode;
      void browser.storage.local.set({ [THEME_STORAGE_KEY]: mode });
      applyTheme(mode);
    });
  }
  applyTheme(selectedTheme);
  onSystemThemeChange(() => applyTheme(selectedTheme));
}

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
      if (!permissionsReady || permissionsBusy || permissionStates[platform]) {
        return;
      }
      const platformLabel = button.textContent?.trim() || platform;
      permissionsBusy = true;
      renderPermissions();
      setPermissionFeedback(
        interpolate("permissions.requestingOne", { platform: platformLabel })
      );
      try {
        // Invoke request() directly from the click handler's task. Awaiting a
        // contains() check first can lose Chrome's required user activation.
        const granted = await browser.permissions.request({
          origins: PLATFORM_ORIGINS[platform]
        });
        permissionStates = await readPlatformPermissionState(browser.permissions);
        setPermissionFeedback(
          granted && permissionStates[platform]
            ? interpolate("permissions.grantedOne", {
                platform: platformLabel
              })
            : i("permissions.denied"),
          granted && permissionStates[platform] ? "success" : "warning"
        );
      } catch {
        setPermissionFeedback(i("permissions.failed"), "error");
      } finally {
        permissionsBusy = false;
        permissionsReady = true;
        renderPermissions();
      }
    })();
  });
}

// --- Batch grant all platforms ---
grantAllButton?.addEventListener("click", () => {
  void (async () => {
    if (!permissionsReady || permissionsBusy) {
      return;
    }
    const missingBefore = getMissingPlatforms(permissionStates);
    if (missingBefore.length === 0) {
      return;
    }
    permissionsBusy = true;
    renderPermissions();
    setPermissionFeedback(i("permissions.requesting"));
    try {
      const result = await requestMissingPlatformPermissions(
        browser.permissions,
        permissionStates
      );
      permissionStates = result.states;
      if (result.remainingPlatforms.length === 0) {
        setPermissionFeedback(
          interpolate("permissions.grantedCount", {
            count: result.grantedPlatforms.length
          }),
          "success"
        );
      } else if (result.grantedPlatforms.length > 0) {
        setPermissionFeedback(
          interpolate("permissions.partial", {
            granted: result.grantedPlatforms.length,
            remaining: result.remainingPlatforms.length
          }),
          "warning"
        );
      } else {
        setPermissionFeedback(i("permissions.denied"), "warning");
      }
    } catch {
      setPermissionFeedback(i("permissions.failed"), "error");
    } finally {
      permissionsBusy = false;
      permissionsReady = true;
      renderPermissions();
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

localizeDocument();
void Promise.all([refreshStatus(), refreshPermissions(), initializeTheme()]);
