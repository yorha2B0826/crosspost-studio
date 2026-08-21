import type {
  ApplyDraftMessage,
  ApplyDraftResult,
  ContentPingResponse
} from "../lib/messages";
import { BROWSER_RUNTIME_REVISION } from "@crosspost/protocol/runtime";
import type { PublishJob } from "@crosspost/protocol";
import { browser } from "wxt/browser";
import {
  areEquivalentDraftUrls,
  getDraftRedirectUrl,
  isExpectedDraftUrl,
  isStableDraftUrl,
  NEW_DRAFT_URLS,
  PLATFORM_ORIGINS,
  selectPreferredDraftTab
} from "../lib/platforms";

export async function waitForTab(
  tabId: number,
  timeoutMs = 30_000
): Promise<void> {
  const current = await browser.tabs.get(tabId);
  if (current.status === "complete") {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = self.setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("The platform editor did not finish loading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId !== tabId || change.status !== "complete") {
        return;
      }
      self.clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

export async function navigateTabAndWait(
  tabId: number,
  url: string,
  timeoutMs = 30_000
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      self.clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = self.setTimeout(() => {
      finish(new Error("The platform editor did not finish loading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId === tabId && change.status === "complete") {
        finish();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs
      .update(tabId, { active: true, url })
      .then((updated) => {
        if (updated?.status === "complete" && updated.url === url) {
          finish();
        }
      })
      .catch((error: unknown) => {
        finish(
          error instanceof Error
            ? error
            : new Error("The platform editor could not be opened.")
        );
      });
  });
}

export async function reloadTabAndWait(
  tabId: number,
  timeoutMs = 30_000
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      self.clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = self.setTimeout(() => {
      finish(new Error("The platform draft did not finish reloading."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId === tabId && change.status === "complete") {
        finish();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs.reload(tabId).catch((error: unknown) => {
      finish(
        error instanceof Error
          ? error
          : new Error("The platform draft could not be reloaded.")
      );
    });
  });
}

export async function openDraftTab(job: PublishJob): Promise<number> {
  const existingUrl = job.existingBinding?.draftUrl;
  const existingBindingNeedsVisibleTab = Boolean(
    existingUrl &&
      job.target === "baijiahao" &&
      !isStableDraftUrl(job.target, existingUrl)
  );
  const targetUrl =
    existingUrl && isExpectedDraftUrl(job.target, existingUrl)
      ? existingUrl
      : NEW_DRAFT_URLS[job.target];
  const matchingTabs = await browser.tabs.query({
    url: PLATFORM_ORIGINS[job.target]
  });
  const existingTab = existingUrl
    ? selectPreferredDraftTab(
        matchingTabs.filter(
          (tab) =>
            tab.id !== undefined &&
            tab.url !== undefined &&
            areEquivalentDraftUrls(tab.url, existingUrl)
        )
      )
    : undefined;
  if (existingBindingNeedsVisibleTab && !existingTab) {
    throw new Error(
      "Open the previously saved Baijiahao draft in Chrome before retrying. Its generic editor URL cannot be reopened safely without creating a duplicate draft."
    );
  }
  const reusableNewDraftTab =
    existingUrl && !existingTab
      ? selectPreferredDraftTab(
          matchingTabs.filter(
            (candidate) =>
              candidate.url !== undefined &&
              isExpectedDraftUrl(job.target, candidate.url) &&
              !isStableDraftUrl(job.target, candidate.url)
          )
        )
      : undefined;
  const activeDraftTab = existingUrl
    ? undefined
    : selectPreferredDraftTab(
        matchingTabs.filter(
          (candidate) =>
            candidate.url !== undefined &&
            isExpectedDraftUrl(job.target, candidate.url)
        )
      );
  const tab =
    existingTab ??
    reusableNewDraftTab ??
    activeDraftTab ??
    (await browser.tabs.create({
      active: true,
      url: targetUrl
    }));
  if (tab.id === undefined) {
    throw new Error("The platform draft tab could not be opened.");
  }
  if (
    existingUrl &&
    (!tab.url || !areEquivalentDraftUrls(tab.url, targetUrl))
  ) {
    await navigateTabAndWait(tab.id, targetUrl);
  } else {
    await browser.tabs.update(tab.id, { active: true });
    await waitForTab(tab.id);
  }
  let tabId = tab.id;
  let loadedTab = await browser.tabs.get(tabId);
  const redirectedUrl = loadedTab.url
    ? getDraftRedirectUrl(job.target, loadedTab.url)
    : undefined;
  if (redirectedUrl) {
    // Some platforms expose the final authenticated editor only after a
    // landing/profile redirect. Opening the resolved editor in a new tab is
    // more reliable than replacing the landing tab in place.
    const redirectedTab = await browser.tabs.create({
      active: true,
      url: redirectedUrl
    });
    if (redirectedTab.id === undefined) {
      throw new Error("The platform draft tab could not be opened.");
    }
    await waitForTab(redirectedTab.id);
    await browser.tabs.remove(tabId);
    tabId = redirectedTab.id;
    loadedTab = await browser.tabs.get(tabId);
  }
  if (!loadedTab.url || !isExpectedDraftUrl(job.target, loadedTab.url)) {
    throw new Error(
      "The platform redirected away from its draft editor. Sign in and retry the same task."
    );
  }
  return tabId;
}

function isCurrentRunner(value: unknown): value is ContentPingResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "ready") === true &&
    Reflect.get(value, "runtimeRevision") === BROWSER_RUNTIME_REVISION
  );
}

async function pingRunner(tabId: number): Promise<unknown> {
  try {
    return await browser.tabs.sendMessage(tabId, { type: "crosspost:ping" });
  } catch {
    return undefined;
  }
}

async function injectCurrentRunner(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    files: ["/content-scripts/platform.js"],
    target: { tabId }
  });
  if (!isCurrentRunner(await pingRunner(tabId))) {
    throw new Error("The current platform content script did not become ready.");
  }
}

export async function ensureCurrentRunner(tabId: number): Promise<void> {
  const response = await pingRunner(tabId);
  if (isCurrentRunner(response)) {
    return;
  }
  if (response !== undefined) {
    // An older content script is still attached to this document. Reloading
    // removes its listeners before the current packaged runner is injected.
    await reloadTabAndWait(tabId);
  }
  await injectCurrentRunner(tabId);
}

export async function applyToTab(
  tabId: number,
  job: PublishJob,
  content: { html: string; markdown: string }
): Promise<ApplyDraftResult> {
  await ensureCurrentRunner(tabId);
  const message: ApplyDraftMessage = {
    payload: {
      html: content.html,
      jobId: job.id,
      markdown: content.markdown,
      platform: job.target,
      title: job.artifact.metadata.title
    },
    type: "crosspost:apply-draft"
  };
  return browser.tabs.sendMessage(tabId, message);
}

const PAUSE_SLICE_MS = 250;

export async function pause(
  milliseconds: number,
  isCancelled?: () => boolean
): Promise<void> {
  let remaining = milliseconds;
  while (remaining > 0) {
    if (isCancelled?.()) {
      return;
    }
    const slice = Math.min(PAUSE_SLICE_MS, remaining);
    await new Promise<void>((resolve) => {
      self.setTimeout(resolve, slice);
    });
    remaining -= slice;
  }
}
