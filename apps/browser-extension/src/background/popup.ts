import { browser } from "wxt/browser";
import { mergeExtensionConfiguration } from "../lib/configuration";
import type {
  ExtensionStatus,
  PopupRequest,
  PopupResponse
} from "../lib/messages";
import {
  CONFIG_KEY,
  getConfiguration,
  reconnect,
  STATUS_KEY
} from "./bridge";

export async function handlePopupRequest(request: PopupRequest): Promise<PopupResponse> {
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
    void reconnect();
    return {};
  }
  if (request.type === "crosspost:reconnect") {
    void reconnect();
    return {};
  }
  return {};
}
