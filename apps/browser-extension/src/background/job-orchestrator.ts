import { PROTOCOL_VERSION } from "@crosspost/protocol";
import type {
  BridgeMessage,
  DraftBinding,
  PublishJob
} from "@crosspost/protocol";
import { browser } from "wxt/browser";
import { hydrateJobAssets } from "../lib/assets";
import { IdempotencyLedger } from "../lib/idempotency";
import {
  canonicalizeCnblogsDraftUrl,
  isStableDraftUrl,
  waitForStableDraftUrl
} from "../lib/platforms";
import { hasPlatformPermission, send, sendProgress } from "./bridge";
import {
  resolveBilibiliDraftUrl,
  verifyBilibiliDraftAssets
} from "./draft-verification/bilibili";
import { verifyJianshuDraftContent } from "./draft-verification/jianshu";
import { verifySegmentFaultDraftContent } from "./draft-verification/segmentfault";
import {
  resolveOsChinaDraftUrl
} from "./draft-verification/oschina";
import {
  resolveToutiaoDraftUrl,
  verifyToutiaoDraftContent
} from "./draft-verification/toutiao";
import { applyToTab, openDraftTab, pause } from "./tab-flow";

const cancelledJobs = new Set<string>();
const jobs = new IdempotencyLedger<
  Extract<BridgeMessage, { type: "job-result" }>
>();

export function enqueueJob(job: PublishJob): void {
  const claim = jobs.claim(job.id);
  if (claim.status === "completed") {
    send(claim.value);
    return;
  }
  if (claim.status === "active") {
    sendProgress(job.id, "queued", "This idempotent job is already running.");
    return;
  }
  void processJob(job).finally(() => {
    jobs.release(job.id);
  });
}

async function processJob(job: PublishJob): Promise<void> {
  let editorMayHaveChanged = false;
  try {
    if (cancelledJobs.delete(job.id)) {
      sendResult(job, "cancelled", "The job was cancelled before it started.");
      return;
    }
    if (!(await hasPlatformPermission(job.target))) {
      sendResult(
        job,
        "failed",
        `Enable ${job.target} in the extension popup before retrying.`,
        undefined,
        "permission-required"
      );
      return;
    }

    sendProgress(job.id, "prepared", "Loading one-time article assets from Obsidian.");
    const content = await hydrateJobAssets(job);
    if (cancelledJobs.delete(job.id)) {
      sendResult(job, "cancelled", "The job was cancelled.");
      return;
    }

    sendProgress(job.id, "waiting-for-login", "Opening the visible platform draft editor.");
    const tabId = await openDraftTab(job);
    sendProgress(job.id, "injecting", "Filling the visible editor and waiting for save confirmation.");
    editorMayHaveChanged = true;
    const result = await applyToTab(tabId, job, content);
    if (!result.saved || !result.draftUrl) {
      sendResult(
        job,
        result.unknown ? "unknown" : "failed",
        result.message,
        undefined,
        result.errorCode
      );
      return;
    }
    const resolvedPlatformDraftUrl =
      job.target === "bilibili" && !isStableDraftUrl(job.target, result.draftUrl)
        ? await resolveBilibiliDraftUrl(tabId, job.artifact.metadata.title)
        : job.target === "oschina" &&
            !isStableDraftUrl(job.target, result.draftUrl)
          ? await resolveOsChinaDraftUrl(
              tabId,
              job.artifact.metadata.title,
              result.draftUrl
            )
          : job.target === "toutiao" &&
              !isStableDraftUrl(job.target, result.draftUrl)
            ? await resolveToutiaoDraftUrl(
                tabId,
                job.artifact.metadata.title
              )
          : undefined;
    const stableDraftUrl =
      resolvedPlatformDraftUrl ??
      (await waitForStableDraftUrl(
        job.target,
        result.draftUrl,
        async () => (await browser.tabs.get(tabId)).url,
        () => pause(250)
      ));
    if (!stableDraftUrl) {
      sendResult(
        job,
        "unknown",
        "The platform reported a save, but the resulting URL did not identify a reusable draft.",
        undefined,
        "unrecognized-draft-url"
      );
      return;
    }
    if (job.target === "bilibili") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved Bilibili draft to verify its uploaded images."
      );
      const expectedImageCount = (content.html.match(/<img\b/gi) ?? []).length;
      const verified = await verifyBilibiliDraftAssets(
        tabId,
        expectedImageCount
      );
      if (!verified) {
        sendResult(
          job,
          "unknown",
          "Bilibili reported a save, but the reloaded draft did not preserve every uploaded image.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "jianshu") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved Jianshu draft to verify its article body and images."
      );
      const verified = await verifyJianshuDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0
      );
      if (!verified) {
        sendResult(
          job,
          "unknown",
          "Jianshu reported a save, but the reloaded draft did not preserve the replacement article body and images.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "toutiao") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved Toutiao draft to verify its article body and images."
      );
      const verification = await verifyToutiaoDraftContent(
        tabId,
        job.artifact.metadata.title,
        content.html,
        result.imageCount ?? 0
      );
      if (!verification.verified) {
        sendResult(
          job,
          "unknown",
          `Toutiao accepted the edit, but the reloaded draft did not preserve the article body and uploaded images (${verification.diagnostic}).`,
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "segmentfault") {
      sendProgress(
        job.id,
        "injecting",
        "Reloading the saved SegmentFault draft to verify its Markdown and images."
      );
      const verified = await verifySegmentFaultDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0
      );
      if (!verified) {
        sendResult(
          job,
          "unknown",
          "SegmentFault accepted the edit, but the reloaded draft did not preserve the exact Markdown and uploaded images.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    const reusableDraftUrl =
      job.target === "cnblogs"
        ? canonicalizeCnblogsDraftUrl(stableDraftUrl) ?? stableDraftUrl
        : stableDraftUrl;
    const binding: DraftBinding = {
      draftUrl: reusableDraftUrl,
      platform: job.target,
      sourceHash: job.artifact.contentHash,
      updatedAt: new Date().toISOString()
    };
    sendResult(
      job,
      "draft-saved",
      job.target === "segmentfault"
        ? "SegmentFault preserved the exact Markdown and uploaded images after reload."
        : job.target === "toutiao"
          ? "Toutiao preserved the article body and uploaded images after reload."
        : result.message,
      binding
    );
  } catch (error) {
    const state =
      editorMayHaveChanged && !job.existingBinding ? "unknown" : "failed";
    sendResult(
      job,
      state,
      error instanceof Error ? error.message : "The browser draft job failed.",
      undefined,
      state === "unknown" ? "create-result-unknown" : "browser-job-failed"
    );
  } finally {
    cancelledJobs.delete(job.id);
  }
}

function sendResult(
  job: PublishJob,
  state: "draft-saved" | "failed" | "unknown" | "cancelled",
  message: string,
  binding?: DraftBinding,
  errorCode?: string
): void {
  const result = {
    binding,
    errorCode,
    jobId: job.id,
    message,
    protocolVersion: PROTOCOL_VERSION,
    state,
    type: "job-result"
  } satisfies Extract<BridgeMessage, { type: "job-result" }>;
  jobs.complete(job.id, result);
  send(result);
}

export function cancelJob(jobId: string): void {
  cancelledJobs.add(jobId);
}
