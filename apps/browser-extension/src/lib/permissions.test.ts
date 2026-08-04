import { describe, expect, it, vi } from "vitest";

import type { BrowserPlatform } from "./messages";
import {
  emptyPlatformPermissionState,
  getMissingOrigins,
  getMissingPlatforms,
  readPlatformPermissionState,
  requestMissingPlatformPermissions
} from "./permissions";
import { PLATFORM_ORIGINS } from "./platforms";

describe("optional platform permissions", () => {
  it("checks all platforms concurrently", async () => {
    const contains = vi.fn(({ origins }: { origins: string[] }) =>
      Promise.resolve(origins.includes("https://juejin.cn/*"))
    );

    const states = await readPlatformPermissionState({ contains });

    expect(states.juejin).toBe(true);
    expect(states.zhihu).toBe(false);
    expect(contains).toHaveBeenCalledTimes(Object.keys(PLATFORM_ORIGINS).length);
  });

  it("combines every missing origin into one permission request", async () => {
    const states = emptyPlatformPermissionState();
    states.zhihu = true;
    states.juejin = true;
    const granted = new Set<string>([
      ...PLATFORM_ORIGINS.zhihu,
      ...PLATFORM_ORIGINS.juejin
    ]);
    const request = vi.fn(({ origins }: { origins: string[] }) => {
      for (const origin of origins) {
        granted.add(origin);
      }
      return Promise.resolve(true);
    });
    const contains = vi.fn(({ origins }: { origins: string[] }) =>
      Promise.resolve(origins.every((origin) => granted.has(origin)))
    );

    const result = await requestMissingPlatformPermissions(
      { contains, request },
      states
    );

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      origins: getMissingOrigins(states)
    });
    expect(result.accepted).toBe(true);
    expect(result.remainingPlatforms).toEqual([]);
    expect(result.grantedPlatforms).toEqual(getMissingPlatforms(states));
  });

  it("reports platforms that remain disabled after a partial result", async () => {
    const states = emptyPlatformPermissionState();
    const newlyGranted = new Set<BrowserPlatform>(["segmentfault", "51cto"]);
    const contains = vi.fn(({ origins }: { origins: string[] }) => {
      const platform = (
        Object.entries(PLATFORM_ORIGINS) as Array<
          [BrowserPlatform, string[]]
        >
      ).find(([, candidate]) => candidate === origins)?.[0];
      return Promise.resolve(platform ? newlyGranted.has(platform) : false);
    });

    const result = await requestMissingPlatformPermissions(
      {
        contains,
        request: vi.fn(() => Promise.resolve(false))
      },
      states
    );

    expect(result.accepted).toBe(false);
    expect(result.grantedPlatforms).toEqual(["51cto", "segmentfault"]);
    expect(result.remainingPlatforms).not.toContain("51cto");
    expect(result.remainingPlatforms).not.toContain("segmentfault");
  });
});
