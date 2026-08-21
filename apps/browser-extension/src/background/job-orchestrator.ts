import {
  PROTOCOL_VERSION,
  type BridgeMessage,
  type DraftBinding,
  type PublishJob
} from "@crosspost/protocol";
import { browser } from "wxt/browser";
import { hydrateJobAssets } from "../lib/assets";
import {
  canonicalizeCnblogsDraftUrl,
  isExpectedDraftUrl,
  isStableDraftUrl,
  waitForStableDraftUrl
} from "../lib/platforms";
import { hasPlatformPermission, send, sendProgress } from "./bridge";
import {
  resolveBilibiliDraftUrl,
  verifyBilibiliDraftAssets
} from "./draft-verification/bilibili";
import { verifyCsdnDraftContent } from "./draft-verification/csdn";
import { verifyJianshuDraftContent } from "./draft-verification/jianshu";
import { verifySegmentFaultDraftContent } from "./draft-verification/segmentfault";
import { resolveOsChinaDraftUrl } from "./draft-verification/oschina";
import {
  resolveToutiaoDraftUrl,
  verifyToutiaoDraftContent
} from "./draft-verification/toutiao";
import { PersistentJobLedger } from "./job-ledger";
import { applyToTab, openDraftTab, pause } from "./tab-flow";

const cancelledJobs = new PersistentJobLedger();

// Kick off hydration at service-worker startup; enqueueJob awaits it before
// claiming an id so replays and interrupted-job answers are available even
// for the first message after a restart.
void cancelledJobs.hydrate();

export async function enqueueJob(job: PublishJob): Promise<void> {
  const claim = await cancelledJobs.claim(job.id);
  if (claim.status === "completed") {
    try {
      send(claim.value);
    } catch (error) {
      console.warn(
        `Failed to deliver the stored result for job ${job.id} to Obsidian.`,
        error
      );
    }
    return;
  }
  if (claim.status === "active") {
    sendProgressSafe(
      job.id,
      "queued",
      "This idempotent job is already running."
    );
    return;
  }
  try {
    await processJob(job);
  } catch (error) {
    console.warn(`Failed to run draft job ${job.id}.`, error);
  } finally {
    await cancelledJobs.release(job.id);
    await cancelledJobs.clearCancelled(job.id);
  }
}

