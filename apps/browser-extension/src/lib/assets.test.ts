import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublishJob } from "@crosspost/protocol";

// `self.fetch` resolves against the global object in the node test runtime.
vi.stubGlobal("self", globalThis);

import { hydrateJobAssets } from "./assets";

const fetchMock = vi.fn();

function buildJob(): PublishJob {
  return {
    artifact: {
      assets: [
        {
          alt: "cover",
          id: "asset-1",
          kind: "image",
          mimeType: "image/png",
          name: "cover.png"
        }
      ],
      contentHash: "a".repeat(64),
      diagnostics: [],
      html: "<p><img src=\"crosspost-asset://asset-1\" /></p>",
      markdown: "![](crosspost-asset://asset-1)",
      metadata: { tags: [], title: "Title" },
      platform: "jianshu"
    },
    assetBaseUrl: "http://127.0.0.1:27124/assets",
    assetToken: "t".repeat(32),
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "01842d7c-0000-4000-8000-000000000002",
    protocolVersion: 1,
    target: "jianshu"
  };
}

describe("hydrateJobAssets", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal("self", globalThis);
  });

  it("inlines fetched assets into the html and markdown payloads", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0))
    });
    vi.stubGlobal("fetch", fetchMock);

    const { html, markdown } = await hydrateJobAssets(buildJob());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:27124/assets/asset-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("crosspost-asset://");
    expect(markdown).toContain("data:image/png;base64,");
  });

  it("names the asset and platform when the fetch times out", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(hydrateJobAssets(buildJob())).rejects.toThrow(
      /cover\.png.*jianshu.*30s/s
    );
  });
});
