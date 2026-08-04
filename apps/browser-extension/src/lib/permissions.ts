import type { BrowserPlatform } from "./messages";
import { PLATFORM_ORIGINS } from "./platforms";

export type PlatformPermissionState = Record<BrowserPlatform, boolean>;

export interface PlatformPermissionsApi {
  contains(details: { origins: string[] }): Promise<boolean>;
  request(details: { origins: string[] }): Promise<boolean>;
}

export interface BatchPermissionResult {
  accepted: boolean;
  grantedPlatforms: BrowserPlatform[];
  remainingPlatforms: BrowserPlatform[];
  requestedOrigins: string[];
  states: PlatformPermissionState;
}

const PLATFORM_IDS = Object.keys(PLATFORM_ORIGINS) as BrowserPlatform[];

export function emptyPlatformPermissionState(): PlatformPermissionState {
  return Object.fromEntries(
    PLATFORM_IDS.map((platform) => [platform, false])
  ) as PlatformPermissionState;
}

export async function readPlatformPermissionState(
  api: Pick<PlatformPermissionsApi, "contains">
): Promise<PlatformPermissionState> {
  const entries = await Promise.all(
    PLATFORM_IDS.map(async (platform) => [
      platform,
      await api.contains({ origins: PLATFORM_ORIGINS[platform] })
    ] as const)
  );
  return Object.fromEntries(entries) as PlatformPermissionState;
}

export function getMissingPlatforms(
  states: PlatformPermissionState
): BrowserPlatform[] {
  return PLATFORM_IDS.filter((platform) => !states[platform]);
}

export function getMissingOrigins(states: PlatformPermissionState): string[] {
  return Array.from(
    new Set(
      getMissingPlatforms(states).flatMap(
        (platform) => PLATFORM_ORIGINS[platform]
      )
    )
  );
}

export async function requestMissingPlatformPermissions(
  api: PlatformPermissionsApi,
  currentStates: PlatformPermissionState
): Promise<BatchPermissionResult> {
  const missingBefore = getMissingPlatforms(currentStates);
  const requestedOrigins = getMissingOrigins(currentStates);
  if (requestedOrigins.length === 0) {
    return {
      accepted: true,
      grantedPlatforms: [],
      remainingPlatforms: [],
      requestedOrigins,
      states: currentStates
    };
  }

  // Keep request() as the first asynchronous browser call so it remains tied
  // to the user's click. A single request also survives the popup closing when
  // Chrome opens its permission confirmation dialog.
  const accepted = await api.request({ origins: requestedOrigins });
  const states = await readPlatformPermissionState(api);
  return {
    accepted,
    grantedPlatforms: missingBefore.filter((platform) => states[platform]),
    remainingPlatforms: missingBefore.filter((platform) => !states[platform]),
    requestedOrigins,
    states
  };
}