async function processJob(job: PublishJob): Promise<void> {
  let editorMayHaveChanged = false;
  const isCancelled = (): boolean => cancelledJobs.isCancelled(job.id);
  try {
    if (await cancelledJobs.clearCancelled(job.id)) {
      await sendResult(
        job,
        "cancelled",
        "The job was cancelled before it started."
      );
      return;
    }
    if (!(await hasPlatformPermission(job.target))) {
      await sendResult(
        job,
        "failed",
        `Enable ${job.target} in the extension popup before retrying.`,
        undefined,
        "permission-required"
      );
      return;
    }

    sendProgressSafe(
      job.id,
      "prepared",
      "Loading one-time article assets from Obsidian."
    );
    const content = await hydrateJobAssets(job);
    if (await cancelledJobs.clearCancelled(job.id)) {
      await sendResult(job, "cancelled", "The job was cancelled.");
      return;
    }

    sendProgressSafe(
      job.id,
      "waiting-for-login",
      "Opening the visible platform draft editor."
    );
    const tabId = await openDraftTab(job);
    sendProgressSafe(
      job.id,
      "injecting",
      "Filling the visible editor and waiting for save confirmation."
    );
    editorMayHaveChanged = true;
    const result = await applyToTab(tabId, job, content);
    if (!result.saved || !result.draftUrl) {
      await sendResult(
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
        ? await resolveBilibiliDraftUrl(
            tabId,
            job.artifact.metadata.title,
            isCancelled
          )
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
                job.artifact.metadata.title,
                isCancelled
              )
          : undefined;
    const stableDraftUrl =
      resolvedPlatformDraftUrl ??
      (job.target === "baijiahao" &&
      result.draftUrl &&
      isExpectedDraftUrl(job.target, result.draftUrl)
        ? result.draftUrl
        : await waitForStableDraftUrl(
            job.target,
            result.draftUrl,
            async () => (await browser.tabs.get(tabId)).url,
            () => pause(250)
          ));
    if (!stableDraftUrl) {
      await sendResult(
        job,
        "unknown",
        "The platform reported a save, but the resulting URL did not identify a reusable draft.",
        undefined,
        "unrecognized-draft-url"
      );
      return;
    }
    if (job.target === "bilibili") {
      sendProgressSafe(
        job.id,
        "injecting",
        "Reloading the saved Bilibili draft to verify its uploaded images."
      );
      const expectedImageCount = (content.html.match(/<img\b/gi) ?? []).length;
      const verified = await verifyBilibiliDraftAssets(
        tabId,
        expectedImageCount,
        isCancelled
      );
      if (!verified) {
        if (await abortIfCancelled(job)) {
          return;
        }
        await sendResult(
          job,
          "unknown",
          "Bilibili reported a save, but the reloaded draft did not preserve every uploaded image.",
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "csdn") {
      sendProgressSafe(
        job.id,
        "injecting",
        "Reloading the saved CSDN draft to verify its Markdown and images."
      );
      const verification = await verifyCsdnDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0,
        isCancelled
      );
      if (!verification.verified) {
        if (await abortIfCancelled(job)) {
          return;
        }
        await sendResult(
          job,
          "unknown",
          `CSDN accepted the edit, but the reloaded draft did not preserve the replacement Markdown and images (${verification.diagnostic}).`,
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "jianshu") {
      sendProgressSafe(
        job.id,
        "injecting",
        "Reloading the saved Jianshu draft to verify its article body and images."
      );
      const verification = await verifyJianshuDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0,
        isCancelled
      );
      if (!verification.verified) {
        if (await abortIfCancelled(job)) {
          return;
        }
        await sendResult(
          job,
          "unknown",
          `Jianshu accepted the edit, but the reloaded draft did not preserve the replacement article body and images (${verification.diagnostic}).`,
          undefined,
          "editor-update-unconfirmed"
        );
        return;
      }
    }
    if (job.target === "toutiao") {
      sendProgressSafe(
        job.id,
        "injecting",
        "Reloading the saved Toutiao draft to verify its article body and images."
      );
      const verification = await verifyToutiaoDraftContent(
        tabId,
        job.artifact.metadata.title,
        content.html,
        result.imageCount ?? 0,
        isCancelled
      );
      if (!verification.verified) {
        if (await abortIfCancelled(job)) {
          return;
        }
        await sendResult(
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
      sendProgressSafe(
        job.id,
        "injecting",
        "Reloading the saved SegmentFault draft to verify its Markdown and images."
      );
      const verified = await verifySegmentFaultDraftContent(
        tabId,
        job.artifact.metadata.title,
        result.bodyText ?? "",
        result.imageCount ?? 0,
        isCancelled
      );
      if (!verified) {
        if (await abortIfCancelled(job)) {
          return;
        }
        await sendResult(
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
    await sendResult(
      job,
      "draft-saved",
      job.target === "segmentfault"
        ? "SegmentFault preserved the exact Markdown and uploaded images after reload."
        : job.target === "toutiao"
          ? "Toutiao preserved the article body and uploaded images after reload."
          : job.target === "baijiahao" &&
              !isStableDraftUrl(job.target, reusableDraftUrl)
            ? "Baijiahao accepted the visible draft action. Keep the saved draft tab open, or reopen that draft manually before updating it."
        : result.message,
      binding
    );
  } catch (error) {
    const state =
      editorMayHaveChanged && !job.existingBinding ? "unknown" : "failed";
    await sendResult(
      job,
      state,
      error instanceof Error ? error.message : "The browser draft job failed.",
      undefined,
      state === "unknown" ? "create-result-unknown" : "browser-job-failed"
    );
  }
}

/**
 * Progress delivery is best-effort: losing a progress message must never
 * abort the underlying draft job.
 */
function sendProgressSafe(
  jobId: string,
  state: Parameters<typeof sendProgress>[1],
  message: string
): void {
  try {
    sendProgress(jobId, state, message);
  } catch (error) {
    console.warn(`Failed to deliver progress for job ${jobId}.`, error);
  }
}

/** Answer a cancellation that arrived during a polling phase. */
async function abortIfCancelled(job: PublishJob): Promise<boolean> {
  if (!cancelledJobs.isCancelled(job.id)) {
    return false;
  }
  await sendResult(job, "cancelled", "The job was cancelled.");
  return true;
}

async function sendResult(
  job: PublishJob,
  state: "draft-saved" | "failed" | "unknown" | "cancelled",
  message: string,
  binding?: DraftBinding,
  errorCode?: string
): Promise<void> {
  const result = {
    binding,
    errorCode,
    jobId: job.id,
    message,
    protocolVersion: PROTOCOL_VERSION,
    state,
    type: "job-result"
  } satisfies Extract<BridgeMessage, { type: "job-result" }>;
  // Persist the terminal result first so a failed delivery never loses it.
  await cancelledJobs.complete(job.id, result);
  try {
    send(result);
  } catch (error) {
    console.warn(
      `Failed to deliver the result for job ${job.id} to Obsidian.`,
      error
    );
  }
}

export function cancelJob(jobId: string): void {
  void cancelledJobs.markCancelled(jobId);
}
