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
});
