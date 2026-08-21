import type {
  PopupRequest,
  PopupResponse,
  SetCsdnMarkdownRequest,
  SetCsdnMarkdownResponse,
  SetSegmentFaultMarkdownRequest,
  SetSegmentFaultMarkdownResponse,
  UploadBilibiliImageRequest,
  UploadBilibiliImageResponse
} from "../lib/messages";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { connect } from "../background/bridge";
import { cancelJob, enqueueJob } from "../background/job-orchestrator";
import { uploadBilibiliImageInMainWorld } from "../background/main-world/bilibili";
import { setCsdnMarkdownInMainWorld } from "../background/main-world/csdn";
import { setSegmentFaultMarkdownInMainWorld } from "../background/main-world/segmentfault";
import { handlePopupRequest } from "../background/popup";

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  browser.runtime.onMessage.addListener(
    (
      request:
        | PopupRequest
        | SetCsdnMarkdownRequest
        | SetSegmentFaultMarkdownRequest
        | UploadBilibiliImageRequest,
      sender,
      sendResponse
    ): true => {
      const response =
        request.type === "crosspost:set-csdn-markdown"
          ? setCsdnMarkdownInMainWorld(sender.tab?.id, request)
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
          | SetSegmentFaultMarkdownResponse
          | UploadBilibiliImageResponse);
      });
      return true;
    }
  );
  browser.runtime.onStartup.addListener(() => {
    void connect({ cancelJob, enqueueJob });
  });
  void connect({ cancelJob, enqueueJob });
});
