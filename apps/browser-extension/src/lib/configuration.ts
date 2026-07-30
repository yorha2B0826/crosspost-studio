import type { ExtensionConfiguration } from "./messages";

export function mergeExtensionConfiguration(
  current: ExtensionConfiguration,
  update: ExtensionConfiguration
): ExtensionConfiguration {
  return {
    pairingKey: update.pairingKey ?? current.pairingKey,
    port: update.port
  };
}
