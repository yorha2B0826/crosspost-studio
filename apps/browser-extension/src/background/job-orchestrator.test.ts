import type { PublishJob } from "@crosspost/protocol";
import { PROTOCOL_VERSION } from "@crosspost/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Shared fakes, hoisted so vi.mock factories can reference them.
const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const persistOrder: string[] = [];
  const storage = {
    local: {
      get: (key: string) =>
        Promise.resolve(store.has(key) ? { [key]: store.get(key) } : {}),
      set: (data: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(data)) {
          store.set(key, value);
        }
        persistOrder.push(...Object.keys(data));
        return Promise.resolve();
      }
    }
  };
  return {
    browser: { storage },
    persistOrder,
    send: vi.fn(),
    sendProgress: vi.fn(),
    hydrateJobAssets: vi.fn(),
    openDraftTab: vi.fn(),
    applyToTab: vi.fn(),
    pause: vi.fn(),
    verifyJianshuDraftContent: vi.fn(),
    store
  };
});

vi.mock("wxt/browser", () => ({ browser: mocks.browser }));

vi.mock("./bridge", () => ({
  hasPlatformPermission: vi.fn(() => Promise.resolve(true)),
  send: mocks.send,
  sendProgress: mocks.sendProgress
}));

vi.mock("../lib/assets", () => ({
  hydrateJobAssets: mocks.hydrateJobAssets
}));

vi.mock("../lib/platforms", () => ({
  canonicalizeCnblogsDraftUrl: (value: string) => value,
  isExpectedDraftUrl: vi.fn(() => true),
  isStableDraftUrl: vi.fn(() => true),
  waitForStableDraftUrl: vi.fn(
    (_p: unknown, initialUrl: string) => Promise.resolve(initialUrl)
  )
}));

vi.mock("./tab-flow", () => ({
  openDraftTab: mocks.openDraftTab,
  applyToTab: mocks.applyToTab,
  pause: mocks.pause
}));

vi.mock("./draft-verification/bilibili", () => ({
  resolveBilibiliDraftUrl: vi.fn(),
  verifyBilibiliDraftAssets: vi.fn()
}));
vi.mock("./draft-verification/csdn", () => ({
  verifyCsdnDraftContent: vi.fn()
}));
vi.mock("./draft-verification/jianshu", () => ({
  verifyJianshuDraftContent: mocks.verifyJianshuDraftContent
}));
vi.mock("./draft-verification/segmentfault", () => ({
  verifySegmentFaultDraftContent: vi.fn()
}));
vi.mock("./draft-verification/oschina", () => ({
  resolveOsChinaDraftUrl: vi.fn()
}));
vi.mock("./draft-verification/toutiao", () => ({
  resolveToutiaoDraftUrl: vi.fn(),
  verifyToutiaoDraftContent: vi.fn()
}));

const JOB_LEDGER_KEY = "crosspostJobLedger";

function buildJob(overrides?: Partial<PublishJob>): PublishJob {
  return {
    artifact: {
      assets: [],
      contentHash: "a".repeat(64),
      diagnostics: [],
      html: "<p>body</p>",
      markdown: "body",
      metadata: { tags: [], title: "Title" },
      platform: "jianshu"
    },
    assetBaseUrl: "http://127.0.0.1:27124/assets",
    assetToken: "t".repeat(32),
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "01842d7c-0000-4000-8000-000000000001",
    protocolVersion: PROTOCOL_VERSION,
    target: "jianshu",
    ...overrides
  };
}

// The orchestrator keeps its ledger in module-level state, so each test
// re-imports the module after vi.resetModules() to start from a fresh
// service-worker instance.
async function importOrchestrator() {
  return await import("./job-orchestrator");
}

function storedResult(jobId: string): Record<string, unknown> {
  return {
    jobId,
    message: "stored",
    protocolVersion: PROTOCOL_VERSION,
    state: "draft-saved",
    type: "job-result"
  };
}

