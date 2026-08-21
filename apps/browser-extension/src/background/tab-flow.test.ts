import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  executeScript: vi.fn(),
  get: vi.fn(),
  onUpdated: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  },
  query: vi.fn(),
  reload: vi.fn(),
  remove: vi.fn(),
  sendMessage: vi.fn(),
  update: vi.fn()
}));

vi.mock("wxt/browser", () => ({
  browser: {
    scripting: { executeScript: mocks.executeScript },
    tabs: mocks
  }
}));

// tab-flow sleeps via `self.setTimeout`, which the service worker provides;
// alias it to the global object so fake timers control it in tests.
vi.stubGlobal("self", globalThis);

import { BROWSER_RUNTIME_REVISION } from "@crosspost/protocol";
import type { PublishJob } from "@crosspost/protocol";
import { ensureCurrentRunner, openDraftTab, pause } from "./tab-flow";

function job(
  existingUrl?: string,
  platform: PublishJob["target"] = "oschina"
): PublishJob {
  return {
    artifact: {
      assets: [],
      contentHash: "a".repeat(64),
      diagnostics: [],
      html: "<p>body</p>",
      markdown: "body",
      metadata: { tags: [], title: "title" },
      platform
    },
    assetBaseUrl: "http://127.0.0.1:27124/assets",
    assetToken: "token",
    createdAt: "2026-08-21T00:00:00.000Z",
    existingBinding: existingUrl
      ? {
          draftUrl: existingUrl,
          platform,
          sourceHash: "a".repeat(64),
          updatedAt: "2026-08-20T00:00:00.000Z"
        }
      : undefined,
    id: "00000000-0000-4000-8000-000000000001",
    protocolVersion: 1,
    target: platform
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pause", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately when already cancelled instead of sleeping", async () => {
    vi.useFakeTimers();
    const settled = expect(pause(10_000, () => true)).resolves.toBeUndefined();
    // No timer should need to fire: the cancellation check precedes sleep.
    await vi.advanceTimersByTimeAsync(0);
    await settled;
  });

  it("aborts mid-sleep when cancellation flips on between slices", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const settled = expect(
      pause(10_000, () => cancelled)
    ).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(250);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(250);
    await settled;
  });

  it("still sleeps the requested duration when never cancelled", async () => {
    vi.useFakeTimers();
    const settled = expect(pause(600)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(599);
    let resolved = false;
    void settled.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(resolved).toBe(true);
  });
});

describe("content runner lifecycle", () => {
  it("keeps a current content script without reloading the draft", async () => {
    mocks.sendMessage.mockResolvedValue({
      ready: true,
      runtimeRevision: BROWSER_RUNTIME_REVISION
    });

    await expect(ensureCurrentRunner(42)).resolves.toBeUndefined();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.executeScript).not.toHaveBeenCalled();
  });

  it("reloads a stale content script before injecting the current runner", async () => {
    mocks.sendMessage
      .mockResolvedValueOnce({ ready: true })
      .mockResolvedValueOnce({
        ready: true,
        runtimeRevision: BROWSER_RUNTIME_REVISION
      });
    mocks.reload.mockImplementation((tabId: number) => {
      const listener = mocks.onUpdated.addListener.mock.calls.at(-1)?.[0] as
        | ((updatedId: number, change: { status?: string }) => void)
        | undefined;
      listener?.(tabId, { status: "complete" });
      return Promise.resolve();
    });

    await expect(ensureCurrentRunner(42)).resolves.toBeUndefined();
    expect(mocks.reload).toHaveBeenCalledWith(42);
    expect(mocks.executeScript).toHaveBeenCalledWith({
      files: ["/content-scripts/platform.js"],
      target: { tabId: 42 }
    });
  });

  it("injects the current runner without reloading when none is present", async () => {
    mocks.sendMessage
      .mockRejectedValueOnce(new Error("No receiving end"))
      .mockResolvedValueOnce({
        ready: true,
        runtimeRevision: BROWSER_RUNTIME_REVISION
      });

    await expect(ensureCurrentRunner(42)).resolves.toBeUndefined();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.executeScript).toHaveBeenCalledTimes(1);
  });
});

describe("openDraftTab", () => {
  it("reuses the exact existing draft even when a new editor tab is active", async () => {
    const existingUrl =
      "https://my.oschina.net/u/9762237/blog/ai-write/draft/3300943";
    mocks.query.mockResolvedValue([
      {
        active: true,
        id: 12,
        lastAccessed: 300,
        status: "complete",
        url: "https://my.oschina.net/u/9762237/blog/ai-write"
      },
      {
        active: false,
        id: 11,
        lastAccessed: 100,
        status: "complete",
        url: existingUrl
      }
    ]);
    mocks.update.mockResolvedValue({ id: 11, status: "complete", url: existingUrl });
    mocks.get.mockResolvedValue({ id: 11, status: "complete", url: existingUrl });

    await expect(openDraftTab(job(existingUrl))).resolves.toBe(11);
    expect(mocks.update).toHaveBeenCalledWith(11, { active: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("recycles a blank platform editor when opening an existing binding", async () => {
    const existingUrl =
      "https://my.oschina.net/u/9762237/blog/ai-write/draft/3300943";
    const blankUrl = "https://my.oschina.net/u/9762237/blog/ai-write";
    mocks.query.mockResolvedValue([
      {
        active: true,
        id: 12,
        lastAccessed: 300,
        status: "complete",
        url: blankUrl
      }
    ]);
    mocks.update.mockResolvedValue({ id: 12, status: "complete", url: existingUrl });
    mocks.get.mockResolvedValue({ id: 12, status: "complete", url: existingUrl });

    await expect(openDraftTab(job(existingUrl))).resolves.toBe(12);
    expect(mocks.update).toHaveBeenCalledWith(12, {
      active: true,
      url: existingUrl
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses to reopen a session-only Baijiahao binding as a new draft", async () => {
    const visibleEditorUrl =
      "https://baijiahao.baidu.com/builder/rc/edit?type=news";
    mocks.query.mockResolvedValue([]);

    await expect(
      openDraftTab(job(visibleEditorUrl, "baijiahao"))
    ).rejects.toThrow(/previously saved Baijiahao draft/i);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
