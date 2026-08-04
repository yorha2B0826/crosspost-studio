// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import path from "node:path";

import { BROWSER_PLATFORM_IDS } from "@crosspost/protocol";
import { describe, expect, it } from "vitest";

import { t } from "../../lib/i18n";

describe("extension popup platform matrix", () => {
  it("renders every browser platform exactly once", async () => {
    const html = await readFile(
      path.join(
        process.cwd(),
        "apps/browser-extension/src/entrypoints/popup/index.html"
      ),
      "utf8"
    );
    document.documentElement.innerHTML = html;

    const rendered = Array.from(
      document.querySelectorAll<HTMLElement>("[data-platform]"),
      (element) => element.dataset.platform
    );

    expect(rendered).toEqual(BROWSER_PLATFORM_IDS);
    expect(new Set(rendered).size).toBe(BROWSER_PLATFORM_IDS.length);
  });

  it.each(["en", "zh-CN"] as const)(
    "has a localized %s label for every platform",
    (locale) => {
      for (const platform of BROWSER_PLATFORM_IDS) {
        const key = `${platform}.label`;
        expect(t(key, locale)).not.toBe(key);
      }
    }
  );

  it.each(["en", "zh-CN"] as const)(
    "has localized %s text for every popup key",
    async (locale) => {
      const html = await readFile(
        path.join(
          process.cwd(),
          "apps/browser-extension/src/entrypoints/popup/index.html"
        ),
        "utf8"
      );
      document.documentElement.innerHTML = html;

      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-i18n]"
      )) {
        const key = element.dataset.i18n;
        expect(key).toBeTruthy();
        expect(t(key!, locale)).not.toBe(key);
      }
    }
  );

  it("presents batch authorization as the primary permission action", async () => {
    const html = await readFile(
      path.join(
        process.cwd(),
        "apps/browser-extension/src/entrypoints/popup/index.html"
      ),
      "utf8"
    );
    document.documentElement.innerHTML = html;

    const grantAll = document.querySelector<HTMLButtonElement>("#grant-all");
    const feedback = document.querySelector<HTMLElement>(
      "#permission-feedback"
    );

    expect(grantAll?.classList.contains("permission-primary")).toBe(true);
    expect(grantAll?.disabled).toBe(true);
    expect(feedback?.getAttribute("role")).toBe("status");
    expect(feedback?.getAttribute("aria-live")).toBe("polite");
  });
});