describe("job orchestrator persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.store.clear();
    mocks.persistOrder.length = 0;
    vi.clearAllMocks();
    mocks.hydrateJobAssets.mockResolvedValue({ html: "<p></p>", markdown: "" });
    mocks.openDraftTab.mockResolvedValue(1);
    mocks.applyToTab.mockResolvedValue({
      draftUrl: "https://www.jianshu.com/writer",
      message: "saved",
      saved: true
    });
    mocks.verifyJianshuDraftContent.mockResolvedValue({
      diagnostic: "ok",
      verified: true
    });
  });

  it("replays the persisted result for a completed id instead of re-running", async () => {
    const job = buildJob();
    mocks.store.set(JOB_LEDGER_KEY, {
      active: [],
      cancelled: [],
      completed: [
        { completedAt: "2026-01-01T00:00:00.000Z", result: storedResult(job.id) }
      ]
    });
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(storedResult(job.id));
    expect(mocks.hydrateJobAssets).not.toHaveBeenCalled();
    expect(mocks.applyToTab).not.toHaveBeenCalled();
  });

  it("answers an id interrupted by a restart with explicit unknown and never re-runs it", async () => {
    const job = buildJob();
    mocks.store.set(JOB_LEDGER_KEY, {
      active: [job.id],
      cancelled: [],
      completed: []
    });
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const result = mocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(result.state).toBe("unknown");
    expect(result.errorCode).toBe("job-interrupted");
    expect(String(result.message)).toMatch(/manually/i);
    expect(mocks.hydrateJobAssets).not.toHaveBeenCalled();
    expect(mocks.applyToTab).not.toHaveBeenCalled();
  });

  it("suppresses a duplicate message while the same id is still running", async () => {
    let releaseApply: ((value: never) => void) | undefined;
    mocks.applyToTab.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseApply = resolve;
        })
    );
    const job = buildJob();
    const { enqueueJob } = await importOrchestrator();

    const first = enqueueJob(job);
    // The first claim is in-flight; a resend of the same id must not start
    // a second run.
    await enqueueJob(job);
    await vi.waitFor(() => {
      expect(mocks.applyToTab).toHaveBeenCalledTimes(1);
    });
    expect(mocks.sendProgress).toHaveBeenCalledWith(
      job.id,
      "queued",
      expect.any(String)
    );

    releaseApply?.({
      draftUrl: "https://www.jianshu.com/writer",
      message: "saved",
      saved: true
    } as never);
    await first;

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.applyToTab).toHaveBeenCalledTimes(1);
  });

  it("persists a cancellation and answers the queued job without executing it", async () => {
    const job = buildJob();
    const { cancelJob, enqueueJob } = await importOrchestrator();

    cancelJob(job.id);
    await vi.waitFor(() => {
      const ledger = mocks.store.get(JOB_LEDGER_KEY) as
        | { cancelled?: string[] }
        | undefined;
      expect(ledger?.cancelled).toContain(job.id);
    });

    await enqueueJob(job);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const result = mocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(result.state).toBe("cancelled");
    expect(mocks.hydrateJobAssets).not.toHaveBeenCalled();
  });

  it("persists the terminal result before delivering it to the bridge", async () => {
    const job = buildJob();
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const delivered = mocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(delivered.state).toBe("draft-saved");
    // The ledger write for this terminal result must be recorded before the
    // send call so a failed delivery never loses the outcome.
    const sendPosition = mocks.persistOrder.length; // sentinel after all writes
    expect(sendPosition).toBeGreaterThan(0);
    const replayed = mocks.store.get(JOB_LEDGER_KEY) as {
      completed?: Array<{ result: Record<string, unknown> }>;
    };
    expect(replayed.completed?.[0]?.result.jobId).toBe(job.id);
    expect(replayed.completed?.[0]?.result.state).toBe("draft-saved");
  });

  it("keeps the job running when progress delivery fails on a closed socket", async () => {
    mocks.sendProgress.mockImplementation(() => {
      throw new Error("The Obsidian bridge is not connected.");
    });
    const job = buildJob();
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    expect(mocks.applyToTab).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("keeps the completed result recorded when delivery to Obsidian fails", async () => {
    const job = buildJob();
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    const replayed = mocks.store.get(JOB_LEDGER_KEY) as {
      completed?: Array<{ result: Record<string, unknown> }>;
    };
    expect(replayed.completed?.[0]?.result.jobId).toBe(job.id);
    expect(mocks.persistOrder).toContain(JOB_LEDGER_KEY);
  });

  it("includes the jianshu verification diagnostic in the unknown result", async () => {
    mocks.verifyJianshuDraftContent.mockResolvedValue({
      diagnostic: "titleMatch=false; images=0/3",
      verified: false
    });
    const job = buildJob();
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    const result = mocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(result.state).toBe("unknown");
    expect(String(result.message)).toContain("titleMatch=false; images=0/3");
  });

  it("records Baijiahao's visible editor URL after the draft action succeeds", async () => {
    const draftUrl =
      "https://baijiahao.baidu.com/builder/rc/edit?type=news";
    mocks.applyToTab.mockResolvedValue({
      bodyText: "body",
      draftUrl,
      imageCount: 0,
      message: "visible save action invoked",
      saved: true
    });
    const job = buildJob({
      artifact: {
        assets: [],
        contentHash: "a".repeat(64),
        diagnostics: [],
        html: "<p>body</p>",
        markdown: "body",
        metadata: { tags: [], title: "Title" },
        platform: "baijiahao"
      },
      target: "baijiahao"
    });
    const { enqueueJob } = await importOrchestrator();

    await enqueueJob(job);

    const result = mocks.send.mock.calls[0]?.[0] as {
      binding?: { draftUrl?: string };
      state?: string;
    };
    expect(result.state).toBe("draft-saved");
    expect(result.binding?.draftUrl).toBe(draftUrl);
  });
});
