import type {
  PopupRequest,
  PopupResponse,
  SetCsdnMarkdownRequest,
  SetCsdnMarkdownResponse,
  SetJuejinMarkdownRequest,
  SetJuejinMarkdownResponse,
  SetSegmentFaultMarkdownRequest,
  SetSegmentFaultMarkdownResponse,
  SetZhihuRichTextRequest,
  SetZhihuRichTextResponse,
  UploadBilibiliImageRequest,
  UploadBilibiliImageResponse
} from "../lib/messages";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { connect } from "../background/bridge";
import { cancelJob, enqueueJob } from "../background/job-orchestrator";
import { uploadBilibiliImageInMainWorld } from "../background/main-world/bilibili";
import { setCsdnMarkdownInMainWorld } from "../background/main-world/csdn";
import { setJuejinMarkdownInMainWorld } from "../background/main-world/juejin";
import { setSegmentFaultMarkdownInMainWorld } from "../background/main-world/segmentfault";
import { setZhihuRichTextInMainWorld } from "../background/main-world/zhihu";
import { handlePopupRequest } from "../background/popup";

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  browser.runtime.onMessage.addListener(
    (
      request:
        | PopupRequest
        | SetCsdnMarkdownRequest
        | SetJuejinMarkdownRequest
        | SetSegmentFaultMarkdownRequest
        | SetZhihuRichTextRequest
        | UploadBilibiliImageRequest,
      sender,
      sendResponse
    ): true => {
      const response =
        request.type === "crosspost:set-csdn-markdown"
          ? setCsdnMarkdownInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:set-juejin-markdown"
            ? setJuejinMarkdownInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:set-zhihu-rich-text"
            ? setZhihuRichTextInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:set-segmentfault-markdown"
            ? setSegmentFaultMarkdownInMainWorld(sender.tab?.id, request)
          : request.type === "crosspost:upload-bilibili-image"
            ? uploadBilibiliImageInMainWorld(sender.tab?.id, request)
          : handlePopupRequest(request);
      void response.then(sendResponse, (error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : "Extension request failed."
        } satisfies
          | PopupResponse
          | SetCsdnMarkdownResponse
          | SetJuejinMarkdownResponse
          | SetSegmentFaultMarkdownResponse
          | SetZhihuRichTextResponse
          | UploadBilibiliImageResponse);
      });
      return true;
    }
  );
  // The top-level connect below already runs on every service-worker start,
  // including browser startup; an onStartup listener would connect twice.
  void connect({
    cancelJob,
    enqueueJob: (job) => {
      void enqueueJob(job);
    }
  });
});
